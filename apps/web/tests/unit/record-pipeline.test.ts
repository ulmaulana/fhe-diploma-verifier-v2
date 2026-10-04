import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecordVerificationResult, RecordVerificationStatus } from '@verifikasi/domain';
import type { VerificationInput } from '@verifikasi/chain/server';
import type { Extraction, Session, State } from '../../src/server/types';

const chain = vi.hoisted(() => ({ submitComparison: vi.fn(), readComparison: vi.fn(), resumeComparisonTransaction: vi.fn() }));
const record = vi.hoisted(() => ({ verifyRecord: vi.fn() }));
const runtime = vi.hoisted(() => ({ state: { sessions: {}, jobs: {}, rates: {}, audit: [] } as State }));
vi.mock('@verifikasi/chain/server', () => chain);
vi.mock('../../src/server/credentials', () => record);
vi.mock('../../src/server/store', async original => ({ ...await original<typeof import('../../src/server/store')>(),
  withState: async (action: (state: State) => unknown) => action(runtime.state),
  withRelayerLock: async (action: (lease: { assertHeld: () => Promise<void> }) => Promise<unknown>) => action({ assertHeld: async () => {} }),
}));

import { createJob, readJob } from '../../src/server/jobs';
import { submitHosted, concludeHosted, recordWorkflowFailure } from '../../src/server/workflow-jobs';
import { getPrivate, putPrivate } from '../../src/server/storage';

const credentialId = `0x${'ab'.repeat(32)}`;
const generation = 'a'.repeat(64);
const issuanceTxHash = `0x${'12'.repeat(32)}`;
const comparisonTxHash = `0x${'34'.repeat(32)}`;
const contractAddress = `0x${'56'.repeat(20)}`;
const owner: Session = { id: 'owner', csrf: 'csrf', expiresAt: new Date(Date.now() + 86400_000).toISOString() };
const extraction: Extraction = {
  qrCandidates: [`http://localhost:3000/c/${credentialId}`], qrPage: 1, pageCount: 1, templateId: 'synthetic-A1',
  ocrConfigHash: `0x${'cd'.repeat(32)}`, ocrConfigVersion: 'test', dateFormat: 'DMY',
  fields: Object.fromEntries(Object.entries({ full_name: 'CONTOH NAMA', diploma_number: 'IF-2026-001', study_program: 'INFORMATIKA', graduation_date: '15 Agustus 2026' }).map(([key, text]) => [key, { text, confidence: 0.99, page: 1 }])),
};
function recordResult(status: RecordVerificationStatus = 'VERIFIED_RECORD', checkedBlock = 100): RecordVerificationResult {
  return { mode: 'RECORD', environment: 'testnet', scope: 'RECORD_ONLY', credentialId,
    recordVerificationStatus: status, documentDecision: null, reason: `record ${status}`, profile: null,
    issuerName: status === 'INVALID_PROOF' ? null : 'Kampus Contoh', checkedAt: new Date(1_800_000_000_000 + checkedBlock * 1000).toISOString(),
    checkedBlock, chainId: 11155111, contractAddress, issuanceTxHash, signer: null, credentialDigest: null };
}
const comparison = () => ({
  matches: { full_name: true, diploma_number: true, study_program: true, graduation_date: true }, allMatch: true,
  // Intentionally stale matching metadata: the pipeline must re-read signed proof and status.
  metadata: { issuerActive: true, revoked: false, issuerName: 'Kampus Contoh' },
  transactionHash: comparisonTxHash, chainId: 11155111, contractAddress, checkedBlock: 100,
});
let directory: string;
beforeEach(async () => {
  vi.resetAllMocks(); runtime.state = { sessions: {}, jobs: {}, rates: {}, audit: [] };
  directory = await mkdtemp(join(tmpdir(), 'record-pipeline-test-'));
  vi.stubEnv('PRIVATE_DATA_DIR', directory); vi.stubEnv('APP_MODE', 'demo'); vi.stubEnv('APP_ORIGIN', 'http://localhost:3000');
  for (const key of ['VERCEL', 'DATABASE_URL', 'S3_BUCKET', 'BLOB_READ_WRITE_TOKEN']) vi.stubEnv(key, '');
  record.verifyRecord.mockResolvedValue(recordResult());
  chain.submitComparison.mockImplementation(async (input: VerificationInput) => {
    await input.onTransaction?.(comparisonTxHash); return comparisonTxHash;
  });
  chain.readComparison.mockResolvedValue(comparison());
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(directory, { recursive: true, force: true }); });

async function fixture(observed = extraction) {
  const body = new FormData(); body.append('file', new Blob(['%PDF-1.7\nsynthetic'], { type: 'application/pdf' }), 'test.pdf');
  const job = await createJob(new Request('http://localhost:3000/api/verifications', { method: 'POST', headers: { 'idempotency-key': 'record-pipeline-123456' }, body }), owner);
  Object.assign(runtime.state.jobs[job.id]!, { workflowToken: generation, leaseToken: generation, leaseUntil: job.expiresAt });
  vi.stubEnv('APP_MODE', 'testnet');
  await putPrivate(job.id, 'ocr.json', Buffer.from(JSON.stringify(observed)));
  await submitHosted(job.id, generation);
  return job;
}

describe('document verification requires a valid signed record', () => {
  it('preserves configuration failures through submission and stores only their safe category', async () => {
    const error = Object.assign(new Error('private key contents'), { code: 'CHAIN_CONFIGURATION_INVALID' });
    chain.submitComparison.mockRejectedValue(error);
    await expect(fixture()).rejects.toBe(error);
    const job = Object.values(runtime.state.jobs)[0]!;
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await recordWorkflowFailure(job.id, generation, 'FHE', error);
      expect(job.diagnosticCode).toBe('CONFIGURATION/CHAIN_CONFIGURATION_INVALID');
      expect(log.mock.calls).toEqual([[JSON.stringify({ event: 'verification_failure', stage: 'CONFIGURATION', code: 'CHAIN_CONFIGURATION_INVALID' })]]);
      expect(job.txHash).toBeUndefined();
    } finally { log.mockRestore(); }
  });

  it('explains a QR-only upload only after successfully reading the record', async () => {
    const job = await fixture({ ...extraction, fields: {}, templateId: null });
    expect(await readJob(job.id, owner.id)).toMatchObject({ decision: 'INCONCLUSIVE', reason: 'Belum dapat memverifikasi isi dokumen—unggah PDF ijazah lengkap', credentialId });
    expect(chain.submitComparison).not.toHaveBeenCalled();
  });
  it('keeps a QR-only upload as ERROR when reading the record fails', async () => {
    record.verifyRecord.mockResolvedValue(recordResult('ERROR'));
    const job = await fixture({ ...extraction, fields: {}, templateId: null });
    expect(await readJob(job.id, owner.id)).toMatchObject({ decision: 'ERROR', recordVerificationStatus: 'ERROR' });
  });
  it.each([
    ['INVALID_PROOF', 'INVALID_PROOF'], ['PENDING', 'INCONCLUSIVE'], ['ISSUER_INACTIVE', 'INCONCLUSIVE'],
    ['REVOKED', 'REVOKED'], ['NOT_FOUND', 'NOT_FOUND'], ['ERROR', 'ERROR'],
  ] as const)('does not submit FHE for %s records', async (status, decision) => {
    record.verifyRecord.mockResolvedValue(recordResult(status));
    const job = await fixture();
    const result = await readJob(job.id, owner.id);
    expect(result).toMatchObject({ decision, recordVerificationStatus: status });
    expect(result.txHash).toBeUndefined();
    expect(chain.submitComparison).not.toHaveBeenCalled();
    expect(chain.readComparison).not.toHaveBeenCalled();
    const fields = JSON.parse((await getPrivate(job.id, 'result.json')).toString()).fields as { status: string }[];
    expect(fields.every(field => field.status === 'NOT_COMPARED')).toBe(true);
  });

  it.each([
    ['REVOKED', 'REVOKED'], ['INVALID_PROOF', 'INVALID_PROOF'], ['ISSUER_INACTIVE', 'INCONCLUSIVE'], ['PENDING', 'INCONCLUSIVE'],
  ] as const)('lets final %s override four matching FHE attributes', async (status, decision) => {
    record.verifyRecord.mockResolvedValueOnce(recordResult()).mockResolvedValueOnce(recordResult(status, 207));
    const job = await fixture();
    expect(await concludeHosted(job.id, generation)).toBe(true);
    const result = await readJob(job.id, owner.id);
    expect(result).toMatchObject({ decision, recordVerificationStatus: status, checkedBlock: 207,
      checkedAt: recordResult(status, 207).checkedAt, txHash: comparisonTxHash, issuanceTxHash });
    expect(record.verifyRecord).toHaveBeenCalledTimes(2);
    const fields = JSON.parse((await getPrivate(job.id, 'result.json')).toString()).fields as { status: string }[];
    expect(fields.every(field => field.status === 'NOT_COMPARED')).toBe(true);
  });

  it('only reports MATCH after rechecking the signed record and preserves distinct transaction references', async () => {
    record.verifyRecord.mockResolvedValueOnce(recordResult()).mockResolvedValueOnce(recordResult('VERIFIED_RECORD', 208));
    const job = await fixture();
    await concludeHosted(job.id, generation);
    expect(await readJob(job.id, owner.id)).toMatchObject({ decision: 'MATCH', recordVerificationStatus: 'VERIFIED_RECORD',
      txHash: comparisonTxHash, issuanceTxHash, checkedBlock: 208 });
    expect(record.verifyRecord).toHaveBeenCalledTimes(2);
  });

  it('keeps poor OCR inconclusive even when the record is verified', async () => {
    const poor = { ...extraction, fields: { ...extraction.fields, full_name: { text: 'CONTOH', confidence: 0.4, page: 1 } } };
    const job = await fixture(poor);
    expect(await readJob(job.id, owner.id)).toMatchObject({ decision: 'INCONCLUSIVE', recordVerificationStatus: 'VERIFIED_RECORD' });
    expect((await readJob(job.id, owner.id)).reason).toContain('Nama lengkap:');
    expect(chain.submitComparison).not.toHaveBeenCalled();
  });

  it('ends with ERROR and sends no comparison when the global relayer budget is exhausted (S-08)', async () => {
    vi.stubEnv('MAX_COMPARISONS_PER_HOUR', '0');
    const job = await fixture();
    expect(await readJob(job.id, owner.id)).toMatchObject({ status: 'FAILED', decision: 'ERROR', recordVerificationStatus: 'VERIFIED_RECORD' });
    expect((await readJob(job.id, owner.id)).reason).toContain('Kuota transaksi pencocokan');
    expect(chain.submitComparison).not.toHaveBeenCalled();
    // The QR record path is independent of the relayer budget.
    expect(record.verifyRecord).toHaveBeenCalledTimes(1);
  });

  it('returns the reservation when submission fails before a transaction is prepared', async () => {
    vi.stubEnv('MAX_COMPARISONS_PER_HOUR', '1');
    chain.submitComparison.mockRejectedValueOnce(Object.assign(new Error('insufficient funds'), { code: 'INSUFFICIENT_FUNDS' }));
    await expect(fixture()).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
    expect(runtime.state.relayerBudget?.jobs).toEqual([]);
    const [only] = Object.values(runtime.state.jobs);
    await submitHosted(only!.id, generation);
    expect(chain.submitComparison).toHaveBeenCalledTimes(2);
    expect(runtime.state.relayerBudget?.jobs).toEqual([only!.id]);
  });
});
