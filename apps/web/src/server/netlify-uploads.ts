import { UPLOAD_CHUNK_BYTES } from '@/features/shared/upload-limits';
import { ApiError, config } from './config';
import { netlifyBlobsEnabled, readNetlifyObject, writeNetlifyObject } from './netlify-storage';
import { withState } from './store';
import { ownedIntent } from './upload-intents';
import { deletePrivateBlob } from './storage';
import type { Session, UploadIntent } from './types';

function partKey(intent: UploadIntent, index: number) { return `uploads/${intent.id}/parts/${index}`; }
function partSize(intent: UploadIntent, index: number) { return Math.min(UPLOAD_CHUNK_BYTES, intent.fileSize - index * UPLOAD_CHUNK_BYTES); }

export async function uploadNetlifyPart(request: Request, current: Session, id: string, part: string) {
  if (!netlifyBlobsEnabled()) throw new ApiError(404, 'UPLOAD_NOT_FOUND', 'Tujuan unggahan tidak tersedia.');
  const intent = await withState(state => ownedIntent(state, id, current.id));
  if (request.headers.get('idempotency-key') !== intent.idempotencyKey) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Kunci pengiriman tidak sesuai.');
  const index = Number(part);
  if (!/^(0|[1-9]\d*)$/.test(part) || !Number.isSafeInteger(index) || index >= Math.ceil(intent.fileSize / UPLOAD_CHUNK_BYTES)) {
    throw new ApiError(400, 'INVALID_UPLOAD_PART', 'Bagian unggahan tidak valid.');
  }
  if (intent.jobId) throw new ApiError(409, 'UPLOAD_FINALIZED', 'Unggahan sudah selesai.');
  if (request.headers.get('content-type') !== 'application/octet-stream') throw new ApiError(415, 'INVALID_UPLOAD', 'Format unggahan tidak valid.');
  const expected = partSize(intent, index);
  if (Number(request.headers.get('content-length') || 0) > expected) throw new ApiError(413, 'UPLOAD_PART_TOO_LARGE', 'Bagian unggahan terlalu besar.');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'EMPTY_UPLOAD', 'Bagian unggahan kosong.');
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const result = await reader.read(); if (result.done) break;
    size += result.value.length;
    if (size > expected) { await reader.cancel(); throw new ApiError(413, 'UPLOAD_PART_TOO_LARGE', 'Bagian unggahan terlalu besar.'); }
    chunks.push(result.value);
  }
  if (size !== expected) throw new ApiError(409, 'UPLOAD_CHANGED', 'Ukuran unggahan berbeda dari berkas yang dipilih.');
  await writeNetlifyObject(partKey(intent, index), Buffer.concat(chunks), true);
  // A deletion, expiry or finalization can race an in-flight body. Remove late bytes.
  try {
    await withState(state => {
      const latest = ownedIntent(state, id, current.id);
      if (latest.jobId) throw new ApiError(409, 'UPLOAD_FINALIZED', 'Unggahan sudah selesai.');
    });
  } catch (error) { await deletePrivateBlob(intent.pathname); throw error; }
  return { uploaded: true, part: index };
}

export async function readNetlifyUpload(intent: UploadIntent) {
  if (intent.fileSize < 1 || intent.fileSize > config().maxBytes) throw new ApiError(413, 'FILE_TOO_LARGE', 'Ukuran unggahan tidak valid.');
  const chunks: Buffer[] = [];
  for (let index = 0; index < Math.ceil(intent.fileSize / UPLOAD_CHUNK_BYTES); index++) {
    const bytes = await readNetlifyObject(partKey(intent, index), partSize(intent, index));
    if (bytes.length !== partSize(intent, index)) throw new ApiError(409, 'UPLOAD_CHANGED', 'Ukuran unggahan berbeda dari berkas yang dipilih.');
    chunks.push(bytes);
  }
  return { bytes: Buffer.concat(chunks), size: intent.fileSize, contentType: intent.mimeType };
}
