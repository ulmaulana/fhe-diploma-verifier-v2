import { afterEach, describe, expect, it, vi } from 'vitest';
import { withState } from '../../src/server/store';
import { config } from '../../src/server/config';
import { GET } from '../../src/app/api/session/route';

afterEach(() => vi.unstubAllEnvs());

describe('deployment persistence configuration', () => {
  it('refuses local filesystem fallback on Vercel, including demo deployments', async () => {
    vi.stubEnv('DATABASE_URL', ''); vi.stubEnv('VERCEL', '1'); vi.stubEnv('APP_MODE', 'demo');
    await expect(withState(() => 'unsafe fallback')).rejects.toMatchObject({ code: 'DATABASE_CONFIGURATION_REQUIRED' });
  });

  it('requires a database for local testnet mode', async () => {
    vi.stubEnv('DATABASE_URL', ''); vi.stubEnv('VERCEL', ''); vi.stubEnv('APP_MODE', 'testnet');
    await expect(withState(() => 'unsafe fallback')).rejects.toMatchObject({ code: 'DATABASE_CONFIGURATION_REQUIRED' });
  });

  it.each(['build', 'runtime'])('returns an actionable 503 without setting a session cookie on Netlify (%s)', async phase => {
    vi.stubEnv('DATABASE_URL', ''); vi.stubEnv('VERCEL', ''); vi.stubEnv('APP_MODE', 'demo');
    vi.stubEnv('NETLIFY', phase === 'build' ? 'true' : '');
    vi.stubEnv('SITE_ID', 'test-site'); vi.stubEnv('URL', 'https://test.netlify.app');
    const response = await GET(new Request('https://test.netlify.app/api/session'));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'DATABASE_CONFIGURATION_REQUIRED' });
    expect(response.headers.has('set-cookie')).toBe(false);
  });

  it('uses the trusted Netlify URL when no explicit origin is set, while respecting APP_ORIGIN', () => {
    vi.stubEnv('NETLIFY', ''); vi.stubEnv('SITE_ID', 'test-site');
    vi.stubEnv('URL', 'https://test.netlify.app/'); vi.stubEnv('APP_ORIGIN', '');
    expect(config().origin).toBe('https://test.netlify.app');
    vi.stubEnv('APP_ORIGIN', ' https://custom.example/ ');
    expect(config().origin).toBe('https://custom.example');
    vi.stubEnv('SITE_ID', ''); vi.stubEnv('APP_ORIGIN', '');
    expect(config().origin).toBe('http://localhost:3000');
  });
});
