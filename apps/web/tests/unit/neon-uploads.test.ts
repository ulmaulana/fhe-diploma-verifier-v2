import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { hashUpload } from '@verifikasi/domain';
import { bootstrap, mutation } from '../../src/server/http';
import { getArchive, getPrivate, putArchive, putPrivate, deletePrivate } from '../../src/server/storage';
import { createUploadIntent, cleanupUploadIntents } from '../../src/server/upload-intents';
import { finalizeUpload, uploadToken } from '../../src/server/uploads';
import { withState } from '../../src/server/store';
import { netlifyBlobsEnabled } from '../../src/server/netlify-storage';
import { PUT } from '../../src/app/api/uploads/[id]/parts/[part]/route';
import { UPLOAD_CHUNK_BYTES } from '../../src/features/shared/upload-limits';
import type { Session, UploadIntent } from '../../src/server/types';

const storage = vi.hoisted(() => ({
  objects: new Map<string, Buffer>(),
  calls: [] as { name: string; input: Record<string, unknown> }[],
  configurations: [] as Record<string, unknown>[],
}));
vi.mock('@aws-sdk/client-s3', async () => {
  const sdk = await vi.importActual<typeof import('@aws-sdk/client-s3')>('@aws-sdk/client-s3');
  return {
    ...sdk,
    S3Client: class {
      constructor(options: Record<string, unknown>) { storage.configurations.push(options); }
      destroy() {}
      async send(command: { constructor: { name: string }; input: Record<string, unknown> }) {
        const { name } = command.constructor; const { input } = command;
        storage.calls.push({ name, input });
        const key = String(input.Key || '');
        if (name === 'PutObjectCommand') {
          if (input.IfNoneMatch === '*' && storage.objects.has(key)) {
            throw Object.assign(new Error('Object already exists'), { name: 'PreconditionFailed', $metadata: { httpStatusCode: 412 } });
          }
          storage.objects.set(key, Buffer.from(input.Body as Uint8Array));
          return {};
        }
        if (name === 'GetObjectCommand') {
          const bytes = storage.objects.get(key);
          if (!bytes) throw Object.assign(new Error('Private object missing'), { name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } });
          return { ContentLength: bytes.length, Body: {
            transformToWebStream: () => new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close(); } }),
            transformToByteArray: async () => Uint8Array.from(bytes),
          } };
        }
        if (name === 'ListObjectsV2Command') {
          const keys = [...storage.objects.keys()].filter(value => value.startsWith(String(input.Prefix)));
          return { Contents: keys.map(Key => ({ Key })), IsTruncated: false };
        }
        if (name === 'DeleteObjectsCommand') {
          const deletion = input.Delete as { Objects: { Key: string }[] };
          for (const object of deletion.Objects) storage.objects.delete(object.Key);
          return {};
        }
        throw new Error(`Unexpected S3 command: ${name}`);
      }
    },
  };
});
vi.mock('@netlify/blobs', () => ({ getStore: vi.fn(() => { throw new Error('Neon storage must not access Netlify Blobs'); }) }));
vi.mock('@vercel/blob', () => ({
  put: vi.fn(() => { throw new Error('Neon storage must not access Vercel Blob'); }),
  get: vi.fn(() => { throw new Error('Neon storage must not access Vercel Blob'); }),
  del: vi.fn(() => { throw new Error('Neon storage must not access Vercel Blob'); }),
  list: vi.fn(() => { throw new Error('Neon storage must not access Vercel Blob'); }),
}));

let directory: string; let owner: Session; let cookie: string;
const origin = 'http://localhost:3000';
const key = 'neon-upload-test-key-123';
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

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'neon-uploads-test-'));
  for (const name of ['VERCEL', 'NETLIFY', 'SITE_ID', 'URL', 'DATABASE_URL',
    'NEON_STORAGE_ENDPOINT', 'NEON_STORAGE_REGION', 'NEON_STORAGE_ACCESS_KEY_ID', 'NEON_STORAGE_SECRET_ACCESS_KEY']) vi.stubEnv(name, '');
  vi.stubEnv('APP_MODE', 'demo'); vi.stubEnv('APP_ORIGIN', origin); vi.stubEnv('PRIVATE_DATA_DIR', directory);
  vi.stubEnv('STORAGE_PROVIDER', 'neon'); vi.stubEnv('S3_BUCKET', 'verifikasi-private');
  vi.stubEnv('AWS_ACCESS_KEY_ID', 'test-access-key'); vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'test-secret-key');
  vi.stubEnv('AWS_ENDPOINT_URL_S3', 'https://storage.test.invalid'); vi.stubEnv('AWS_REGION', 'us-east-2');
  // Settings from a previous provider must not divert new private files.
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'old-unused-token');
  storage.objects.clear(); storage.calls.length = 0; storage.configurations.length = 0;
  const response = await bootstrap(new Request(`${origin}/api/session`)); const data = await response.json();
  expect(data.uploadMode).toBe('chunked');
  cookie = response.headers.get('set-cookie')!;
  owner = await mutation(new Request(origin, { headers: { cookie, origin, 'x-csrf-token': data.csrfToken } }));
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(directory, { recursive: true, force: true }); });

it('stores a 10 MiB upload in Neon using bounded parts and finalizes once', async () => {
  const bytes = Buffer.alloc(10 * 1024 * 1024); fixture.copy(bytes);
  const intent = await reserve(bytes);
  for (let offset = 0; offset < bytes.length; offset += UPLOAD_CHUNK_BYTES) {
    expect((await part(intent, String(offset / UPLOAD_CHUNK_BYTES), bytes.subarray(offset, offset + UPLOAD_CHUNK_BYTES))).status).toBe(200);
  }
  const job = await finalizeUpload(request(), owner, intent.id);
  expect(job.digest).toBe(hashUpload(bytes));
  expect(await getPrivate(job.id, 'upload.bin')).toEqual(bytes);
  expect([...storage.objects.keys()].filter(value => value.startsWith(`uploads/${intent.id}/`))).toEqual([]);
  expect((await finalizeUpload(request(), owner, intent.id)).id).toBe(job.id);
  expect(await withState(state => Object.keys(state.jobs).length)).toBe(1);
  expect((await part(intent, '0', bytes.subarray(0, UPLOAD_CHUNK_BYTES))).status).toBe(409);
  const writes = storage.calls.filter(call => call.name === 'PutObjectCommand');
  expect(writes.every(call => call.input.Bucket === 'verifikasi-private' && !call.input.ServerSideEncryption)).toBe(true);
  expect(writes.filter(call => String(call.input.Key).startsWith('uploads/')).every(call => call.input.IfNoneMatch === '*')).toBe(true);
}, 60_000);

it('retains owner, CSRF, origin, idempotency, size and part-index checks', async () => {
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
  expect(storage.objects.size).toBe(0);
});

it('accepts identical chunk retries, prevents replacement and rejects a changed digest', async () => {
  const intent = await reserve(); const changed = Buffer.from(fixture); changed[changed.length - 1] ^= 1;
  expect((await part(intent, '0', changed)).status).toBe(200);
  expect((await part(intent, '0', changed)).status).toBe(200);
  expect((await part(intent, '0', fixture)).status).toBe(503);
  expect(storage.objects.get(`uploads/${intent.id}/parts/0`)).toEqual(changed);
  await expect(finalizeUpload(request(), owner, intent.id)).rejects.toMatchObject({ code: 'UPLOAD_CHANGED' });
  expect(await withState(state => Object.keys(state.jobs))).toEqual([]);
});

it('expires staging uploads and preserves immutable credential archives during job cleanup', async () => {
  const intent = await reserve(); await part(intent, '0', fixture);
  await putPrivate(intent.id, 'upload.bin', fixture);
  const credentialId = `0x${'ab'.repeat(32)}`; const digest = hashUpload(fixture);
  await putArchive(credentialId, digest, fixture); await putArchive(credentialId, digest, fixture);
  await withState(state => { state.uploadIntents![intent.id]!.expiresAt = '2000-01-01T00:00:00.000Z'; });
  await cleanupUploadIntents(); await deletePrivate(intent.id);
  expect([...storage.objects.keys()]).toEqual([`credentials/${credentialId}/${digest.slice(2)}.pdf`]);
  expect(await getArchive(credentialId, digest)).toEqual(fixture);
  expect((await part(intent, '0', fixture)).status).toBe(410);
  await expect(finalizeUpload(request(), owner, intent.id)).rejects.toMatchObject({ status: 410 });
});

it('uses Neon on Netlify without exposing a Vercel upload token', async () => {
  vi.stubEnv('SITE_ID', 'site-id'); vi.stubEnv('URL', 'https://test.netlify.app');
  expect(netlifyBlobsEnabled()).toBe(false);
  const id = `0x${'12'.repeat(32)}`;
  await putPrivate(id, 'upload.bin', fixture);
  expect(await getPrivate(id, 'upload.bin')).toEqual(fixture);
  await expect(uploadToken(request())).rejects.toMatchObject({ code: 'STORAGE_REQUIRED' });
});

it('uses Neon aliases instead of platform AWS credentials and region', async () => {
  vi.stubEnv('SITE_ID', 'site-id'); vi.stubEnv('URL', 'https://test.netlify.app');
  vi.stubEnv('AWS_ACCESS_KEY_ID', 'platform-access-key'); vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'platform-secret-key');
  vi.stubEnv('AWS_REGION', 'us-west-2'); vi.stubEnv('AWS_ENDPOINT_URL_S3', 'https://platform.test.invalid');
  vi.stubEnv('NEON_STORAGE_ACCESS_KEY_ID', 'neon-access-key'); vi.stubEnv('NEON_STORAGE_SECRET_ACCESS_KEY', 'neon-secret-key');
  vi.stubEnv('NEON_STORAGE_REGION', 'us-east-2'); vi.stubEnv('NEON_STORAGE_ENDPOINT', 'https://neon.test.invalid');
  const id = `0x${'34'.repeat(32)}`;
  await putPrivate(id, 'upload.bin', fixture);
  expect(await getPrivate(id, 'upload.bin')).toEqual(fixture);
  expect(storage.configurations.at(-1)).toMatchObject({
    endpoint: 'https://neon.test.invalid', region: 'us-east-2', forcePathStyle: true,
    credentials: { accessKeyId: 'neon-access-key', secretAccessKey: 'neon-secret-key' },
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
  });
});

it('rejects missing Neon and AWS secret credentials before writing or reserving an upload', async () => {
  vi.stubEnv('AWS_SECRET_ACCESS_KEY', ''); vi.stubEnv('NEON_STORAGE_SECRET_ACCESS_KEY', '');
  await expect(putPrivate(`0x${'56'.repeat(32)}`, 'upload.bin', fixture)).rejects.toThrow('Neon Object Storage is not configured');
  await expect(reserve()).rejects.toMatchObject({ status: 503, code: 'CONFIGURATION_REQUIRED' });
  expect(storage.calls).toEqual([]);
  expect(storage.configurations).toEqual([]);
  expect(storage.objects.size).toBe(0);
  expect(await withState(state => Object.keys(state.uploadIntents || {}))).toEqual([]);
});
