import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { State } from '../../src/server/types';

const runtime = vi.hoisted(() => ({ state: { sessions: {}, jobs: {}, rates: {}, audit: [] } as State }));
vi.mock('../../src/server/store', async original => ({ ...await original<typeof import('../../src/server/store')>(),
  withState: async (action: (state: State) => unknown) => action(runtime.state) }));

import { bootstrap, clientSource } from '../../src/server/http';

const request = (headers: Record<string, string> = {}) => new Request('https://example.test/api/session', { headers });
beforeEach(() => {
  runtime.state = { sessions: {}, jobs: {}, rates: {}, audit: [] };
  for (const key of ['NETLIFY', 'SITE_ID', 'URL', 'VERCEL', 'TRUST_PROXY', 'DATABASE_URL']) vi.stubEnv(key, '');
  vi.stubEnv('APP_MODE', 'demo'); vi.stubEnv('APP_ORIGIN', 'https://example.test');
});
afterEach(() => vi.unstubAllEnvs());

describe('client source for rate limits (S-08)', () => {
  it('ignores client-supplied forwarding headers when no platform or proxy is configured', () => {
    const a = clientSource(request({ 'x-forwarded-for': '1.1.1.1', 'x-nf-client-connection-ip': '2.2.2.2', 'x-vercel-forwarded-for': '3.3.3.3' }));
    const b = clientSource(request({ 'x-forwarded-for': '9.9.9.9' }));
    expect(a).toEqual(b);
    expect(a.via).toBe('local');
  });

  it('uses only the Netlify connection header on Netlify, never X-Forwarded-For', () => {
    vi.stubEnv('NETLIFY', 'true');
    const first = clientSource(request({ 'x-nf-client-connection-ip': '203.0.113.7', 'x-forwarded-for': '1.1.1.1' }));
    const spoofed = clientSource(request({ 'x-nf-client-connection-ip': '203.0.113.7', 'x-forwarded-for': '8.8.8.8' }));
    const other = clientSource(request({ 'x-nf-client-connection-ip': '203.0.113.8' }));
    expect(first).toEqual(spoofed);
    expect(first.via).toBe('netlify');
    expect(other.key).not.toBe(first.key);
    expect(clientSource(request({ 'x-forwarded-for': '1.1.1.1' })).via).toBe('unknown');
    expect(clientSource(request({ 'x-nf-client-connection-ip': 'not-an-ip' })).via).toBe('unknown');
  });

  it('uses x-vercel-forwarded-for on Vercel and the rightmost hop behind one trusted proxy', () => {
    vi.stubEnv('VERCEL', '1');
    expect(clientSource(request({ 'x-vercel-forwarded-for': '198.51.100.4' })).via).toBe('vercel');
    vi.stubEnv('VERCEL', ''); vi.stubEnv('TRUST_PROXY', 'true');
    const a = clientSource(request({ 'x-forwarded-for': '6.6.6.6, 198.51.100.9' }));
    const b = clientSource(request({ 'x-forwarded-for': '7.7.7.7, 198.51.100.9' }));
    expect(a).toEqual(b);
    expect(a.via).toBe('proxy');
  });

  it('limits new sessions per known source and does not lump unknown sources into one bucket', async () => {
    vi.stubEnv('NETLIFY', 'true');
    for (let index = 0; index < 60; index++) await bootstrap(request({ 'x-nf-client-connection-ip': '203.0.113.7' }));
    await expect(bootstrap(request({ 'x-nf-client-connection-ip': '203.0.113.7' }))).rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429 });
    await expect(bootstrap(request({ 'x-nf-client-connection-ip': '203.0.113.8' }))).resolves.toBeInstanceOf(Response);
    // A missing platform header is not a shared bucket for every visitor; the global cap still counts it.
    for (let index = 0; index < 70; index++) await bootstrap(request());
    expect(runtime.state.rates['session:global']!.count).toBe(60 + 1 + 1 + 70);
  });
});
