import { getStore } from '@netlify/blobs';
import { config, isNetlify } from './config';

export function netlifyBlobsEnabled() {
  return isNetlify() || process.env.STORAGE_PROVIDER === 'netlify';
}

function store() {
  // Site-wide storage survives redeploys. Resolve runtime credentials per call.
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;
  return getStore({ name: process.env.NETLIFY_BLOBS_STORE || 'verifikasi-private', consistency: 'strong',
    ...(siteID && token ? { siteID, token } : {}) });
}

export async function readNetlifyObject(key: string, maximumBytes = config().maxBytes): Promise<Buffer> {
  const stream = await store().get(key, { type: 'stream' });
  if (!stream) throw new Error('Private object missing');
  const reader = stream.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const part = await reader.read(); if (part.done) break;
    size += part.value.length;
    if (size > maximumBytes) { await reader.cancel(); throw new Error('Private object exceeds size limit'); }
    chunks.push(part.value);
  }
  if (!size) throw new Error('Private object is empty');
  return Buffer.concat(chunks);
}

export async function writeNetlifyObject(key: string, bytes: Uint8Array, immutable = false) {
  const body = Uint8Array.from(bytes).buffer;
  try {
    const result = await store().set(key, body, { onlyIfNew: immutable });
    if (!result.modified && !(await readNetlifyObject(key, bytes.byteLength)).equals(Buffer.from(bytes))) {
      throw new Error('Private object already exists with different bytes');
    }
  } catch (error) {
    // Retry after a lost acknowledgement is safe only when immutable bytes match.
    if (!immutable) throw error;
    const existing = await readNetlifyObject(key, bytes.byteLength).catch(() => null);
    if (!existing?.equals(Buffer.from(bytes))) throw error;
  }
}

export async function deleteNetlifyPrefix(prefix: string) {
  const storage = store();
  for await (const page of storage.list({ prefix, paginate: true })) {
    for (const blob of page.blobs) await storage.delete(blob.key);
  }
}
