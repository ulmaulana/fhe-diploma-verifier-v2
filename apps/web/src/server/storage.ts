import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { put, get, del, list } from '@vercel/blob';
import { config } from './config';
import { createHash } from 'node:crypto';
import { deleteNetlifyPrefix, netlifyBlobsEnabled, readNetlifyObject, writeNetlifyObject } from './netlify-storage';

/** Production never silently writes documents to a Function's ephemeral disk. */
export function vercelBlobEnabled() { return !netlifyBlobsEnabled() && Boolean(process.env.BLOB_READ_WRITE_TOKEN); }
export function blobEnabled() { return netlifyBlobsEnabled() || vercelBlobEnabled(); }
function ensureStorage() {
  if (process.env.VERCEL && !blobEnabled()) throw new Error('A private Vercel Blob store and BLOB_READ_WRITE_TOKEN are required');
}
function blobOptions() { return { token: process.env.BLOB_READ_WRITE_TOKEN }; }
export function assertPrivateBlobUrl(url: string, pathname: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !/^[a-z0-9]+\.private\.blob\.vercel-storage\.com$/.test(parsed.hostname) || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash || decodeURIComponent(parsed.pathname) !== `/${pathname}`) throw new Error('Private Blob response does not match the expected object');
  if (process.env.BLOB_STORE_HOSTNAME && parsed.hostname !== process.env.BLOB_STORE_HOSTNAME) throw new Error('Private Blob store does not match BLOB_STORE_HOSTNAME');
}
export async function readPrivateBlob(pathname: string, maximumBytes = config().maxBytes) {
  ensureStorage();
  if (!vercelBlobEnabled()) throw new Error('Private Vercel Blob storage is not configured');
  // Resolve by our own path, never by a client-provided URL.
  const result = await get(pathname, { ...blobOptions(), access: 'private', useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) throw new Error('Private object missing');
  assertPrivateBlobUrl(result.blob.url, pathname);
  if (result.blob.pathname !== pathname || result.blob.size === null || result.blob.size < 1 || result.blob.size > maximumBytes) { await result.stream.cancel(); throw new Error('Private object has invalid size'); }
  const reader = result.stream.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const part = await reader.read(); if (part.done) break;
    size += part.value.length;
    if (size > maximumBytes) { await reader.cancel(); throw new Error('Private object exceeds size limit'); }
    chunks.push(part.value);
  }
  if (size !== result.blob.size) throw new Error('Private object size changed');
  return { bytes: Buffer.concat(chunks), contentType: result.blob.contentType, size };
}
export async function deletePrivateBlob(pathname: string) {
  if (!/^uploads\/0x[0-9a-f]{64}\/document\.(pdf|png|jpg)$/.test(pathname)) throw new Error('Invalid staging object key');
  if (netlifyBlobsEnabled()) { await deleteNetlifyPrefix(pathname.slice(0, pathname.lastIndexOf('/') + 1)); return; }
  ensureStorage();
  if (!blobEnabled()) throw new Error('Private Blob storage is not configured');
  await del(pathname, blobOptions());
}

let client: S3Client | undefined;
function s3() { return client ??= new S3Client({ region: process.env.S3_REGION || 'us-east-1', endpoint: process.env.S3_ENDPOINT || undefined, forcePathStyle: Boolean(process.env.S3_ENDPOINT) }); }
function key(id: string, name: string) {
  if (!/^(0x[0-9a-f]{64}|[0-9a-f-]{36})$/.test(id) || !/^[a-z-]+\.(bin|json|pdf)$/.test(name)) throw new Error('Invalid private object key');
  return `jobs/${id}/${name}`;
}
export async function putPrivate(id: string, name: string, bytes: Uint8Array) {
  ensureStorage();
  const objectKey = key(id, name);
  if (netlifyBlobsEnabled()) { await writeNetlifyObject(objectKey, bytes); return; }
  if (blobEnabled()) {
    const result = await put(objectKey, Buffer.from(bytes), { ...blobOptions(), access: 'private', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60, contentType: name.endsWith('.json') ? 'application/json' : 'application/octet-stream' });
    assertPrivateBlobUrl(result.url, objectKey);
    return;
  }
  if (process.env.S3_BUCKET) { await s3().send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: objectKey, Body: bytes, ServerSideEncryption: 'AES256' })); return; }
  const target = path.join(config().dataDir, objectKey);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  await writeFile(target, bytes, { mode: 0o600 });
}
export async function getPrivate(id: string, name: string): Promise<Buffer> {
  ensureStorage();
  const objectKey = key(id, name);
  if (netlifyBlobsEnabled()) return readNetlifyObject(objectKey);
  if (blobEnabled()) return (await readPrivateBlob(objectKey)).bytes;
  if (process.env.S3_BUCKET) {
    const response = await s3().send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: objectKey }));
    if (!response.Body) throw new Error('Private object missing');
    return Buffer.from(await response.Body.transformToByteArray());
  }
  return readFile(path.join(config().dataDir, objectKey));
}
export async function deletePrivate(id: string) {
  ensureStorage();
  key(id, 'upload.bin');
  if (netlifyBlobsEnabled()) { await deleteNetlifyPrefix(`jobs/${id}/`); return; }
  if (blobEnabled()) {
    let cursor: string | undefined;
    do {
      const objects = await list({ ...blobOptions(), prefix: `jobs/${id}/`, cursor, limit: 100 });
      if (objects.blobs.length) await del(objects.blobs.map(item => { assertPrivateBlobUrl(item.url, item.pathname); return item.url; }), blobOptions());
      cursor = objects.hasMore ? objects.cursor : undefined;
    } while (cursor);
    return;
  }
  if (process.env.S3_BUCKET) {
    const objects = await s3().send(new ListObjectsV2Command({ Bucket: process.env.S3_BUCKET, Prefix: `jobs/${id}/` }));
    if (objects.Contents?.length) await s3().send(new DeleteObjectsCommand({ Bucket: process.env.S3_BUCKET, Delete: { Objects: objects.Contents.map(item => ({ Key: item.Key! })) } }));
    return;
  }
  const root = path.resolve(config().dataDir, 'jobs');
  const target = path.resolve(root, id);
  if (!target.startsWith(root + path.sep)) throw new Error('Unsafe deletion target');
  await rm(target, { recursive: true, force: true });
}

function archiveKey(id: string, digest: string) {
  if (!/^0x[0-9a-f]{64}$/.test(id) || !/^0x[0-9a-f]{64}$/.test(digest)) throw new Error('Invalid archive key');
  return `credentials/${id}/${digest.slice(2)}.pdf`;
}
/** Content-addressed, immutable archive. Job cleanup only traverses jobs/ and uploads/. */
export async function putArchive(id: string, digest: string, bytes: Buffer) {
  ensureStorage();
  if (`0x${createHash('sha256').update(bytes).digest('hex')}` !== digest) throw new Error('ARCHIVE_DIGEST_MISMATCH');
  const objectKey = archiveKey(id, digest);
  if (netlifyBlobsEnabled()) { await writeNetlifyObject(objectKey, bytes, true); return objectKey; }
  if (blobEnabled()) {
    try {
      const result = await put(objectKey, bytes, { ...blobOptions(), access: 'private', addRandomSuffix: false, allowOverwrite: false, contentType: 'application/pdf' });
      assertPrivateBlobUrl(result.url, objectKey);
    } catch (error) {
      // A lost acknowledgement or duplicate promotion is safe only for the exact bytes.
      const existing = await getArchive(id, digest).catch(() => null);
      if (!existing || !existing.equals(bytes)) throw error;
    }
  } else if (process.env.S3_BUCKET) {
    try { await s3().send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: objectKey, Body: bytes, ContentType: 'application/pdf', ServerSideEncryption: 'AES256', IfNoneMatch: '*' })); }
    catch (error) { const existing = await getArchive(id, digest).catch(() => null); if (!existing || !existing.equals(bytes)) throw error; }
  } else {
    const target = path.join(config().dataDir, objectKey);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    try { await writeFile(target, bytes, { flag: 'wx', mode: 0o600 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || !(await getArchive(id, digest)).equals(bytes)) throw error; }
  }
  return objectKey;
}
export async function getArchive(id: string, digest: string): Promise<Buffer> {
  ensureStorage(); const objectKey = archiveKey(id, digest);
  let bytes: Buffer;
  if (netlifyBlobsEnabled()) bytes = await readNetlifyObject(objectKey);
  else if (blobEnabled()) bytes = (await readPrivateBlob(objectKey)).bytes;
  else if (process.env.S3_BUCKET) {
    const result = await s3().send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: objectKey }));
    if (!result.Body) throw new Error('Archive missing');
    bytes = Buffer.from(await result.Body.transformToByteArray());
  } else bytes = await readFile(path.join(config().dataDir, objectKey));
  if (`0x${createHash('sha256').update(bytes).digest('hex')}` !== digest) throw new Error('ARCHIVE_DIGEST_MISMATCH');
  return bytes;
}
