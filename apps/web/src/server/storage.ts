import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { put, get, del, list } from '@vercel/blob';
import { config, neonStorageConfig } from './config';
import { createHash } from 'node:crypto';
import { deleteNetlifyPrefix, netlifyBlobsEnabled, readNetlifyObject, writeNetlifyObject } from './netlify-storage';

/** Production never silently writes documents to a Function's ephemeral disk. */
export function neonStorageEnabled() { return process.env.STORAGE_PROVIDER === 'neon'; }
export function chunkedUploadsEnabled() { return neonStorageEnabled() || netlifyBlobsEnabled(); }
export function vercelBlobEnabled() { return !neonStorageEnabled() && !netlifyBlobsEnabled() && Boolean(process.env.BLOB_READ_WRITE_TOKEN); }
export function blobEnabled() { return netlifyBlobsEnabled() || vercelBlobEnabled(); }
function ensureStorage() {
  if (neonStorageEnabled()) {
    const cfg = neonStorageConfig();
    if (Object.values(cfg).some(value => !value?.trim())) throw new Error('Neon Object Storage is not configured');
    const endpoint = new URL(cfg.endpoint!);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('Invalid Neon Object Storage endpoint');
    return;
  }
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
  if (neonStorageEnabled()) { await deleteS3Prefix(pathname.slice(0, pathname.lastIndexOf('/') + 1)); return; }
  if (!blobEnabled()) throw new Error('Private Blob storage is not configured');
  await del(pathname, blobOptions());
}

let client: S3Client | undefined;
let clientConfiguration: string | undefined;
function s3() {
  const neon = neonStorageEnabled();
  const cfg = neonStorageConfig();
  const region = neon ? cfg.region : process.env.S3_REGION || 'us-east-1';
  const endpoint = neon ? cfg.endpoint : process.env.S3_ENDPOINT || undefined;
  const accessKeyId = neon ? cfg.accessKeyId : process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = neon ? cfg.secretAccessKey : process.env.AWS_SECRET_ACCESS_KEY;
  const signature = JSON.stringify([neon, region, endpoint, accessKeyId, secretAccessKey]);
  if (!client || clientConfiguration !== signature) {
    client?.destroy();
    client = new S3Client({ region, endpoint, forcePathStyle: neon || Boolean(endpoint),
      ...(neon ? { credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
        requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' } : {}) });
    clientConfiguration = signature;
  }
  return client;
}
function encryption() { return neonStorageEnabled() ? {} : { ServerSideEncryption: 'AES256' as const }; }
async function readS3Object(objectKey: string, maximumBytes = config().maxBytes): Promise<Buffer> {
  const response = await s3().send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: objectKey }));
  if (!response.Body) throw new Error('Private object missing');
  if (response.ContentLength !== undefined && (response.ContentLength < 1 || response.ContentLength > maximumBytes)) {
    await response.Body.transformToWebStream().cancel();
    throw new Error('Private object has invalid size');
  }
  const reader = response.Body.transformToWebStream().getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const part = await reader.read(); if (part.done) break;
    size += part.value.length;
    if (size > maximumBytes) { await reader.cancel(); throw new Error('Private object exceeds size limit'); }
    chunks.push(part.value);
  }
  if (!size || (response.ContentLength !== undefined && size !== response.ContentLength)) throw new Error('Private object has invalid size');
  return Buffer.concat(chunks);
}
async function deleteS3Prefix(prefix: string) {
  let continuationToken: string | undefined;
  do {
    const objects = await s3().send(new ListObjectsV2Command({ Bucket: process.env.S3_BUCKET, Prefix: prefix, ContinuationToken: continuationToken }));
    const keys = (objects.Contents || []).map(item => {
      if (!item.Key?.startsWith(prefix)) throw new Error('Invalid private object key');
      return { Key: item.Key };
    });
    if (keys.length) {
      const result = await s3().send(new DeleteObjectsCommand({ Bucket: process.env.S3_BUCKET, Delete: { Objects: keys } }));
      if (result.Errors?.length) throw new Error('Private object deletion failed');
    }
    continuationToken = objects.IsTruncated ? objects.NextContinuationToken : undefined;
    if (objects.IsTruncated && !continuationToken) throw new Error('Invalid storage pagination');
  } while (continuationToken);
}
function stagingKey(objectKey: string) {
  if (!/^uploads\/0x[0-9a-f]{64}\/parts\/(0|[1-9]\d*)$/.test(objectKey)) throw new Error('Invalid staging object key');
  return objectKey;
}
export async function writeStagingObject(objectKey: string, bytes: Uint8Array) {
  ensureStorage(); stagingKey(objectKey);
  if (netlifyBlobsEnabled()) { await writeNetlifyObject(objectKey, bytes, true); return; }
  if (!neonStorageEnabled()) throw new Error('Chunked upload storage is not configured');
  try {
    await s3().send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: objectKey, Body: bytes,
      ContentType: 'application/octet-stream', IfNoneMatch: '*' }));
  } catch (error) {
    const existing = await readS3Object(objectKey, bytes.byteLength).catch(() => null);
    if (!existing?.equals(Buffer.from(bytes))) throw error;
  }
}
export async function readStagingObject(objectKey: string, maximumBytes = config().maxBytes) {
  ensureStorage(); stagingKey(objectKey);
  if (netlifyBlobsEnabled()) return readNetlifyObject(objectKey, maximumBytes);
  if (!neonStorageEnabled()) throw new Error('Chunked upload storage is not configured');
  return readS3Object(objectKey, maximumBytes);
}
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
  if (process.env.S3_BUCKET) { await s3().send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: objectKey, Body: bytes, ...encryption() })); return; }
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
    return readS3Object(objectKey);
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
    await deleteS3Prefix(`jobs/${id}/`);
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
    try { await s3().send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: objectKey, Body: bytes, ContentType: 'application/pdf', ...encryption(), IfNoneMatch: '*' })); }
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
    bytes = await readS3Object(objectKey);
  } else bytes = await readFile(path.join(config().dataDir, objectKey));
  if (`0x${createHash('sha256').update(bytes).digest('hex')}` !== digest) throw new Error('ARCHIVE_DIGEST_MISMATCH');
  return bytes;
}
