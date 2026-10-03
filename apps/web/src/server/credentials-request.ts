import { ApiError } from './config';

/** Public snapshots are small; reject oversized bodies before buffering them. */
export async function credentialJson(request: Request): Promise<unknown> {
  const maximum = 32 * 1024;
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new ApiError(415, 'JSON_REQUIRED', 'Kirim payload JSON.');
  if (Number(request.headers.get('content-length')) > maximum) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Payload kredensial terlalu besar.');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'INVALID_PAYLOAD', 'Payload kredensial diperlukan.');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) { await reader.cancel(); throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Payload kredensial terlalu besar.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new ApiError(400, 'INVALID_PAYLOAD', 'Payload JSON tidak valid.'); }
}
