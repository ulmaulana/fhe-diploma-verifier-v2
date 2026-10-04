import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { releaseComparison, reserveComparison } from '../../src/server/relayer-budget';
import { withState } from '../../src/server/store';
import type { Job, State } from '../../src/server/types';

const job = (id: string, patch: Partial<Job> = {}): Job => ({ id, owner: 'o', idempotencyKey: id, status: 'AWAITING_CHAIN', fileName: 'f.pdf', fileSize: 1,
  mimeType: 'application/pdf', createdAt: '', expiresAt: '2099-01-01T00:00:00.000Z', artifactsExpireAt: '2099-01-01T00:00:00.000Z', mode: 'testnet',
  synthetic: false, attempts: 0, ...patch });
const empty = (): State => ({ sessions: {}, jobs: {}, rates: {}, audit: [] });
const ids = (count: number) => Array.from({ length: count }, (_, index) => `0x${String(index + 1).padStart(64, '0')}`);

describe('global relayer budget (S-08)', () => {
  it('reserves up to the limit, reuses a retry of the same job and refuses the next job', () => {
    const state = empty(); const [a, b, c] = ids(3);
    for (const id of [a!, b!, c!]) state.jobs[id] = job(id);
    reserveComparison(state, a!, 1_000, 2);
    expect(reserveComparison(state, a!, 1_000, 2)).toMatchObject({ reused: true, used: 1 });
    reserveComparison(state, b!, 1_000, 2);
    expect(() => reserveComparison(state, c!, 1_000, 2)).toThrow(expect.objectContaining({ code: 'COMPARISON_BUDGET_EXHAUSTED', status: 429 }));
    expect(state.relayerBudget!.jobs).toEqual([a, b]);
  });

  it('returns reservations without a transaction, keeps prepared ones and resets after the window', () => {
    const state = empty(); const [a, b, c, d] = ids(4);
    for (const id of [a!, b!, c!, d!]) state.jobs[id] = job(id);
    reserveComparison(state, a!, 0, 3); reserveComparison(state, b!, 0, 3); reserveComparison(state, c!, 0, 3);
    state.jobs[a!]!.txHash = '0xprepared';
    releaseComparison(state, a!); // prepared transaction: stays counted
    releaseComparison(state, b!); // failed before broadcast: returned
    state.jobs[c!]!.deletedAt = new Date().toISOString(); // deleted without a transaction: pruned on next reserve
    reserveComparison(state, d!, 0, 3);
    expect(state.relayerBudget!.jobs).toEqual([a, d]);
    reserveComparison(state, b!, 3_600_001, 3);
    expect(state.relayerBudget!.jobs).toEqual([b]);
  });

  describe('atomic reservation through the real state lock', () => {
    let directory: string;
    beforeEach(async () => {
      directory = await mkdtemp(join(tmpdir(), 'relayer-budget-'));
      vi.stubEnv('PRIVATE_DATA_DIR', directory); vi.stubEnv('APP_MODE', 'demo');
      for (const key of ['DATABASE_URL', 'VERCEL', 'NETLIFY', 'SITE_ID']) vi.stubEnv(key, '');
    });
    afterEach(async () => { vi.unstubAllEnvs(); await rm(directory, { recursive: true, force: true }); });

    it('admits exactly the budget when twelve jobs reserve concurrently', async () => {
      const jobs = ids(12);
      await withState(state => { for (const id of jobs) state.jobs[id] = job(id); });
      const results = await Promise.allSettled(jobs.map(id => withState(state => reserveComparison(state, id, Date.now(), 3))));
      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(3);
      expect(results.filter(result => result.status === 'rejected').every(result => (result as PromiseRejectedResult).reason.code === 'COMPARISON_BUDGET_EXHAUSTED')).toBe(true);
      expect(await withState(state => state.relayerBudget!.jobs.length)).toBe(3);
    });
  });
});
