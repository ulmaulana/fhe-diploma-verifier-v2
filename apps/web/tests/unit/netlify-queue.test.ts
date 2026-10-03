import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job, State } from '../../src/server/types';

const mocks = vi.hoisted(() => ({
  state: { jobs: {}, sessions: {}, rates: {}, audit: [] } as State,
  start: vi.fn(), cleanup: vi.fn(), extract: vi.fn(), submit: vi.fn(), conclude: vi.fn(), fail: vi.fn(), recordFailure: vi.fn(),
}));
vi.mock('../../src/server/store', () => ({ withState: async (action: (state: State) => unknown) => action(mocks.state) }));
vi.mock('../../src/server/jobs', () => ({
  accessible: (job: Job) => !job.deletedAt && !job.artifactsDeletedAt && Date.parse(job.artifactsExpireAt) > Date.now(),
  cleanup: mocks.cleanup,
}));
vi.mock('workflow/api', () => ({ start: mocks.start }));
vi.mock('../../src/workflows/verification', () => ({ verificationWorkflow: vi.fn() }));
vi.mock('../../src/server/workflow-jobs', () => ({
  extractHosted: mocks.extract, submitHosted: mocks.submit, concludeHosted: mocks.conclude,
  failHosted: mocks.fail, recordWorkflowFailure: mocks.recordFailure,
}));
import { dispatchVerification } from '../../src/server/dispatch';
import { dispatchNetlifyVerification, maintainNetlifyJobs, NETLIFY_RUN_LEASE_MS } from '../../src/server/netlify-queue';
import { runNetlifyVerification } from '../../src/server/netlify-runner';
import { maintainJobs } from '../../src/server/maintenance';

const id = `0x${'ab'.repeat(32)}`;
const generation = 'c'.repeat(64);
const fetchMock = vi.fn();
function fixture() {
  const expiry = new Date(Date.now() + 86_400_000).toISOString();
  const job: Job = { id, owner: 'owner', idempotencyKey: 'idempotency-123456', status: 'RECEIVED', fileName: 'test.pdf', fileSize: 20,
    mimeType: 'application/pdf', createdAt: new Date().toISOString(), expiresAt: expiry, artifactsExpireAt: expiry,
    mode: 'testnet', synthetic: false, attempts: 0, workflowToken: generation };
  mocks.state.jobs[id] = job;
  return job;
}
const request = (token = generation) => new Request('https://example.netlify.app/.netlify/functions/verification-background', {
  method: 'POST', body: JSON.stringify({ id, generation: token }),
});
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-27T00:00:00Z'));
  mocks.state = { jobs: {}, sessions: {}, rates: {}, audit: [] };
  vi.stubEnv('NETLIFY', 'true'); vi.stubEnv('APP_ORIGIN', 'https://example.netlify.app');
  vi.stubGlobal('fetch', fetchMock); vi.spyOn(console, 'error').mockImplementation(() => {});
  fetchMock.mockResolvedValue(new Response(null, { status: 202 }));
  mocks.extract.mockResolvedValue(true); mocks.submit.mockResolvedValue(true); mocks.conclude.mockResolvedValue(true);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('Netlify execution', () => {
  it('uses the native function, keeps job data private, and suppresses duplicate dispatch', async () => {
    fixture();
    await Promise.all([dispatchVerification(id), dispatchVerification(id)]);
    expect(mocks.start).not.toHaveBeenCalled(); expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://example.netlify.app/.netlify/functions/verification-background');
    expect(JSON.parse(options.body)).toEqual({ id, generation });
    expect(options.redirect).toBe('error');
    expect(mocks.state.jobs[id]!.workflowRunId).toBeUndefined();
  });
  it('releases dispatch on failure and does not leak raw upstream errors', async () => {
    const job = fixture(); fetchMock.mockRejectedValueOnce(new Error('private token in upstream URL'));
    await expect(dispatchVerification(id)).rejects.toMatchObject({ code: 'DISPATCH_UNAVAILABLE' });
    expect(job.dispatchLeaseUntil).toBeUndefined();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('private token');
    await dispatchVerification(id); expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('rejects a synchronous response and retries accepted but undelivered work after the lease', async () => {
    fixture(); fetchMock.mockResolvedValueOnce(new Response('wrong route', { status: 200 }));
    await expect(dispatchNetlifyVerification(id)).rejects.toMatchObject({ code: 'DISPATCH_UNAVAILABLE' });
    await dispatchNetlifyVerification(id);
    vi.advanceTimersByTime(61_000); await maintainJobs();
    expect(fetchMock).toHaveBeenCalledTimes(3); expect(mocks.cleanup).toHaveBeenCalledOnce();
  });
  it('ignores unauthenticated, malformed, stale, expired, and deleted jobs', async () => {
    const job = fixture();
    await runNetlifyVerification(request('d'.repeat(64)));
    await runNetlifyVerification(new Request('https://example.test', { method: 'POST', body: 'null' }));
    await runNetlifyVerification(new Request('https://example.test', { method: 'POST', body: '{}' }));
    job.deletedAt = new Date().toISOString(); await runNetlifyVerification(request());
    delete job.deletedAt; job.artifactsExpireAt = new Date(0).toISOString(); await runNetlifyVerification(request());
    expect(mocks.extract).not.toHaveBeenCalled(); expect(job.netlifyRunUntil).toBeUndefined();
  });
  it('allows only one overlapping delivery to OCR and submit a transaction', async () => {
    const job = fixture();
    let release!: () => void;
    mocks.extract.mockImplementationOnce(() => new Promise<boolean>(resolve => { release = () => resolve(true); }));
    const first = runNetlifyVerification(request());
    await vi.waitFor(() => expect(mocks.extract).toHaveBeenCalledOnce());
    await runNetlifyVerification(request()); await dispatchNetlifyVerification(id);
    expect(mocks.extract).toHaveBeenCalledOnce(); expect(fetchMock).not.toHaveBeenCalled();
    release(); await first;
    expect(mocks.submit).toHaveBeenCalledOnce(); expect(mocks.conclude).toHaveBeenCalledOnce();
    expect(job.netlifyRunUntil).toBeUndefined();
  });
  it('recovers a terminated function only after the platform execution window', async () => {
    const job = fixture(); job.workflowRunId = `netlify:${generation}`;
    job.netlifyRunUntil = new Date(Date.now() + NETLIFY_RUN_LEASE_MS).toISOString();
    await maintainNetlifyJobs(); expect(fetchMock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(NETLIFY_RUN_LEASE_MS + 1);
    await maintainNetlifyJobs(); expect(fetchMock).toHaveBeenCalledOnce();
    await runNetlifyVerification(request()); expect(mocks.conclude).toHaveBeenCalledOnce();
  });
  it('retries transient execution errors, then persists failure after three attempts', async () => {
    const job = fixture(); mocks.extract.mockRejectedValue(new Error('OCR unavailable'));
    for (let attempt = 0; attempt < 3; attempt++) {
      await expect(runNetlifyVerification(request())).rejects.toThrow('NETLIFY_VERIFICATION_RETRY');
      expect(job.netlifyRunUntil).toBeUndefined();
    }
    expect(mocks.recordFailure).toHaveBeenCalledTimes(3); expect(mocks.fail).toHaveBeenCalledOnce();
    expect(job.netlifyAttempts).toBe(3);
  });
  it('waits for a blockchain result and bounds polling', async () => {
    fixture(); mocks.conclude.mockResolvedValue(false);
    const run = runNetlifyVerification(request());
    await vi.runAllTimersAsync(); await run;
    expect(mocks.conclude).toHaveBeenCalledTimes(30); expect(mocks.fail).toHaveBeenCalledOnce();
  });
  it('does not clear a newer generation lease when an old invocation finishes', async () => {
    const job = fixture();
    mocks.extract.mockImplementationOnce(async () => {
      job.workflowToken = 'e'.repeat(64); job.netlifyRunUntil = '2099-01-01T00:00:00.000Z'; return false;
    });
    await runNetlifyVerification(request());
    expect(job.netlifyRunUntil).toBe('2099-01-01T00:00:00.000Z'); expect(mocks.submit).not.toHaveBeenCalled();
  });
});
