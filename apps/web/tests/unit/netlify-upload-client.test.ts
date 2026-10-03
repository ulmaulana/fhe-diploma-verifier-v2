import { beforeEach, expect, it, vi } from 'vitest';
import { uploadDocument } from '../../src/features/verification/upload';
import { UPLOAD_CHUNK_BYTES } from '../../src/features/shared/upload-limits';
import { api, getSession } from '../../src/features/shared/api';

vi.mock('../../src/features/shared/api', () => ({ api: vi.fn(), getSession: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getSession).mockResolvedValue({ csrfToken: 'session', mode: 'demo', configured: true, expiresAt: '', uploadMode: 'netlify' });
});

it('sends bounded binary chunks before finalization using the same idempotency key', async () => {
  const size = UPLOAD_CHUNK_BYTES * 2 + 123;
  const file = new File([new Uint8Array(size)], 'test.pdf', { type: 'application/pdf' });
  vi.mocked(api).mockResolvedValueOnce({ id: 'intent-id', pathname: 'unused', finalized: false })
    .mockResolvedValueOnce({ uploaded: true }).mockResolvedValueOnce({ uploaded: true }).mockResolvedValueOnce({ uploaded: true })
    .mockResolvedValueOnce({ id: 'job-id' });
  expect(await uploadDocument(file, 'retry-key')).toEqual({ id: 'job-id' });
  expect(vi.mocked(api).mock.calls.map(([url]) => url)).toEqual([
    '/api/uploads/intents', '/api/uploads/intent-id/parts/0', '/api/uploads/intent-id/parts/1', '/api/uploads/intent-id/parts/2', '/api/uploads/intent-id/finalize',
  ]);
  const parts = vi.mocked(api).mock.calls.slice(1, 4).map(([, options]) => options!);
  expect(parts.map(options => (options.body as Blob).size)).toEqual([UPLOAD_CHUNK_BYTES, UPLOAD_CHUNK_BYTES, 123]);
  expect(parts.every(options => options.method === 'PUT' && new Headers(options.headers).get('Idempotency-Key') === 'retry-key')).toBe(true);
});

it('does not resend chunks when a previous request already finalized the intent', async () => {
  vi.mocked(api).mockResolvedValueOnce({ id: 'intent-id', finalized: true }).mockResolvedValueOnce({ id: 'existing-job' });
  expect(await uploadDocument(new File(['%PDF-'], 'test.pdf', { type: 'application/pdf' }), 'retry-key')).toEqual({ id: 'existing-job' });
  expect(api).toHaveBeenCalledTimes(2);
});
