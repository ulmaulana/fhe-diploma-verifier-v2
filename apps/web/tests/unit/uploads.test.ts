import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPayloadFromClientToken } from '@vercel/blob/client';
import { hashUpload } from '@verifikasi/domain';
import { bootstrap, mutation } from '../../src/server/http';
import { eraseJob } from '../../src/server/jobs';
import { withState } from '../../src/server/store';
import { assertPrivateBlobUrl, getPrivate, putPrivate } from '../../src/server/storage';
import { createUploadIntent, cleanupUploadIntents } from '../../src/server/upload-intents';
import { finalizeUpload, uploadToken } from '../../src/server/uploads';
import type { Session, UploadIntent } from '../../src/server/types';

const blobs = vi.hoisted(() => new Map<string, { bytes: Buffer; contentType: string }>());
vi.mock('@vercel/blob', () => {
  const url = (pathname: string) => `https://teststore.private.blob.vercel-storage.com/${pathname}`;
  return {
    put: vi.fn(async (pathname: string, bytes: Buffer, options: { access: string; contentType: string }) => {
      expect(options.access).toBe('private'); blobs.set(pathname, { bytes, contentType: options.contentType }); return { pathname, url: url(pathname) };
    }),
    get: vi.fn(async (pathname: string, options: { access: string; useCache: boolean }) => {
      expect(options.access).toBe('private'); expect(options.useCache).toBe(false);
      const object = blobs.get(pathname); if (!object) return null;
      return { statusCode: 200, stream: new ReadableStream({ start(controller) { controller.enqueue(object.bytes); controller.close(); } }), blob: { pathname, url: url(pathname), contentType: object.contentType, size: object.bytes.length } };
    }),
    del: vi.fn(async (paths: string | string[]) => { for (const pathname of Array.isArray(paths) ? paths : [paths]) blobs.delete(pathname.startsWith('https:') ? new URL(pathname).pathname.slice(1) : pathname); }),
    list: vi.fn(async ({ prefix }: { prefix: string }) => ({ blobs: [...blobs.keys()].filter(pathname => pathname.startsWith(prefix)).map(pathname => ({ pathname, url: url(pathname) })), hasMore: false })),
    head: vi.fn(async (pathname: string) => ({ pathname, url: url(pathname) })),
  };
});

let directory: string;
let owner: Session;
let cookie: string;
const origin = 'http://localhost:3000';
const fixture = Buffer.from('%PDF-1.7\nEXAMPLE synthetic document');
const key = 'direct-upload-test-key-123';
function request(idempotencyKey = key) { return new Request(`${origin}/api/uploads/intents`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey } }); }
async function reserve(bytes = fixture, idempotencyKey = key) {
  return createUploadIntent(request(idempotencyKey), owner, { fileName: 'synthetic.pdf', fileSize: bytes.length, mimeType: 'application/pdf', clientDigest: hashUpload(bytes) });
}
function staged(intent: UploadIntent, bytes = fixture, contentType = 'application/pdf') { blobs.set(intent.pathname, { bytes, contentType }); }
function tokenRequest(intent: UploadIntent, pathname = intent.pathname, csrf = owner.csrf) {
  return new Request(`${origin}/api/uploads/token`, { method: 'POST', headers: { cookie, origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'blob.generate-client-token', payload: { pathname, multipart: false, clientPayload: JSON.stringify({ intentId: intent.id, csrf }) } }) });
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'verifikasi-blob-test-'));
  vi.stubEnv('PRIVATE_DATA_DIR', directory); vi.stubEnv('APP_MODE', 'demo'); vi.stubEnv('APP_ORIGIN', origin);
  vi.stubEnv('DATABASE_URL', ''); vi.stubEnv('S3_BUCKET', ''); vi.stubEnv('VERCEL', '');
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'vercel_blob_rw_teststore_fixturetestsecret'); vi.stubEnv('BLOB_STORE_HOSTNAME', 'teststore.private.blob.vercel-storage.com');
  blobs.clear(); vi.clearAllMocks();
  const response = await bootstrap(new Request(`${origin}/api/session`)); const data = await response.json();
  cookie = response.headers.get('set-cookie')!;
  owner = await mutation(new Request(origin, { headers: { cookie, origin, 'x-csrf-token': data.csrfToken } }));
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(directory, { recursive: true, force: true }); });

describe('private direct uploads', () => {
  it('accepts 10 MiB directly, checks real bytes, and retries without creating another job', async () => {
    const bytes = Buffer.alloc(10 * 1024 * 1024); fixture.copy(bytes);
    const intent = await reserve(bytes); staged(intent, bytes);
    const job = await finalizeUpload(request(), owner, intent.id);
    expect(job.fileSize).toBe(bytes.length); expect(job.digest).toBe(hashUpload(bytes));
    expect(blobs.has(intent.pathname)).toBe(false);
    expect((await getPrivate(job.id, 'upload.bin')).equals(bytes)).toBe(true);
    expect((await finalizeUpload(request(), owner, intent.id)).id).toBe(job.id);
    expect(await withState(state => Object.keys(state.jobs).length)).toBe(1);
  });
  it('binds upload token to owner, exact path, size, type, expiry, and CSRF', async () => {
    const intent = await reserve();
    await expect(finalizeUpload(request(), { ...owner, id: 'another-owner' }, intent.id)).rejects.toMatchObject({ status: 404 });
    await expect(uploadToken(tokenRequest(intent, `jobs/${intent.id}/upload.bin`))).rejects.toMatchObject({ status: 403 });
    await expect(uploadToken(tokenRequest(intent, intent.pathname, 'wrong-csrf'))).rejects.toMatchObject({ status: 403 });
    const token = await uploadToken(tokenRequest(intent));
    expect(token.type).toBe('blob.generate-client-token');
    if (token.type !== 'blob.generate-client-token') throw new Error('Expected upload token');
    expect(getPayloadFromClientToken(token.clientToken)).toMatchObject({ pathname: intent.pathname, maximumSizeInBytes: fixture.length, allowedContentTypes: ['application/pdf'], allowOverwrite: false, addRandomSuffix: false, validUntil: Date.parse(intent.expiresAt) });
  });
  it('rejects changed content despite matching filename, MIME, and size', async () => {
    const intent = await reserve(); const changed = Buffer.from(fixture); changed[changed.length - 1] = changed[changed.length - 1]! ^ 1; staged(intent, changed);
    await expect(finalizeUpload(request(), owner, intent.id)).rejects.toMatchObject({ code: 'UPLOAD_CHANGED' });
    expect(await withState(state => Object.keys(state.jobs))).toEqual([]);
    await expect(createUploadIntent(request(), owner, { fileName: 'synthetic.pdf', fileSize: fixture.length, mimeType: 'application/pdf', clientDigest: hashUpload(changed) })).rejects.toMatchObject({ status: 409 });
  });
  it('rejects a spoofed file signature and mismatching metadata', async () => {
    const fake = Buffer.from('<script>synthetic.invalid</script>'); const intent = await reserve(fake); staged(intent, fake);
    await expect(finalizeUpload(request(), owner, intent.id)).rejects.toMatchObject({ status: 415 });
    staged(intent, fake, 'image/png');
    await expect(finalizeUpload(request(), owner, intent.id)).rejects.toMatchObject({ code: 'UPLOAD_CHANGED' });
  });
  it('never resurrects a deleted job through finalization or late staging uploads', async () => {
    const intent = await reserve(); staged(intent);
    const job = await finalizeUpload(request(), owner, intent.id); await eraseJob(job.id, owner.id);
    staged(intent); await cleanupUploadIntents();
    expect(blobs.size).toBe(0);
    await expect(finalizeUpload(request(), owner, intent.id)).rejects.toMatchObject({ status: 410 });
    staged(intent); await cleanupUploadIntents(); expect(blobs.size).toBe(0);
  });
  it('expires abandoned uploads and cleans objects from interrupted database commits', async () => {
    const intent = await reserve(); staged(intent); await putPrivate(intent.id, 'upload.bin', fixture);
    await withState(state => { state.uploadIntents![intent.id]!.expiresAt = new Date(Date.now() - 1).toISOString(); });
    await cleanupUploadIntents(); expect(blobs.size).toBe(0);
    await expect(finalizeUpload(request(), owner, intent.id)).rejects.toMatchObject({ status: 410 });
    const removed = await withState(state => state.uploadIntents![intent.id]!);
    expect(removed.fileName).toBe(''); expect(removed.clientDigest).toBe(''); expect(removed.deletedAt).toBeTruthy();
  });
  it('reserves quota before accepting bytes and rejects oversized upload declarations', async () => {
    for (let i = 0; i < 5; i++) await reserve(fixture, `${key}-${i}`);
    await expect(reserve(fixture, `${key}-6`)).rejects.toMatchObject({ status: 429 });
    await expect(createUploadIntent(request(), owner, { fileName: 'large.pdf', fileSize: 10 * 1024 * 1024 + 1, mimeType: 'application/pdf', clientDigest: hashUpload(fixture) })).rejects.toMatchObject({ status: 413 });
  });
  it('rejects public, foreign-store, and tampered object URLs and unsigned callbacks', async () => {
    expect(() => assertPrivateBlobUrl('https://teststore.public.blob.vercel-storage.com/document.pdf', 'document.pdf')).toThrow();
    expect(() => assertPrivateBlobUrl('https://other.private.blob.vercel-storage.com/document.pdf', 'document.pdf')).toThrow();
    expect(() => assertPrivateBlobUrl('https://teststore.private.blob.vercel-storage.com/other.pdf', 'document.pdf')).toThrow();
    await expect(uploadToken(new Request(`${origin}/api/uploads/token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'blob.upload-completed', payload: { blob: { pathname: 'untrusted' } } }) }))).rejects.toThrow();
  });
  it('refuses ephemeral file storage on Vercel when the private Blob token is absent', async () => {
    vi.stubEnv('VERCEL', '1'); vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
    await expect(putPrivate(`0x${'12'.repeat(32)}`, 'upload.bin', fixture)).rejects.toThrow('private Vercel Blob');
    await expect(getPrivate(`0x${'12'.repeat(32)}`, 'upload.bin')).rejects.toThrow('private Vercel Blob');
  });
});
