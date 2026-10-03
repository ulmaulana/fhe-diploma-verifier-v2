import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { BlobsServer } from '@netlify/blobs/server';
import { getStore, setEnvironmentContext } from '@netlify/blobs';
import { hashUpload } from '@verifikasi/domain';
import { bootstrap, mutation } from '../../src/server/http';
import { getArchive, putArchive, getPrivate, putPrivate, deletePrivate } from '../../src/server/storage';
import { createUploadIntent, cleanupUploadIntents } from '../../src/server/upload-intents';
import { finalizeUpload, uploadToken } from '../../src/server/uploads';
import { withState } from '../../src/server/store';
import { netlifyBlobsEnabled } from '../../src/server/netlify-storage';
import { PUT } from '../../src/app/api/uploads/[id]/parts/[part]/route';
import { UPLOAD_CHUNK_BYTES } from '../../src/features/shared/upload-limits';
import type { Session, UploadIntent } from '../../src/server/types';

let root: string; let directory: string; let server: BlobsServer;
let owner: Session; let cookie: string;
const origin = 'http://localhost:3000';
const key = 'netlify-upload-key-123';
const fixture = Buffer.from('%PDF-1.7\nEXAMPLE synthetic document');
function request() { return new Request(`${origin}/api/uploads/intents`, { method: 'POST', headers: { 'Idempotency-Key': key } }); }
async function reserve(bytes = fixture) {
  return createUploadIntent(request(), owner, { fileName: 'test.pdf', fileSize: bytes.length, mimeType: 'application/pdf', clientDigest: hashUpload(bytes) });
}
async function part(intent: UploadIntent, index: string, bytes: Buffer, headers: Record<string, string> = {}) {
  return PUT(new Request(`${origin}/api/uploads/${intent.id}/parts/${index}`, { method: 'PUT',
    headers: { cookie, origin, 'x-csrf-token': owner.csrf, 'Idempotency-Key': key, 'Content-Type': 'application/octet-stream', ...headers }, body: Uint8Array.from(bytes).buffer }),
  { params: Promise.resolve({ id: intent.id, part: index }) });
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'netlify-blobs-test-'));
  server = new BlobsServer({ directory: join(root, 'blobs'), token: 'test-token', logger: () => {} });
  const address = await server.start();
  setEnvironmentContext({ siteID: 'test-site', token: 'test-token', apiURL: `http://localhost:${address.port}`, edgeURL: `http://localhost:${address.port}`, uncachedEdgeURL: `http://localhost:${address.port}` });
});
afterAll(async () => { setEnvironmentContext({}); await server.stop(); await rm(root, { recursive: true, force: true }); });
beforeEach(async () => {
  directory = await mkdtemp(join(root, 'state-'));
  for (const name of ['VERCEL', 'NETLIFY', 'SITE_ID', 'URL', 'DATABASE_URL', 'NETLIFY_AUTH_TOKEN', 'NETLIFY_SITE_ID']) vi.stubEnv(name, '');
  vi.stubEnv('APP_MODE', 'demo'); vi.stubEnv('APP_ORIGIN', origin); vi.stubEnv('PRIVATE_DATA_DIR', directory);
  vi.stubEnv('STORAGE_PROVIDER', 'netlify'); vi.stubEnv('NETLIFY_BLOBS_STORE', `test-${crypto.randomUUID()}`);
  // Old Vercel settings must never take precedence over Netlify.
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'old-unused-token');
  const response = await bootstrap(new Request(`${origin}/api/session`)); const data = await response.json();
  expect(data.uploadMode).toBe('netlify');
  cookie = response.headers.get('set-cookie')!;
  owner = await mutation(new Request(origin, { headers: { cookie, origin, 'x-csrf-token': data.csrfToken } }));
});
afterEach(() => vi.unstubAllEnvs());

it('uploads 10 MiB through bounded requests, finalizes once and cleans staging', async () => {
  const bytes = Buffer.alloc(10 * 1024 * 1024); fixture.copy(bytes);
  const intent = await reserve(bytes);
  for (let offset = 0; offset < bytes.length; offset += UPLOAD_CHUNK_BYTES) {
    expect((await part(intent, String(offset / UPLOAD_CHUNK_BYTES), bytes.subarray(offset, offset + UPLOAD_CHUNK_BYTES))).status).toBe(200);
  }
  const job = await finalizeUpload(request(), owner, intent.id);
  expect((await getStore(process.env.NETLIFY_BLOBS_STORE!).list({ prefix: `uploads/${intent.id}/` })).blobs).toEqual([]);
  expect(job.digest).toBe(hashUpload(bytes));
  expect(await getPrivate(job.id, 'upload.bin')).toEqual(bytes);
  expect((await finalizeUpload(request(), owner, intent.id)).id).toBe(job.id);
  expect(await withState(state => Object.keys(state.jobs).length)).toBe(1);
  expect((await part(intent, '0', bytes.subarray(0, UPLOAD_CHUNK_BYTES))).status).toBe(409);
}, 60_000);

it('protects parts with owner, CSRF, origin, idempotency key, size and index checks', async () => {
  const intent = await reserve();
  expect((await part(intent, '0', fixture, { 'x-csrf-token': '' })).status).toBe(403);
  expect((await part(intent, '0', fixture, { origin: 'https://foreign.example' })).status).toBe(403);
  expect((await part(intent, '0', fixture, { 'Idempotency-Key': 'different' })).status).toBe(409);
  expect((await part(intent, '-1', fixture)).status).toBe(400);
  expect((await part(intent, '1', fixture)).status).toBe(400);
  expect((await part(intent, '0', Buffer.concat([fixture, fixture]))).status).toBe(413);
  expect((await part(intent, '0', fixture.subarray(1))).status).toBe(409);
  const other = await bootstrap(new Request(`${origin}/api/session`)); const data = await other.json();
  expect((await part(intent, '0', fixture, { cookie: other.headers.get('set-cookie')!, 'x-csrf-token': data.csrfToken })).status).toBe(404);
  await expect(finalizeUpload(request(), owner, intent.id)).rejects.toThrow('missing');
});

it('allows identical chunk retries, rejects replacement, and checks the actual digest', async () => {
  const intent = await reserve();
  const changed = Buffer.from(fixture); changed[changed.length - 1] ^= 1;
  expect((await part(intent, '0', changed)).status).toBe(200);
  expect((await part(intent, '0', changed)).status).toBe(200);
  expect((await part(intent, '0', fixture)).status).toBe(503);
  await expect(finalizeUpload(request(), owner, intent.id)).rejects.toMatchObject({ code: 'UPLOAD_CHANGED' });
  expect(await withState(state => Object.keys(state.jobs))).toEqual([]);
});

it('expires partial uploads and prevents further writes', async () => {
  const intent = await reserve(); await part(intent, '0', fixture);
  await withState(state => { state.uploadIntents![intent.id]!.expiresAt = '2000-01-01T00:00:00.000Z'; });
  await cleanupUploadIntents();
  expect((await getStore(process.env.NETLIFY_BLOBS_STORE!).list({ prefix: `uploads/${intent.id}/` })).blobs).toEqual([]);
  expect((await part(intent, '0', fixture)).status).toBe(410);
  await expect(finalizeUpload(request(), owner, intent.id)).rejects.toMatchObject({ status: 410 });
});

it('persists immutable archives separately from job cleanup and validates their digest', async () => {
  const id = `0x${'ab'.repeat(32)}`; const digest = hashUpload(fixture);
  await putPrivate(id, 'upload.bin', fixture);
  await putArchive(id, digest, fixture); await putArchive(id, digest, fixture);
  await deletePrivate(id);
  await expect(getPrivate(id, 'upload.bin')).rejects.toThrow('missing');
  expect(await getArchive(id, digest)).toEqual(fixture);
  await expect(putArchive(id, digest, Buffer.from('tampered'))).rejects.toThrow('ARCHIVE_DIGEST_MISMATCH');
  await expect(putPrivate('../escape', 'upload.bin', fixture)).rejects.toThrow('Invalid private object key');
});

it('selects Netlify automatically in Functions and does not issue Vercel upload tokens', async () => {
  vi.stubEnv('STORAGE_PROVIDER', ''); vi.stubEnv('SITE_ID', 'site-id'); vi.stubEnv('URL', 'https://test.netlify.app');
  expect(netlifyBlobsEnabled()).toBe(true);
  await expect(uploadToken(request())).rejects.toMatchObject({ code: 'STORAGE_REQUIRED' });
});
