import { afterEach, beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

it('keeps the server session error and retries bootstrap after configuration is fixed', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json({ error: 'Penyimpanan sesi belum dikonfigurasi.', code: 'DATABASE_CONFIGURATION_REQUIRED' }, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ csrfToken: 'new-session' }));
  vi.stubGlobal('fetch', fetch);
  const { getSession } = await import('../../src/features/shared/api');
  await expect(getSession()).rejects.toThrow('Penyimpanan sesi belum dikonfigurasi.');
  await expect(getSession()).resolves.toMatchObject({ csrfToken: 'new-session' });
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('explains a hosting HTML error instead of exposing a JSON parser exception', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 })));
  const { getSession } = await import('../../src/features/shared/api');
  await expect(getSession()).rejects.toThrow('Sesi tidak dapat dibuat.');
});

it('does not submit a wallet challenge when session creation fails', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ error: 'Penyimpanan sesi tidak tersedia.' }, { status: 503 }));
  vi.stubGlobal('fetch', fetch);
  const { api } = await import('../../src/features/shared/api');
  await expect(api('/api/portal/challenge', { method: 'POST' })).rejects.toThrow('Penyimpanan sesi tidak tersedia.');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0]?.[0]).toBe('/api/session');
});
