import { randomBytes } from 'node:crypto';
import { ApiError, config, requireRealConfiguration } from './config';
import { limit, source } from './http';
import { audit, withState } from './store';
import { blobEnabled, deletePrivate, deletePrivateBlob } from './storage';
import { TERMINAL, type Session, type State, type UploadIntent } from './types';

const MIME_EXTENSION: Record<string, string> = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg' };
const INTENT_MS = 10 * 60_000;
export function ownedIntent(state: State, id: string, owner: string) {
  const intent = state.uploadIntents?.[id];
  if (!intent || intent.owner !== owner) throw new ApiError(404, 'UPLOAD_NOT_FOUND', 'Unggahan tidak ditemukan.');
  if (intent.deletedAt || (!intent.jobId && Date.parse(intent.expiresAt) <= Date.now())) throw new ApiError(410, 'UPLOAD_EXPIRED', 'Unggahan kedaluwarsa. Pilih berkas kembali.');
  return intent;
}
export async function createUploadIntent(request: Request, current: Session, input: unknown) {
  requireRealConfiguration();
  if (!blobEnabled()) throw new ApiError(503, 'STORAGE_REQUIRED', 'Penyimpanan unggahan belum dikonfigurasi.');
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError(400, 'INVALID_UPLOAD', 'Informasi berkas tidak valid.');
  const data = input as Record<string, unknown>;
  const idempotencyKey = request.headers.get('idempotency-key');
  if (!idempotencyKey || !/^[a-zA-Z0-9_-]{16,128}$/.test(idempotencyKey)) throw new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Kunci pengiriman tidak valid.');
  if (typeof data.fileName !== 'string' || !data.fileName || data.fileName.length > 512 || typeof data.mimeType !== 'string' || !Object.hasOwn(MIME_EXTENSION, data.mimeType)) throw new ApiError(415, 'INVALID_FILE_TYPE', 'Gunakan PDF, JPG, atau PNG.');
  if (typeof data.fileSize !== 'number' || !Number.isSafeInteger(data.fileSize) || data.fileSize < 1 || data.fileSize > config().maxBytes) throw new ApiError(413, 'FILE_TOO_LARGE', 'Berkas harus berisi data dan maksimum 10 MiB.');
  if (typeof data.clientDigest !== 'string' || !/^0x[0-9a-f]{64}$/.test(data.clientDigest)) throw new ApiError(400, 'INVALID_UPLOAD', 'Informasi berkas tidak lengkap.');
  if (data.credentialId !== undefined && (typeof data.credentialId !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(data.credentialId))) throw new ApiError(400, 'INVALID_CREDENTIAL', 'ID kredensial tidak valid.');
  const metadata = { fileName: data.fileName.replace(/[\\/\x00-\x1f]/g, '_').slice(0, 160), fileSize: data.fileSize, mimeType: data.mimeType, clientDigest: data.clientDigest, expectedCredentialId: typeof data.credentialId === 'string' ? data.credentialId.toLowerCase() : undefined };
  await cleanupUploadIntents();
  return withState(state => {
    state.uploadIntents ??= {};
    const existing = Object.values(state.uploadIntents).find(intent => intent.owner === current.id && intent.idempotencyKey === idempotencyKey);
    if (existing) {
      ownedIntent(state, existing.id, current.id);
      if (existing.clientDigest !== metadata.clientDigest || existing.fileName !== metadata.fileName || existing.fileSize !== metadata.fileSize || existing.mimeType !== metadata.mimeType || existing.expectedCredentialId !== metadata.expectedCredentialId) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Kunci yang sama sudah dipakai untuk berkas lain.');
      return existing;
    }
    limit(state, `upload:${current.id}`, 30, 3600_000);
    limit(state, `source:${source(request)}`, 100, 3600_000);
    const active = Object.values(state.jobs).filter(job => job.owner === current.id && !TERMINAL.includes(job.status) && !job.deletedAt).length;
    const pending = Object.values(state.uploadIntents).filter(intent => intent.owner === current.id && !intent.jobId && !intent.deletedAt && Date.parse(intent.expiresAt) > Date.now()).length;
    if (active + pending >= config().maxActive) throw new ApiError(429, 'TOO_MANY_ACTIVE', 'Maksimum lima unggahan atau pemeriksaan berjalan per sesi.');
    const id = `0x${randomBytes(32).toString('hex')}`;
    const intent: UploadIntent = { id, owner: current.id, idempotencyKey, ...metadata, pathname: `uploads/${id}/document.${MIME_EXTENSION[metadata.mimeType]}`, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + INTENT_MS).toISOString() };
    state.uploadIntents[id] = intent;
    audit(state, 'UPLOAD_INTENT_CREATED', id);
    return intent;
  });
}

/** Keep tombstones while client tokens and in-flight uploads can still complete. */
export async function cleanupUploadIntents() {
  const pending = await withState(state => {
    const now = Date.now();
    return Object.values(state.uploadIntents || {}).filter(intent => {
      const job = intent.jobId ? state.jobs[intent.jobId] : undefined;
      if (!intent.jobId && Date.parse(intent.expiresAt) <= now || intent.jobId && (!job || job.deletedAt || job.artifactsDeletedAt || Date.parse(job.artifactsExpireAt) <= now)) {
        intent.deletedAt ??= new Date().toISOString(); intent.fileName = ''; intent.clientDigest = '';
      }
      return Boolean(intent.deletedAt || intent.jobId);
    }).map(intent => ({ id: intent.id, pathname: intent.pathname, orphan: !state.jobs[intent.id] }));
  });
  for (const intent of pending) {
    await deletePrivateBlob(intent.pathname);
    if (intent.orphan) await deletePrivate(intent.id);
  }
  await withState(state => {
    for (const [id, intent] of Object.entries(state.uploadIntents || {})) {
      if (intent.deletedAt && Date.parse(intent.createdAt) + config().historyMs + 3600_000 <= Date.now()) delete state.uploadIntents![id];
    }
  });
}
