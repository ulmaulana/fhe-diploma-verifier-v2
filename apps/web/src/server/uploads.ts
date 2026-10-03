import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { ApiError, config } from './config';
import { safeEqual, session } from './http';
import { accessible, createJobFromBytes } from './jobs';
import { withState } from './store';
import { assertPrivateBlobUrl, vercelBlobEnabled, deletePrivateBlob, readPrivateBlob } from './storage';
import { netlifyBlobsEnabled } from './netlify-storage';
import { readNetlifyUpload } from './netlify-uploads';
import { ownedIntent } from './upload-intents';
import type { Session } from './types';

export async function smallJson(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new ApiError(400, 'INVALID_JSON', 'Format permintaan tidak valid.');
  const reader = request.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  if (!reader) throw new ApiError(400, 'INVALID_JSON', 'Permintaan kosong.');
  for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 16_384) { await reader.cancel(); throw new ApiError(413, 'REQUEST_TOO_LARGE', 'Permintaan terlalu besar.'); } chunks.push(part.value); }
  try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new ApiError(400, 'INVALID_JSON', 'Format permintaan tidak valid.'); }
}

export async function uploadToken(request: Request) {
  if (!vercelBlobEnabled()) throw new ApiError(503, 'STORAGE_REQUIRED', 'Tujuan unggahan ini tidak tersedia. Muat ulang halaman.');
  const body = await smallJson(request) as HandleUploadBody;
  if (!body || !['blob.generate-client-token', 'blob.upload-completed'].includes(body.type)) throw new ApiError(400, 'INVALID_UPLOAD', 'Permintaan unggahan tidak valid.');
  return handleUpload({
    request, body, token: process.env.BLOB_READ_WRITE_TOKEN,
    onBeforeGenerateToken: async (pathname, payload, multipart) => {
      const current = await session(request);
      let data: { intentId?: string; csrf?: string };
      try { data = JSON.parse(payload || '{}'); } catch { throw new ApiError(400, 'INVALID_UPLOAD', 'Permintaan unggahan tidak valid.'); }
      if (!data || request.headers.get('origin') !== config().origin || !safeEqual(data.csrf || '', current.csrf)) throw new ApiError(403, 'CSRF_REJECTED', 'Permintaan tidak berasal dari sesi yang sah.');
      if (multipart) throw new ApiError(400, 'INVALID_UPLOAD', 'Unggah satu berkas utuh.');
      const intent = await withState(state => ownedIntent(state, data.intentId || '', current.id));
      if (intent.pathname !== pathname || intent.jobId || Date.parse(intent.expiresAt) <= Date.now()) throw new ApiError(403, 'UPLOAD_PATH_REJECTED', 'Tujuan unggahan tidak valid.');
      return { allowedContentTypes: [intent.mimeType], maximumSizeInBytes: intent.fileSize, validUntil: Date.parse(intent.expiresAt), addRandomSuffix: false, allowOverwrite: false, cacheControlMaxAge: 60, tokenPayload: JSON.stringify({ intentId: intent.id }), callbackUrl: `${config().origin}/api/uploads/token` };
    },
    // The SDK verifies the callback signature before this hook runs. Callbacks do
    // not enqueue work; browser finalization validates the real stored bytes.
    onUploadCompleted: async ({ blob, tokenPayload }) => {
      const payload = JSON.parse(tokenPayload || '{}') as { intentId?: string };
      if (!payload.intentId || !/^0x[0-9a-f]{64}$/.test(payload.intentId)) throw new Error('Invalid upload callback');
      if (!new RegExp(`^uploads/${payload.intentId}/document\\.(pdf|png|jpg)$`).test(blob.pathname)) throw new Error('Invalid upload callback path');
      assertPrivateBlobUrl(blob.url, blob.pathname);
      const intent = await withState(state => state.uploadIntents?.[payload.intentId!]);
      if (intent && intent.pathname !== blob.pathname) throw new Error('Upload callback path mismatch');
      if (!intent || intent.deletedAt || intent.jobId || Date.parse(intent.expiresAt) <= Date.now()) await deletePrivateBlob(blob.pathname);
    },
  });
}

export async function finalizeUpload(request: Request, current: Session, id: string) {
  const intent = await withState(state => ownedIntent(state, id, current.id));
  if (request.headers.get('idempotency-key') !== intent.idempotencyKey) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Kunci pengiriman tidak sesuai.');
  if (intent.jobId) {
    const job = await withState(state => state.jobs[intent.jobId!]);
    if (!job || job.owner !== current.id || !accessible(job)) throw new ApiError(410, 'UPLOAD_DELETED', 'Dokumen telah dihapus atau kedaluwarsa.');
    await deletePrivateBlob(intent.pathname);
    return job;
  }
  const stored = netlifyBlobsEnabled() ? await readNetlifyUpload(intent) : await readPrivateBlob(intent.pathname, config().maxBytes);
  if (stored.size !== intent.fileSize || stored.contentType !== intent.mimeType) throw new ApiError(409, 'UPLOAD_CHANGED', 'Berkas yang diterima berbeda dari berkas yang dipilih.');
  const job = await createJobFromBytes(request, current, { bytes: stored.bytes, name: intent.fileName, mimeType: intent.mimeType }, intent.expectedCredentialId, intent.id);
  await deletePrivateBlob(intent.pathname);
  return job;
}
