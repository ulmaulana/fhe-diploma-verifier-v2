import { api, getSession } from '../shared/api';
import type { VerificationJob } from './types';
import { UPLOAD_CHUNK_BYTES } from '../shared/upload-limits';

export async function uploadDocument(file: File, idempotencyKey: string, credentialId?: string) {
  const current = await getSession();
  const headers = { 'Idempotency-Key': idempotencyKey };
  if (current.uploadMode !== 'blob' && current.uploadMode !== 'netlify') {
    const form = new FormData(); form.append('file', file);
    if (credentialId) form.append('credentialId', credentialId);
    return api<VerificationJob>('/api/verifications', { method: 'POST', headers, body: form });
  }
  // This digest only binds client retries. The server computes the trusted
  // digest again after fetching and validating the actual private Blob bytes.
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  const clientDigest = `0x${Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')}`;
  const intent = await api<{ id: string; pathname: string; finalized: boolean }>('/api/uploads/intents', {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, fileSize: file.size, mimeType: file.type, clientDigest, credentialId }),
  });
  let uploadError: unknown;
  if (!intent.finalized) {
    try {
      if (current.uploadMode === 'netlify') {
        for (let offset = 0; offset < file.size; offset += UPLOAD_CHUNK_BYTES) {
          await api(`/api/uploads/${intent.id}/parts/${offset / UPLOAD_CHUNK_BYTES}`, {
            method: 'PUT', headers: { ...headers, 'Content-Type': 'application/octet-stream' },
            body: file.slice(offset, offset + UPLOAD_CHUNK_BYTES),
          });
        }
      } else {
        const { upload } = await import('@vercel/blob/client');
        await upload(intent.pathname, file, { access: 'private', contentType: file.type, handleUploadUrl: '/api/uploads/token', clientPayload: JSON.stringify({ intentId: intent.id, csrf: current.csrfToken }) });
      }
    } catch (error) {
      // A lost response or an immutable-path conflict can mean the previous
      // upload succeeded. Finalization safely decides using actual stored bytes.
      uploadError = error;
    }
  }
  try { return await api<VerificationJob>(`/api/uploads/${intent.id}/finalize`, { method: 'POST', headers }); }
  catch (error) { if (uploadError) throw new Error('Unggahan belum selesai. Silakan coba lagi.'); throw error; }
}
