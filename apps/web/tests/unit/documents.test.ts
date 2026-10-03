import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../../src/server/types';

const mocks = vi.hoisted(() => ({ getIssuer: vi.fn(), inspectCredential: vi.fn(), verifyRecord: vi.fn(), readStoredCredential: vi.fn(), readStoredCredentials: vi.fn(), dispatch: vi.fn() }));
vi.mock('@verifikasi/chain/server', () => ({ getIssuer: mocks.getIssuer }));
vi.mock('../../src/server/credentials', () => ({ credentialId: (id: string) => id.toLowerCase(), inspectCredential: mocks.inspectCredential, verifyRecord: mocks.verifyRecord }));
vi.mock('../../src/server/credentials-repository', () => ({ readStoredCredential: mocks.readStoredCredential, readStoredCredentials: mocks.readStoredCredentials }));
vi.mock('../../src/server/dispatch', () => ({ dispatchVerification: mocks.dispatch }));
vi.mock('@verifikasi/ocr', () => ({ extractDocument: () => { throw new Error('Issuer PDF must not run OCR'); } }));
import { createDocument, documentStatus, downloadDocument, portalDocuments } from '../../src/server/documents';
import { readDocument } from '../../src/server/documents-repository';
import { cleanup } from '../../src/server/jobs';
import { mutateDocument } from '../../src/server/documents-repository';
import * as diploma from '../../src/server/diploma-pdf';
import { withState } from '../../src/server/store';
import * as storage from '../../src/server/storage';
import { hashToken } from '../../src/server/http';
import { POST, GET } from '../../src/app/api/credentials/[id]/document/route';

const id = `0x${'ab'.repeat(32)}`;
const issuerId = `0x${'cd'.repeat(32)}`;
const owner: Session = { id: 'owner', csrf: 'csrf', wallet: `0x${'12'.repeat(20)}`, expiresAt: new Date(Date.now() + 86400_000).toISOString() };
const profile = { schemaVersion: 1, disclosurePolicyVersion: 1, issuerId, issuerDisplayName: 'Universitas Contoh', fullName: 'ANDI PRATAMA', diplomaNumber: 'IF-2026-001', studyProgram: 'INFORMATIKA' };
const request = (key = 'document-test-123456') => new Request('http://localhost:3000/api/credentials/' + id + '/document', { headers: { 'idempotency-key': key } });
let directory: string;
beforeEach(async () => {
  vi.resetAllMocks();
  directory = await mkdtemp(join(tmpdir(), 'diploma-archive-test-'));
  vi.stubEnv('PRIVATE_DATA_DIR', directory); vi.stubEnv('APP_MODE', 'demo'); vi.stubEnv('APP_ORIGIN', 'http://localhost:3000');
  for (const key of ['VERCEL', 'NETLIFY', 'SITE_ID', 'URL', 'STORAGE_PROVIDER', 'DATABASE_URL', 'S3_BUCKET', 'BLOB_READ_WRITE_TOKEN']) vi.stubEnv(key, '');
  mocks.getIssuer.mockResolvedValue({ exists: true, active: true, signerActive: true, issuerId });
  mocks.readStoredCredential.mockResolvedValue({ signed: { authorization: { issuerId } } });
  mocks.readStoredCredentials.mockImplementation(async (ids: string[]) => new Map(ids.map(value => [value, { signed: { authorization: { issuerId } } }])));
  mocks.inspectCredential.mockResolvedValue({ verification: { recordVerificationStatus: 'VERIFIED_RECORD' }, signedCredential: { profile } });
  mocks.verifyRecord.mockResolvedValue({ recordVerificationStatus: 'VERIFIED_RECORD' });
});
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); await rm(directory, { recursive: true, force: true }); });
async function issue() {
  await createDocument(request(), owner, id, { graduationDate: '2026-08-15' });
  return (await readDocument(id))!;
}

describe('issuer PDF lifecycle, independent of OCR (real PDF and storage)', () => {
  it('archives and downloads the issuer PDF without OCR, a queue or a comparison job', async () => {
    const doc = await issue();
    expect(doc).toMatchObject({ status: 'READY', generationMethod: 'ISSUER_DATA', dateSource: 'ISSUER_DECLARATION' });
    const response = await downloadDocument(owner, id);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');
    expect(await withState(state => Object.keys(state.jobs))).toEqual([]);
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
  it('uses the private issuance date and rejects replacement from a PDF request', async () => {
    mocks.readStoredCredential.mockResolvedValue({ documentDate: '2027-03-09', signed: { authorization: { issuerId } } });
    expect(await documentStatus(owner, id)).toMatchObject({ status: 'NOT_CREATED', graduationDate: '2027-03-09', dateFrozen: true });
    await expect(createDocument(request(), owner, id, { graduationDate: '2020-01-01' })).rejects.toMatchObject({ code: 'DOCUMENT_DATE_MISMATCH' });
    const generate = vi.spyOn(diploma, 'generateDiploma');
    expect(await createDocument(request(), owner, id, {})).toMatchObject({ status: 'READY' });
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ profile, graduationDate: '2027-03-09' }));
    expect(await readDocument(id)).toMatchObject({ dateSource: 'ISSUANCE_DRAFT' });
    await expect(createDocument(request(), owner, id, { fullName: 'Injected', graduationDate: '2027-03-09' })).rejects.toMatchObject({ code: 'INVALID_DOCUMENT_REQUEST' });
  });
  it('deduplicates concurrent generation and preserves the archive across login, cleanup and new dates', async () => {
    await Promise.all([
      createDocument(request(), owner, id, { graduationDate: '2026-08-15' }),
      createDocument(request('another-key-123456'), { ...owner, id: 'new-session' }, id, { graduationDate: '2026-08-15' }),
    ]);
    const ready = await readDocument(id);
    const bytes = Buffer.from(await (await downloadDocument(owner, id)).arrayBuffer());
    await cleanup();
    await createDocument(request('another-key-123456'), owner, id, { graduationDate: '2020-01-01' });
    expect(await readDocument(id)).toEqual(ready);
    expect(Buffer.from(await (await downloadDocument({ ...owner, id: 'new-login' }, id)).arrayBuffer())).toEqual(bytes);
    expect(await withState(state => Object.keys(state.jobs))).toEqual([]);
  });
  it.each(['INCONCLUSIVE', 'MISMATCH', 'ERROR', 'DISPATCH_UNAVAILABLE'])('recovers a legacy %s PDF without reusing or falsifying its OCR result', async errorCode => {
    const legacyId = '0x' + '11'.repeat(32);
    const legacy = { credentialId: id, issuerId, jobId: legacyId, ownerSessionId: owner.id, idempotencyKey: 'legacy-key-12345678', graduationDate: '2026-08-15', createdAt: new Date().toISOString(), status: 'FAILED' as const, templateVersion: 'issued-diploma-v1', errorCode };
    await mutateDocument(id, legacy, previous => previous);
    expect(await documentStatus(owner, id)).toMatchObject({ status: 'FAILED', errorCode: 'PDF_RECREATE_REQUIRED' });
    const ready = await issue();
    expect(ready.status).toBe('READY'); expect(ready.jobId).not.toBe(legacyId);
    // Legacy worker completion cannot alter the replacement generation.
    const { completeDocument } = await import('../../src/server/document-archive');
    await completeDocument({ id: legacyId, archiveCredentialId: id } as import('../../src/server/types').Job, { status: 'COMPLETED', decision: 'INCONCLUSIVE' });
    expect(await readDocument(id)).toEqual(ready);
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
  it('retries storage failure with the same PDF and origin, without any verification job', async () => {
    const save = vi.spyOn(storage, 'putArchive').mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(issue()).rejects.toMatchObject({ code: 'PDF_UNAVAILABLE' });
    const failed = (await readDocument(id))!;
    expect(failed.status).toBe('FAILED');
    await expect(downloadDocument(owner, id)).rejects.toMatchObject({ code: 'DOCUMENT_NOT_READY' });
    await expect(createDocument(request('other-key-12345678'), owner, id, { graduationDate: '2026-08-16' })).rejects.toMatchObject({ code: 'DOCUMENT_FROZEN' });
    vi.stubEnv('APP_ORIGIN', 'https://new-domain.example');
    const ready = await issue();
    expect(ready).toMatchObject({ status: 'READY', jobId: failed.jobId, pdfHash: failed.pdfHash, origin: failed.origin });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[0]![2]).toEqual(save.mock.calls[1]![2]);
    expect(await withState(state => Object.keys(state.jobs))).toEqual([]);
  });
  it.each(['REVOKED', 'INVALID_PROOF', 'ISSUER_INACTIVE', 'PENDING', 'ERROR'])('blocks generation for %s records', async recordVerificationStatus => {
    mocks.inspectCredential.mockResolvedValue({ verification: { recordVerificationStatus, reason: 'Record unavailable' }, signedCredential: null });
    await expect(issue()).rejects.toMatchObject({ code: recordVerificationStatus });
    expect(await readDocument(id)).toBeNull();
  });
  it('checks revocation during archiving and again before downloading', async () => {
    const valid = { verification: { recordVerificationStatus: 'VERIFIED_RECORD' }, signedCredential: { profile } };
    const revoked = { verification: { recordVerificationStatus: 'REVOKED', reason: 'Dicabut' }, signedCredential: { profile } };
    mocks.inspectCredential.mockResolvedValueOnce(valid).mockResolvedValueOnce(revoked);
    await expect(issue()).rejects.toMatchObject({ code: 'REVOKED' });
    expect((await readDocument(id))?.status).toBe('FAILED');
    mocks.inspectCredential.mockResolvedValue(valid);
    await issue();
    mocks.inspectCredential.mockResolvedValue(revoked);
    await expect(downloadDocument(owner, id)).rejects.toMatchObject({ code: 'REVOKED' });
  });
  it('blocks anonymous, inactive and cross-institution access', async () => {
    await issue();
    for (const operation of [documentStatus, downloadDocument]) {
      await expect(operation({ ...owner, wallet: undefined }, id)).rejects.toMatchObject({ status: 401 });
      mocks.getIssuer.mockResolvedValueOnce({ exists: true, active: true, signerActive: false, issuerId });
      await expect(operation(owner, id)).rejects.toMatchObject({ status: 403 });
      mocks.getIssuer.mockResolvedValueOnce({ exists: true, active: true, signerActive: true, issuerId: '0x' + 'ef'.repeat(32) });
      await expect(operation(owner, id)).rejects.toMatchObject({ status: 404 });
    }
  });
  it('enforces session and CSRF at the API boundary', async () => {
    const context = { params: Promise.resolve({ id }) };
    expect((await GET(request(), context)).status).toBe(401);
    const token = 'ab'.repeat(32);
    await withState(state => { state.sessions[hashToken(token)] = { ...owner, id: hashToken(token) }; });
    const headers = { cookie: `verifikasi_session=${token}`, origin: 'http://localhost:3000', 'content-type': 'application/json', 'idempotency-key': 'document-csrf-test-1234' };
    const post = (extra = {}) => new Request(request().url, { method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify({ graduationDate: '2026-08-15' }) });
    expect((await POST(post(), context)).status).toBe(403);
    expect((await POST(post({ 'x-csrf-token': owner.csrf, origin: 'https://foreign.invalid' }), context)).status).toBe(403);
    expect((await POST(post({ 'x-csrf-token': owner.csrf }), context)).status).toBe(202);
  });
});

describe('portal document statuses', () => {
  const fresh = `0x${'a1'.repeat(32)}`; const foreign = `0x${'a2'.repeat(32)}`; const unknown = `0x${'a3'.repeat(32)}`;
  const active = { issuerId, exists: true, active: true, signerActive: true };
  const row = (credentialId: string, revoked = false) => ({ credentialId, revoked });

  it('loads every row at once without an issuer lookup per credential', async () => {
    await issue();
    mocks.readStoredCredentials.mockImplementation(async (ids: string[]) => new Map(ids.flatMap(value => value === unknown ? [] :
      [[value, { signed: { authorization: { issuerId: value === foreign ? `0x${'99'.repeat(32)}` : issuerId } } }]])));
    mocks.getIssuer.mockClear();
    const documents = await portalDocuments({ issuer: active, credentials: [row(id), row(fresh), row(foreign), row(unknown)] });
    expect(documents).toEqual({ [id]: expect.objectContaining({ status: 'READY' }), [fresh]: expect.objectContaining({ status: 'NOT_CREATED' }) });
    expect(mocks.getIssuer).not.toHaveBeenCalled();
    expect(mocks.readStoredCredentials).toHaveBeenCalledTimes(1);
  });
  it('shares statuses only with an active signer and skips revoked records', async () => {
    await issue();
    expect(await portalDocuments({ issuer: { ...active, signerActive: false }, credentials: [row(id)] })).toEqual({});
    expect(await portalDocuments({ issuer: active, credentials: [row(id, true), null] })).toEqual({});
    expect(mocks.readStoredCredentials).not.toHaveBeenCalled();
  });
  it('leaves rows to load on their own when the batch read fails', async () => {
    mocks.readStoredCredentials.mockRejectedValue(new Error('storage unavailable'));
    expect(await portalDocuments({ issuer: active, credentials: [row(id)] })).toEqual({});
  });
});
