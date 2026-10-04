import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VerificationInput } from '@verifikasi/chain/server';
import { OCR_CONFIG, OCR_CONFIG_HASH } from '@verifikasi/ocr';
import type { Extraction, Session, State } from '../../src/server/types';

const chain = vi.hoisted(() => ({ lookupCredential: vi.fn(), submitComparison: vi.fn(), readComparison: vi.fn(), verifyAttributes: vi.fn(), resumeComparisonTransaction: vi.fn() }));
const record = vi.hoisted(() => ({ verifyRecord: vi.fn() }));
const runtime = vi.hoisted(() => ({ start: vi.fn(), state: { sessions: {}, jobs: {}, rates: {}, audit: [] } as State }));
const ocr = vi.hoisted(() => ({ extractDocument: vi.fn() }));
vi.mock('@verifikasi/chain/server', () => chain);
vi.mock('../../src/server/credentials', () => record);
vi.mock('workflow/api', () => runtime);
vi.mock('@verifikasi/ocr', async original => ({ ...await original<typeof import('@verifikasi/ocr')>(), ...ocr }));
vi.mock('../../src/server/store', async importOriginal => ({ ...await importOriginal<typeof import('../../src/server/store')>(), withState: async (action: (state: State) => unknown) => action(runtime.state), withRelayerLock: async (action: (lease: { assertHeld: () => Promise<void> }) => Promise<unknown>) => action({ assertHeld: async () => {} }) }));

import { createJob, eraseJob, readJob } from '../../src/server/jobs';
import { withState } from '../../src/server/store';
import { getPrivate, putPrivate } from '../../src/server/storage';
import { dispatchVerification } from '../../src/server/dispatch';
import { claimWorkflowRun, extractHosted, submitHosted, concludeHosted, failHosted } from '../../src/server/workflow-jobs';

let directory: string;
const owner: Session = { id: 'owner', csrf: 'csrf', expiresAt: new Date(Date.now() + 86400_000).toISOString() };
const credentialId = `0x${'ab'.repeat(32)}`;
const generation = 'a'.repeat(64);
const extraction: Extraction = {
  qrCandidates: [`http://localhost:3000/c/${credentialId}`], qrPage: 1, pageCount: 1, templateId: 'synthetic-A1',
  ocrConfigHash: OCR_CONFIG_HASH, ocrConfigVersion: OCR_CONFIG.version, dateFormat: 'DMY',
  fields: Object.fromEntries(Object.entries({ full_name: 'CONTOH NAMA', diploma_number: 'IF-2026-001', study_program: 'INFORMATIKA', graduation_date: '15 Agustus 2026' }).map(([key, text]) => [key, { text, confidence: 0.99, page: 1 }])),
};
const previousExtraction: Extraction = { ...extraction, ocrConfigHash: `0x${'cd'.repeat(32)}`, ocrConfigVersion: 'tesseract-js-ind-eng-v5' };
async function jobFixture(key = 'workflow-test-123456') {
  const body = new FormData(); body.append('file', new Blob(['%PDF-1.7\nsynthetic'], { type: 'application/pdf' }), 'test.pdf');
  const job = await createJob(new Request('http://localhost:3000/api/verifications', { method: 'POST', headers: { 'idempotency-key': key }, body }), owner);
  await withState(state => Object.assign(state.jobs[job.id]!, { workflowToken: generation, leaseToken: generation, leaseUntil: job.expiresAt }));
  return job;
}
async function storeExtraction(id: string, observed = extraction) {
  await putPrivate(id, 'ocr.json', Buffer.from(JSON.stringify(observed)));
  await withState(state => Object.assign(state.jobs[id]!, { ocrConfigHash: observed.ocrConfigHash, ocrConfigVersion: observed.ocrConfigVersion, status: 'AWAITING_CHAIN' }));
}
beforeEach(async () => {
  vi.resetAllMocks();
  runtime.state = { sessions: {}, jobs: {}, rates: {}, audit: [] };
  directory = await mkdtemp(join(tmpdir(), 'workflow-test-'));
  vi.stubEnv('PRIVATE_DATA_DIR', directory); vi.stubEnv('APP_MODE', 'demo'); vi.stubEnv('APP_ORIGIN', 'http://localhost:3000');
  for (const key of ['VERCEL', 'DATABASE_URL', 'S3_BUCKET', 'BLOB_READ_WRITE_TOKEN']) vi.stubEnv(key, '');
  record.verifyRecord.mockResolvedValue({ credentialId, recordVerificationStatus: 'VERIFIED_RECORD', issuerName: 'Kampus Contoh',
    chainId: 11155111, checkedBlock: 100, checkedAt: new Date().toISOString(), issuanceTxHash: `0x${'12'.repeat(32)}` });
});
afterEach(async () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); await rm(directory, { recursive: true, force: true }); });

describe('durable verification jobs', () => {
  it('allows only one run to execute a generation after duplicate enqueue', async () => {
    const job = await jobFixture();
    expect(await claimWorkflowRun(job.id, generation, 'run-first')).toBe(true);
    expect(await claimWorkflowRun(job.id, generation, 'run-duplicate')).toBe(false);
    expect(await claimWorkflowRun(job.id, generation, 'run-first')).toBe(true);
  });
  it('persists dispatch intent, recovers queue failure and suppresses acknowledged duplicates', async () => {
    const job = await jobFixture();
    runtime.start.mockRejectedValueOnce(new Error('private upstream details')).mockResolvedValue({ runId: 'run-1' });
    await expect(dispatchVerification(job.id)).rejects.toMatchObject({ code: 'DISPATCH_UNAVAILABLE' });
    await dispatchVerification(job.id); await dispatchVerification(job.id);
    expect(runtime.start).toHaveBeenCalledTimes(2);
    expect(runtime.start.mock.calls[1]![1]).toEqual([job.id, generation]);
    expect(await withState(state => state.jobs[job.id]!.workflowRunId)).toBe('run-1');
  });
  it('does not overwrite a run that claimed the job during a lost enqueue acknowledgement', async () => {
    const job = await jobFixture();
    runtime.start.mockImplementation(async () => {
      await claimWorkflowRun(job.id, generation, 'run-original');
      return { runId: 'run-duplicate' };
    });
    await dispatchVerification(job.id);
    expect(await claimWorkflowRun(job.id, generation, 'run-duplicate')).toBe(false);
    expect(await withState(state => state.jobs[job.id]!.workflowRunId)).toBe('run-original');
  });
  it('runs OCR in process on the stored upload and retries from the stored result without another OCR call', async () => {
    const job = await jobFixture(); ocr.extractDocument.mockResolvedValue(extraction);
    expect(await extractHosted(job.id, generation)).toBe(true);
    expect(await extractHosted(job.id, generation)).toBe(true);
    expect(ocr.extractDocument).toHaveBeenCalledTimes(1);
    const [bytes, mime] = ocr.extractDocument.mock.calls[0]!;
    expect(Buffer.from(bytes as Uint8Array).toString()).toBe('%PDF-1.7\nsynthetic');
    expect(mime).toBe('application/pdf');
    expect(JSON.parse((await getPrivate(job.id, 'ocr.json')).toString())).toEqual(extraction);
  });
  it('re-extracts a previous configuration from the original upload before any transaction exists', async () => {
    const job = await jobFixture();
    await storeExtraction(job.id, previousExtraction);
    ocr.extractDocument.mockResolvedValue(extraction);
    expect(await extractHosted(job.id, generation)).toBe(true);
    expect(ocr.extractDocument).toHaveBeenCalledTimes(1);
    const [bytes, mime] = ocr.extractDocument.mock.calls[0]!;
    expect(Buffer.from(bytes as Uint8Array).toString()).toBe('%PDF-1.7\nsynthetic');
    expect(mime).toBe('application/pdf');
    expect(JSON.parse((await getPrivate(job.id, 'ocr.json')).toString())).toEqual(extraction);
    expect(runtime.state.jobs[job.id]).toMatchObject({ ocrConfigHash: OCR_CONFIG_HASH, ocrConfigVersion: OCR_CONFIG.version, status: 'AWAITING_CHAIN' });
    expect(chain.submitComparison).not.toHaveBeenCalled();
  });
  it('submits a resumed previous-config job only after re-extracting and binding the current hash', async () => {
    const job = await jobFixture();
    await storeExtraction(job.id, previousExtraction);
    ocr.extractDocument.mockResolvedValue(extraction);
    vi.stubEnv('APP_MODE', 'testnet');
    chain.submitComparison.mockImplementation(async (input: VerificationInput) => {
      expect(input.ocrConfigHash).toBe(OCR_CONFIG_HASH);
      expect(input.attributes.full_name).toBe('CONTOH NAMA');
      await input.onTransaction!('current-transaction');
      return 'current-transaction';
    });
    expect(await submitHosted(job.id, generation)).toBe(true);
    expect(ocr.extractDocument).toHaveBeenCalledTimes(1);
    expect(chain.submitComparison).toHaveBeenCalledTimes(1);
    expect(runtime.state.jobs[job.id]).toMatchObject({ ocrConfigHash: OCR_CONFIG_HASH, ocrConfigVersion: OCR_CONFIG.version, txHash: 'current-transaction' });
    expect(JSON.parse((await getPrivate(job.id, 'ocr.json')).toString())).toEqual(extraction);
  });
  it('skips OCR for a stored current-config result during direct submission', async () => {
    const job = await jobFixture();
    await storeExtraction(job.id);
    vi.stubEnv('APP_MODE', 'testnet');
    chain.submitComparison.mockImplementation(async (input: VerificationInput) => { await input.onTransaction!('current-transaction'); return 'current-transaction'; });
    expect(await extractHosted(job.id, generation)).toBe(true);
    expect(await submitHosted(job.id, generation)).toBe(true);
    expect(ocr.extractDocument).not.toHaveBeenCalled();
    expect(chain.submitComparison.mock.calls[0]![0].ocrConfigHash).toBe(OCR_CONFIG_HASH);
  });
  it('recovers a previous-config prepared transaction without replacing its OCR or hash', async () => {
    const job = await jobFixture();
    await storeExtraction(job.id, previousExtraction);
    const storedOcr = await getPrivate(job.id, 'ocr.json');
    const tx = { hash: 'previous-transaction', serialized: 'previous-signed-fixture' };
    await putPrivate(job.id, 'transaction.json', Buffer.from(JSON.stringify(tx)));
    await withState(state => Object.assign(state.jobs[job.id]!, { txHash: tx.hash, credentialId }));
    vi.stubEnv('APP_MODE', 'testnet');
    chain.submitComparison.mockImplementation(async (input: VerificationInput) => {
      expect(input.ocrConfigHash).toBe(previousExtraction.ocrConfigHash);
      expect(input.transactionHash).toBe(tx.hash);
      expect(input.serializedTransaction).toBe(tx.serialized);
      await input.beforeBroadcast!(); await input.onTransaction!(tx.hash);
      return tx.hash;
    });
    expect(await extractHosted(job.id, generation)).toBe(true);
    expect(await submitHosted(job.id, generation)).toBe(true);
    expect(ocr.extractDocument).not.toHaveBeenCalled();
    expect(chain.submitComparison).toHaveBeenCalledTimes(1);
    expect(await getPrivate(job.id, 'ocr.json')).toEqual(storedOcr);
    expect(runtime.state.jobs[job.id]).toMatchObject({ ocrConfigHash: previousExtraction.ocrConfigHash, ocrConfigVersion: previousExtraction.ocrConfigVersion, txHash: tx.hash, txBroadcasted: true });
    expect(JSON.parse((await getPrivate(job.id, 'transaction.json')).toString())).toEqual(tx);
  });
  it('does not re-extract or resubmit a previous-config broadcast transaction', async () => {
    const job = await jobFixture();
    await storeExtraction(job.id, previousExtraction);
    await withState(state => Object.assign(state.jobs[job.id]!, { status: 'AWAITING_DECRYPTION', txHash: 'previous-transaction', txBroadcasted: true }));
    expect(await extractHosted(job.id, generation)).toBe(true);
    expect(await submitHosted(job.id, generation)).toBe(true);
    expect(ocr.extractDocument).not.toHaveBeenCalled();
    expect(chain.submitComparison).not.toHaveBeenCalled();
    expect(JSON.parse((await getPrivate(job.id, 'ocr.json')).toString())).toEqual(previousExtraction);
  });
  it('retains the previous evidence if a transaction is prepared during re-extraction', async () => {
    const job = await jobFixture();
    await storeExtraction(job.id, previousExtraction);
    ocr.extractDocument.mockImplementation(async () => {
      await withState(state => { state.jobs[job.id]!.txHash = 'prepared-during-ocr'; });
      return extraction;
    });
    expect(await extractHosted(job.id, generation)).toBe(true);
    expect(JSON.parse((await getPrivate(job.id, 'ocr.json')).toString())).toEqual(previousExtraction);
    expect(runtime.state.jobs[job.id]).toMatchObject({ ocrConfigHash: previousExtraction.ocrConfigHash, ocrConfigVersion: previousExtraction.ocrConfigVersion, txHash: 'prepared-during-ocr' });
  });
  it('does not alter a terminal previous-config result', async () => {
    const job = await jobFixture();
    await storeExtraction(job.id, previousExtraction);
    await withState(state => Object.assign(state.jobs[job.id]!, { status: 'COMPLETED', decision: 'MATCH' }));
    expect(await extractHosted(job.id, generation)).toBe(false);
    expect(await submitHosted(job.id, generation)).toBe(false);
    expect(ocr.extractDocument).not.toHaveBeenCalled();
    expect(JSON.parse((await getPrivate(job.id, 'ocr.json')).toString())).toEqual(previousExtraction);
    expect(runtime.state.jobs[job.id]).toMatchObject({ status: 'COMPLETED', decision: 'MATCH', ocrConfigHash: previousExtraction.ocrConfigHash });
  });
  it('refuses to OCR bytes that no longer match the finalized digest', async () => {
    const job = await jobFixture();
    await storeExtraction(job.id, previousExtraction);
    await putPrivate(job.id, 'upload.bin', Buffer.from('%PDF-1.7\ntampered'));
    await expect(extractHosted(job.id, generation)).rejects.toThrow('DIGEST_MISMATCH');
    expect(ocr.extractDocument).not.toHaveBeenCalled();
  });
  it('retries technical OCR failures but stores document faults as a result', async () => {
    const job = await jobFixture();
    ocr.extractDocument.mockResolvedValueOnce({ ...extraction, fields: {}, qrCandidates: [], errorCode: 'OCR_TIMEOUT' });
    await expect(extractHosted(job.id, generation)).rejects.toThrow('OCR_UNAVAILABLE');
    await expect(getPrivate(job.id, 'ocr.json')).rejects.toThrow();
    ocr.extractDocument.mockResolvedValueOnce({ ...extraction, fields: {}, qrCandidates: [], errorCode: 'PDF_PASSWORD' });
    expect(await extractHosted(job.id, generation)).toBe(true);
    expect(JSON.parse((await getPrivate(job.id, 'ocr.json')).toString()).errorCode).toBe('PDF_PASSWORD');
  });
  it('refuses to restore artifacts when a document is deleted during OCR', async () => {
    const job = await jobFixture();
    await storeExtraction(job.id, previousExtraction);
    ocr.extractDocument.mockImplementation(async () => { await eraseJob(job.id, owner.id); return extraction; });
    await expect(submitHosted(job.id, generation)).rejects.toMatchObject({ code: 'LEASE_EXPIRED' });
    await expect(getPrivate(job.id, 'ocr.json')).rejects.toThrow();
    await failHosted(job.id, generation);
    expect((await readJob(job.id, owner.id)).status).toBe('EXPIRED');
  });
  it('fences a late workflow failure after a user retry', async () => {
    const job = await jobFixture();
    await withState(state => Object.assign(state.jobs[job.id]!, { workflowToken: 'b'.repeat(64), leaseToken: 'b'.repeat(64) }));
    expect(await extractHosted(job.id, generation)).toBe(false);
    await failHosted(job.id, generation);
    expect((await readJob(job.id, owner.id)).status).toBe('RECEIVED');
  });
  it('persists signed transaction before broadcast and reuses it after interrupted submission', async () => {
    const job = await jobFixture();
    await storeExtraction(job.id);
    vi.stubEnv('APP_MODE', 'testnet');
    chain.lookupCredential.mockResolvedValue({ credentialId, issuerActive: true, revoked: false, issuerName: 'Kampus Contoh' });
    const tx = { hash: '0xtransaction', serialized: 'signed-fixture' };
    chain.submitComparison.mockImplementationOnce(async (input: VerificationInput) => { await input.onPreparedTransaction!(tx); throw new Error('connection interrupted'); });
    // The original error reaches recordWorkflowFailure, which stores only an allowlisted diagnostic code.
    await expect(submitHosted(job.id, generation)).rejects.toThrow('connection interrupted');
    chain.submitComparison.mockImplementationOnce(async (input: VerificationInput) => {
      expect(input.transactionHash).toBe(tx.hash); expect(input.serializedTransaction).toBe(tx.serialized);
      await input.beforeBroadcast!(); await input.onTransaction!(tx.hash); return tx.hash;
    });
    expect(await submitHosted(job.id, generation)).toBe(true);
    expect(await submitHosted(job.id, generation)).toBe(true);
    expect(chain.submitComparison).toHaveBeenCalledTimes(2);
  });
  it('polls without blocking then lets revocation override matching attributes', async () => {
    const job = await jobFixture();
    await putPrivate(job.id, 'ocr.json', Buffer.from(JSON.stringify(extraction)));
    await withState(state => Object.assign(state.jobs[job.id]!, { status: 'AWAITING_DECRYPTION', txHash: 'tx', credentialId }));
    chain.readComparison.mockResolvedValueOnce(null).mockResolvedValueOnce({ matches: { full_name: true, diploma_number: true, study_program: true, graduation_date: true }, metadata: { revoked: true, issuerActive: true, issuerName: 'Kampus Contoh' }, transactionHash: 'tx', checkedAt: new Date().toISOString() });
    record.verifyRecord.mockResolvedValue({ recordVerificationStatus: 'REVOKED', issuerName: 'Kampus Contoh', checkedBlock: 101, checkedAt: new Date().toISOString() });
    expect(await concludeHosted(job.id, generation)).toBe(false);
    expect(await concludeHosted(job.id, generation)).toBe(true);
    expect((await readJob(job.id, owner.id)).decision).toBe('REVOKED');
  });
  it('recovers an earlier prepared transaction before another job allocates a nonce', async () => {
    const earlier = await jobFixture('workflow-earlier-123456');
    const later = await jobFixture('workflow-later-123456');
    await putPrivate(earlier.id, 'transaction.json', Buffer.from(JSON.stringify({ hash: 'old-hash', serialized: 'old-signed' })));
    await storeExtraction(later.id);
    await withState(state => Object.assign(state.jobs[earlier.id]!, { txHash: 'old-hash', credentialId, status: 'FAILED' }));
    vi.stubEnv('APP_MODE', 'testnet');
    chain.lookupCredential.mockResolvedValue({ credentialId, issuerActive: true, revoked: false });
    const order: string[] = [];
    chain.resumeComparisonTransaction.mockImplementation(async (input: VerificationInput) => { order.push('recover'); expect(input.serializedTransaction).toBe('old-signed'); await input.beforeBroadcast!(); });
    chain.submitComparison.mockImplementation(async (input: VerificationInput) => { order.push('submit'); await input.onTransaction!('new-hash'); return 'new-hash'; });
    await submitHosted(later.id, generation);
    expect(order).toEqual(['recover', 'submit']);
    expect(await withState(state => state.jobs[earlier.id]!.txBroadcasted)).toBe(true);
  });
});
