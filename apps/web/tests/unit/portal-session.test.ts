import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Wallet } from 'ethers';
import type { Job, State } from '../../src/server/types';

const mocks = vi.hoisted(() => ({
  state: { sessions: {}, jobs: {}, rates: {}, audit: [] } as State,
  issuer: vi.fn(),
}));
vi.mock('@verifikasi/chain/server', () => ({ getIssuer: mocks.issuer }));
vi.mock('../../src/server/store', () => ({ withState: async (fn: (state: State) => unknown) => fn(mocks.state) }));
// vitest.config resolves the same @ alias as Next; the state mock above also
// applies to route handlers while session and CSRF helpers remain real.

import { bootstrap, hashToken } from '../../src/server/http';
import { POST as challenge } from '../../src/app/api/portal/challenge/route';
import { GET, POST, DELETE } from '../../src/app/api/portal/session/route';

const origin = 'http://localhost:3000';
const wallet = new Wallet(`0x${'11'.repeat(32)}`);
const otherWallet = new Wallet(`0x${'22'.repeat(32)}`);
interface BrowserSession { cookie: string; csrf: string; id: string }
let current: BrowserSession;
let other: BrowserSession;

async function browserSession(): Promise<BrowserSession> {
  const response = await bootstrap(new Request(`${origin}/api/session`));
  const cookie = response.headers.get('set-cookie')!.split(';')[0]!;
  const data = await response.json();
  return { cookie, csrf: data.csrfToken, id: hashToken(cookie.slice(cookie.indexOf('=') + 1)) };
}

function request(method: string, browser = current, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`${origin}/api/portal/session`, {
    method, headers: { cookie: browser.cookie, origin, 'x-csrf-token': browser.csrf, 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function signature(browser = current, signer = wallet) {
  const response = await challenge(request('POST', browser, { address: signer.address }));
  expect(response.status).toBe(200);
  const { message } = await response.json();
  return { address: signer.address, signature: await signer.signMessage(message) };
}

beforeEach(async () => {
  vi.resetAllMocks();
  mocks.state = { sessions: {}, jobs: {}, rates: {}, audit: [] };
  vi.stubEnv('APP_MODE', 'demo');
  vi.stubEnv('APP_ORIGIN', origin);
  current = await browserSession();
  other = await browserSession();
});
afterEach(() => vi.unstubAllEnvs());

describe('portal wallet session', () => {
  it('reads only the current session wallet without querying the chain, including in testnet mode', async () => {
    vi.stubEnv('APP_MODE', 'testnet');
    const anonymous = await GET(request('GET'));
    expect(anonymous.status).toBe(200);
    expect(await anonymous.json()).toEqual({ wallet: null, mode: 'testnet' });
    mocks.state.sessions[current.id]!.wallet = wallet.address;
    mocks.state.sessions[other.id]!.wallet = otherWallet.address;

    const response = await GET(request('GET'));
    expect(await response.json()).toEqual({ wallet: wallet.address, mode: 'testnet' });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.issuer).not.toHaveBeenCalled();
  });

  it('authenticates a signed challenge once and rejects a replay', async () => {
    const signed = await signature();
    const response = await POST(request('POST', current, signed));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ wallet: wallet.address, issuer: null, mode: 'demo' });
    expect(mocks.state.sessions[current.id]!.challenge).toBeUndefined();
    expect(mocks.state.sessions[current.id]!.challengeExpiresAt).toBeUndefined();
    const replay = await POST(request('POST', current, signed));
    expect(replay.status).toBe(401);
    expect(await replay.json()).toMatchObject({ code: 'CHALLENGE_EXPIRED' });
  });

  it('logs out only the wallet and pending challenge while retaining the session and verification history', async () => {
    await POST(request('POST', current, await signature()));
    await signature();
    mocks.state.sessions[other.id]!.wallet = otherWallet.address;
    const timestamp = new Date().toISOString();
    const job: Job = {
      id: 'history-job', owner: current.id, idempotencyKey: 'history-key', status: 'COMPLETED',
      fileName: '', fileSize: 0, mimeType: 'application/pdf', createdAt: timestamp,
      expiresAt: '2099-01-01T00:00:00.000Z', artifactsExpireAt: timestamp, mode: 'demo', synthetic: true, attempts: 0,
    };
    mocks.state.jobs[job.id] = job;
    const expected = structuredClone(mocks.state);
    delete expected.sessions[current.id]!.wallet;
    delete expected.sessions[current.id]!.challenge;
    delete expected.sessions[current.id]!.challengeExpiresAt;

    const response = await DELETE(request('DELETE'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ wallet: null, mode: 'demo' });
    expect(response.headers.has('set-cookie')).toBe(false);
    expect(mocks.state).toEqual(expected);
    expect(await (await GET(request('GET'))).json()).toEqual({ wallet: null, mode: 'demo' });
    expect((await DELETE(request('DELETE'))).status).toBe(200);
  });

  it('invalidates a signature whose challenge was pending when the wallet disconnected', async () => {
    const signed = await signature();
    expect((await DELETE(request('DELETE'))).status).toBe(200);
    const response = await POST(request('POST', current, signed));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'CHALLENGE_EXPIRED' });
    expect(mocks.state.sessions[current.id]!.wallet).toBeUndefined();
  });

  it('cannot authenticate another browser session with a signature from the first session', async () => {
    const signed = await signature();
    await signature(other);
    const response = await POST(request('POST', other, signed));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'INVALID_SIGNATURE' });
    expect(mocks.state.sessions[other.id]!.wallet).toBeUndefined();
    expect((await POST(request('POST', current, signed))).status).toBe(200);
  });

  it.each(['GET', 'DELETE'] as const)('rejects %s without an existing valid browser session', async method => {
    const handler = method === 'GET' ? GET : DELETE;
    const missing = await handler(request(method, current, undefined, { cookie: '' }));
    expect(missing.status).toBe(401);
    expect(await missing.json()).toMatchObject({ code: 'SESSION_REQUIRED' });
    mocks.state.sessions[current.id]!.expiresAt = '2000-01-01T00:00:00.000Z';
    const expired = await handler(request(method));
    expect(expired.status).toBe(401);
    expect(await expired.json()).toMatchObject({ code: 'SESSION_EXPIRED' });
  });

  it.each(['POST', 'DELETE'] as const)('protects %s from foreign origins, missing CSRF and another session CSRF', async method => {
    const signed = await signature();
    mocks.state.sessions[current.id]!.wallet = wallet.address;
    const before = structuredClone(mocks.state);
    const handler = method === 'POST' ? POST : DELETE;
    const rejectedHeaders: Record<string, string>[] = [
      { origin: 'https://foreign.example' },
      { 'x-csrf-token': '' },
      { 'x-csrf-token': other.csrf },
    ];
    for (const headers of rejectedHeaders) {
      const response = await handler(request(method, current, method === 'POST' ? signed : undefined, headers));
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: 'CSRF_REJECTED' });
      expect(mocks.state).toEqual(before);
    }
  });
});
