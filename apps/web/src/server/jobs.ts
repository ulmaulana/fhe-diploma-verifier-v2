import { randomBytes } from 'node:crypto';
import { createUploadCommitment, hashUpload, FIELD_KEYS } from '@verifikasi/domain';
import { ApiError, config, requireRealConfiguration } from './config';
import { audit, withState } from './store';
import { getPrivate, putPrivate, deletePrivate } from './storage';
import { clientSource, limit } from './http';
import { FIELD_LABELS, TERMINAL, type Job, type ResultField, type Session, type State } from './types';
import { cleanupUploadIntents } from './upload-intents';

export function owns(state: State, id: string, owner: string): Job {
  const job = state.jobs[id];
  if (!job || job.owner !== owner || Date.parse(job.expiresAt) <= Date.now()) throw new ApiError(404, 'JOB_NOT_FOUND', 'Pemeriksaan tidak ditemukan atau sudah kedaluwarsa.');
  return job;
}
export function accessible(job: Job) { return !job.deletedAt && !job.artifactsDeletedAt && Date.parse(job.artifactsExpireAt) > Date.now(); }

export function detectFile(bytes: Uint8Array): string | null {
  const b = Buffer.from(bytes);
  if (b.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255) return 'image/jpeg';
  return null;
}
async function boundedForm(request: Request) {
  const max = config().maxBytes + 1024 * 1024;
  if (Number(request.headers.get('content-length') || 0) > max) throw new ApiError(413, 'FILE_TOO_LARGE', 'Ukuran berkas maksimum 10 MiB.');
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) throw new ApiError(400, 'INVALID_UPLOAD', 'Unggah berkas menggunakan formulir dokumen.');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'EMPTY_UPLOAD', 'Pilih satu berkas terlebih dahulu.');
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const part = await reader.read(); if (part.done) break;
    size += part.value.length;
    if (size > max) { await reader.cancel(); throw new ApiError(413, 'FILE_TOO_LARGE', 'Ukuran berkas maksimum 10 MiB.'); }
    chunks.push(part.value);
  }
  return new Request(request.url, { method: 'POST', headers: { 'content-type': request.headers.get('content-type')! }, body: Buffer.concat(chunks) }).formData();
}
export async function createJob(request: Request, current: Session) {
  requireRealConfiguration();
  const key = request.headers.get('idempotency-key');
  if (!key || !/^[a-zA-Z0-9_-]{16,128}$/.test(key)) throw new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Kunci pengiriman tidak valid. Muat ulang halaman.');
  await cleanup();
  const form = await boundedForm(request);
  const files = form.getAll('file');
  if (files.length !== 1 || typeof files[0] === 'string' || !files[0]) throw new ApiError(400, 'ONE_FILE_REQUIRED', 'Unggah tepat satu ijazah.');
  const file = files[0];
  if (file.size === 0 || file.size > config().maxBytes) throw new ApiError(413, 'FILE_TOO_LARGE', 'Berkas harus berisi data dan maksimum 10 MiB.');
  const bytes = Buffer.from(await file.arrayBuffer());
  const mimeType = detectFile(bytes);
  if (!mimeType || (file.type && file.type !== mimeType)) throw new ApiError(415, 'INVALID_FILE_TYPE', 'Signature berkas tidak sesuai. Gunakan PDF, JPG, atau PNG.');
  const target = form.get('credentialId');
  if (target && (typeof target !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(target))) throw new ApiError(400, 'INVALID_CREDENTIAL', 'ID kredensial pada tautan tidak valid.');
  return createJobFromBytes(request, current, { bytes, name: file.name, mimeType }, typeof target === 'string' ? target.toLowerCase() : undefined);
}

/** Both multipart and direct Blob uploads enter the same trusted validation path. */
export async function createJobFromBytes(request: Request, current: Session, file: { bytes: Buffer; name: string; mimeType: string }, target?: string, intentId?: string, archive?: { credentialId: string; jobId: string }) {
  requireRealConfiguration();
  const key = request.headers.get('idempotency-key');
  if (!key || !/^[a-zA-Z0-9_-]{16,128}$/.test(key)) throw new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Kunci pengiriman tidak valid.');
  const { bytes } = file;
  if (!bytes.length || bytes.length > config().maxBytes) throw new ApiError(413, 'FILE_TOO_LARGE', 'Berkas harus berisi data dan maksimum 10 MiB.');
  const mimeType = detectFile(bytes);
  if (!mimeType || mimeType !== file.mimeType) throw new ApiError(415, 'INVALID_FILE_TYPE', 'Signature berkas tidak sesuai. Gunakan PDF, JPG, atau PNG.');
  const digest = hashUpload(bytes);
  return withState(async state => {
    const intent = intentId ? state.uploadIntents?.[intentId] : undefined;
    if (intentId && (!intent || intent.owner !== current.id || intent.idempotencyKey !== key || intent.deletedAt || Date.parse(intent.expiresAt) <= Date.now())) throw new ApiError(410, 'UPLOAD_EXPIRED', 'Unggahan sudah kedaluwarsa. Pilih berkas kembali.');
    if (intent && (intent.clientDigest !== digest || intent.fileSize !== bytes.length || intent.mimeType !== mimeType || intent.expectedCredentialId !== target)) throw new ApiError(409, 'UPLOAD_CHANGED', 'Berkas yang diterima berbeda dari berkas yang dipilih.');
    const existing = Object.values(state.jobs).find(job => job.owner === current.id && job.idempotencyKey === key);
    if (existing) {
      if (!accessible(existing)) throw new ApiError(410, 'UPLOAD_DELETED', 'Dokumen telah dihapus atau kedaluwarsa.');
      if (existing.digest !== digest || existing.expectedCredentialId !== target) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Kunci yang sama sudah dipakai untuk berkas lain.');
      if (intent) intent.jobId = existing.id;
      return existing;
    }
    if (!intent) {
      limit(state, `upload:${current.id}`, 30, 3600_000);
      // An unknown source in hosting is not lumped into one shared bucket; session, credential and global relayer limits still apply.
      const origin = clientSource(request);
      if (origin.via !== 'unknown') limit(state, `source:${origin.key}`, 100, 3600_000);
    }
    if (Object.values(state.jobs).filter(job => job.owner === current.id && !TERMINAL.includes(job.status) && !job.deletedAt).length >= config().maxActive) throw new ApiError(429, 'TOO_MANY_ACTIVE', 'Maksimum lima pemeriksaan berjalan per sesi.');
    const id = archive?.jobId || intent?.id || `0x${randomBytes(32).toString('hex')}`; const salt = `0x${randomBytes(32).toString('hex')}`;
    const now = intent?.createdAt || new Date().toISOString(); const expiresAt = new Date(Date.parse(now) + config().historyMs).toISOString();
    const job: Job = { id, owner: current.id, idempotencyKey: key, status: 'RECEIVED', fileName: file.name.replace(/[\\/\x00-\x1f]/g, '_').slice(0, 160), fileSize: bytes.length, mimeType, createdAt: now, expiresAt, artifactsExpireAt: expiresAt, digest, salt, commitment: createUploadCommitment(digest, salt), mode: config().mode, synthetic: false, attempts: 0, expectedCredentialId: target, ...(archive ? { archiveCredentialId: archive.credentialId } : {}) };
    await putPrivate(id, 'upload.bin', bytes);
    state.jobs[id] = job;
    if (intent) intent.jobId = id;
    audit(state, 'UPLOAD_ACCEPTED', id);
    return job;
  });
}
export async function publicJob(job: Job) {
  let fields: ResultField[] = FIELD_KEYS.map(key => ({ key, label: FIELD_LABELS[key], text: null, confidence: 0, status: 'NOT_COMPARED' }));
  if (accessible(job) && TERMINAL.includes(job.status)) {
    fields = await getPrivate(job.id, 'result.json').then(bytes => JSON.parse(bytes.toString()).fields as ResultField[]).catch(() => fields);
  }
  return { id: job.id, requestId: job.id, status: job.status, decision: job.decision, reason: job.reason, fileName: accessible(job) ? job.fileName : 'Dokumen telah dihapus', fileSize: job.fileSize, createdAt: job.createdAt, expiresAt: job.expiresAt, artifactsExpireAt: job.artifactsExpireAt, deletedAt: job.deletedAt, artifactsDeletedAt: job.artifactsDeletedAt, credentialId: job.credentialId, issuerName: job.issuerName, fields, mode: 'DOCUMENT' as const, environment: job.mode, scope: 'CHECKED_ATTRIBUTES' as const, recordVerificationStatus: job.recordVerificationStatus ?? null, documentDecision: job.decision ?? null, issuanceTxHash: job.issuanceTxHash ?? null, synthetic: job.synthetic, chainId: job.chainId, contractAddress: job.contractAddress, txHash: job.txHash, checkedAt: job.checkedAt, checkedBlock: job.checkedBlock, reportAvailable: accessible(job) && TERMINAL.includes(job.status) && Boolean(job.decision), verifiedPage: job.verifiedPage };
}
export async function readJob(id: string, owner: string) { await cleanup(); return withState(state => owns(state, id, owner)); }
export async function eraseJob(id: string, owner: string) {
  // Tombstone is committed before object deletion so late worker writes are refused.
  await withState(state => { const job = owns(state, id, owner); job.deletedAt ??= new Date().toISOString(); if (!TERMINAL.includes(job.status)) { job.status = 'EXPIRED'; job.reason = 'Pemeriksaan dihentikan karena dokumen dihapus.'; } for (const intent of Object.values(state.uploadIntents || {})) if (intent.jobId === id) { intent.deletedAt = job.deletedAt; intent.fileName = ''; intent.clientDigest = ''; } audit(state, 'ARTIFACTS_DELETE_REQUESTED', id); });
  await deletePrivate(id);
  await withState(state => { const job = state.jobs[id]; if (job) scrub(job); });
  await cleanupUploadIntents();
}
function scrub(job: Job) {
  job.artifactsDeletedAt = new Date().toISOString(); job.fileName = ''; delete job.digest; delete job.salt; delete job.leaseToken;
}
export async function cleanup() {
  await cleanupUploadIntents();
  const remove = await withState(state => {
    const now = Date.now();
    for (const [id, entry] of Object.entries(state.sessions)) if (Date.parse(entry.expiresAt) <= now) delete state.sessions[id];
    for (const [key, entry] of Object.entries(state.rates)) if (entry.resetAt <= now) delete state.rates[key];
    return Object.values(state.jobs).filter(job => !job.artifactsDeletedAt && (job.deletedAt || Date.parse(job.artifactsExpireAt) <= now || Date.parse(job.expiresAt) <= now)).map(job => {
      job.deletedAt ??= new Date().toISOString();
      if (!TERMINAL.includes(job.status)) { job.status = 'EXPIRED'; job.reason = 'Batas waktu pemrosesan berakhir.'; }
      return job.id;
    });
  });
  for (const id of remove) {
    await deletePrivate(id);
    await withState(state => { if (state.jobs[id]) scrub(state.jobs[id]!); });
  }
  await withState(state => { for (const [id, job] of Object.entries(state.jobs)) if (Date.parse(job.expiresAt) <= Date.now() && job.artifactsDeletedAt) delete state.jobs[id]; });
}
export async function finish(id: string, patch: Partial<Job>, fields: ResultField[], lease?: string) {
  const pending = await withState(state => { const job = state.jobs[id]; return job && accessible(job) && (lease === undefined || job.leaseToken === lease) ? { ...job } : null; });
  if (pending?.archiveCredentialId) {
    const { completeDocument } = await import('./document-archive');
    await completeDocument(pending, patch);
  }
  return withState(async state => {
    const job = state.jobs[id];
    if (!job || !accessible(job) || (lease !== undefined && job.leaseToken !== lease)) return;
    await putPrivate(id, 'result.json', Buffer.from(JSON.stringify({ fields })));
    Object.assign(job, patch, { checkedAt: patch.checkedAt || new Date().toISOString(), artifactsExpireAt: new Date(Math.min(Date.parse(job.expiresAt), Date.now() + config().artifactMs)).toISOString(), leaseToken: undefined, leaseUntil: undefined });
    audit(state, 'VERIFICATION_FINISHED', id);
  });
}
