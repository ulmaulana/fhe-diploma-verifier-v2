import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWalletAuthentication, walletIdentityKey, type WalletAuthenticationState, type WalletIdentity } from '../../src/features/portal/wallet-authentication';

const address = `0x${'a1'.repeat(20)}`;
const otherAddress = `0x${'b2'.repeat(20)}`;
const selected: WalletIdentity = { address, chainId: 11155111, connectorId: 'selected-wallet' };
const sessionPath = '/api/portal/session';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function setup(initialWallet: string | null = null, initialIdentity: WalletIdentity | null = selected) {
  let identity = initialIdentity;
  const states: WalletAuthenticationState[] = [];
  const server = {
    wallet: initialWallet,
    challenge: '',
    nonceNumber: 0,
    getGate: undefined as Promise<void> | undefined,
    postGate: undefined as Promise<void> | undefined,
    challengeGate: undefined as Promise<void> | undefined,
    expiresAt: undefined as string | undefined,
    malformedChallenge: false,
    failPost: false,
    failDelete: false,
  };
  const request = vi.fn(async (path: string, options?: RequestInit) => {
    const method = options?.method ?? 'GET';
    if (path === '/api/portal/challenge') {
      const { address: requestedAddress } = JSON.parse(String(options?.body));
      const nonce = (++server.nonceNumber).toString(16).padStart(48, '0');
      const expiresAt = server.expiresAt ?? new Date(Date.now() + 300_000).toISOString();
      server.challenge = `localhost meminta Anda masuk.\n\nWallet: ${requestedAddress}\nNonce: ${nonce}\nBerlaku sampai: ${expiresAt}`;
      const response = { message: server.malformedChallenge ? 'No nonce' : server.challenge, expiresAt };
      await server.challengeGate;
      return response;
    }
    if (path !== sessionPath) throw new Error(`Unexpected path: ${path}`);
    if (method === 'GET') {
      const wallet = server.wallet;
      await server.getGate;
      return { wallet, mode: 'testnet' };
    }
    if (method === 'DELETE') {
      if (server.failDelete) throw new Error('Logout request failed');
      server.wallet = null;
      server.challenge = '';
      return { wallet: null, mode: 'testnet' };
    }
    if (method === 'POST') {
      if (!server.challenge) throw new Error('Challenge missing');
      const body = JSON.parse(String(options?.body));
      server.wallet = body.address;
      server.challenge = '';
      await server.postGate;
      if (server.failPost) throw new Error('Response unavailable');
      return { wallet: body.address };
    }
    throw new Error(`Unexpected method: ${method}`);
  });
  const bootstrap = vi.fn(async () => undefined);
  const controller = createWalletAuthentication({
    getIdentity: () => identity,
    request: async <T>(path: string, options?: RequestInit) => await request(path, options) as T,
    bootstrap,
    onChange: state => states.push(state),
  });
  async function message() {
    const nonce = await controller.getNonce();
    return controller.createMessage({ nonce, address: identity!.address, chainId: identity!.chainId });
  }
  return {
    controller, request, bootstrap, states, server, message,
    setIdentity: (value: WalletIdentity | null) => { identity = value; },
    latest: () => states.at(-1)!,
    methods: () => request.mock.calls.filter(([path]) => path === sessionPath).map(([, options]) => options?.method ?? 'GET'),
  };
}

afterEach(() => vi.useRealTimers());

describe('wallet authentication controller', () => {
  it('binds the exact server message and verification to the selected account', async () => {
    const app = setup();
    const message = await app.message();
    expect(message).toBe(app.server.challenge);
    expect(app.request).toHaveBeenCalledWith('/api/portal/challenge', expect.objectContaining({ body: JSON.stringify({ address }) }));
    const beforeVerify = app.states.length;
    expect(await app.controller.verify({ message, signature: 'selected-connector-signature' })).toBe(true);
    expect(app.request).toHaveBeenCalledWith(sessionPath, expect.objectContaining({
      method: 'POST', body: JSON.stringify({ address, signature: 'selected-connector-signature' }),
    }));
    expect(app.latest()).toMatchObject({ wallet: address, loading: false });
    expect(app.states.slice(beforeVerify).every(state => !state.loading)).toBe(true);
    expect(await app.controller.verify({ message, signature: 'replay' })).toBe(false);
    expect(app.methods().filter(method => method === 'POST')).toHaveLength(1);
  });

  it('restores only a matching connected Sepolia wallet and treats address casing as the same account', async () => {
    const app = setup(address.toUpperCase());
    await app.controller.sync();
    expect(app.latest()).toMatchObject({ wallet: address.toUpperCase(), loading: false });
    await app.controller.sync();
    expect(app.methods()).toEqual(['GET']);
    expect(walletIdentityKey(selected)).toBe(walletIdentityKey({ ...selected, address: address.toUpperCase() }));
  });

  it.each([
    ['different account', { ...selected, address: otherAddress }],
    ['unsupported network', { ...selected, chainId: 1 }],
    ['disconnected wallet', null],
  ] as const)('clears restored auth for a %s', async (_name, identity) => {
    const app = setup(address, identity);
    await app.controller.sync();
    expect(app.methods()).toEqual(['GET', 'DELETE']);
    expect(app.latest()).toMatchObject({ wallet: null, loading: false });
    expect(app.server.wallet).toBeNull();
  });

  it('never requests a challenge on an unsupported network', async () => {
    const app = setup(null, { ...selected, chainId: 1 });
    await expect(app.controller.getNonce()).rejects.toThrow('Sepolia');
    expect(app.request).toHaveBeenCalledTimes(1);
  });

  it('rejects mismatched address, nonce, network, and signed message', async () => {
    const app = setup();
    const nonce = await app.controller.getNonce();
    const args = { nonce, address, chainId: selected.chainId };
    for (const change of [{ address: otherAddress }, { nonce: 'wrong-nonce' }, { chainId: 1 }]) {
      await expect(app.controller.createMessage({ ...args, ...change })).rejects.toThrow('berubah');
    }
    const message = await app.controller.createMessage(args);
    expect(await app.controller.verify({ message: `${message} edited`, signature: 'signature' })).toBe(false);
    expect(app.methods()).toEqual(['GET']);
    expect(app.server.wallet).toBeNull();
  });

  it.each([
    ['account switch', { ...selected, address: otherAddress }],
    ['chain switch', { ...selected, chainId: 1 }],
    ['connector switch', { ...selected, connectorId: 'another-wallet' }],
    ['disconnect', null],
  ] as const)('invalidates a pending signature on %s before verification', async (_name, identity) => {
    const app = setup();
    const message = await app.message();
    const previousRevision = app.latest().revision;
    app.setIdentity(identity);
    const change = app.controller.sync();
    expect(app.latest()).toMatchObject({ wallet: null, revision: previousRevision + 1 });
    expect(await app.controller.verify({ message, signature: 'late-signature' })).toBe(false);
    await change;
    expect(app.methods()).toEqual(['GET', 'DELETE']);
    expect(app.server.challenge).toBe('');
  });

  it.each([
    ['account switch', { ...selected, address: otherAddress }],
    ['chain switch', { ...selected, chainId: 1 }],
    ['connector switch', { ...selected, connectorId: 'another-wallet' }],
    ['disconnect', null],
  ] as const)('ignores an in-flight verification response after %s', async (_name, identity) => {
    const app = setup();
    const message = await app.message();
    const gate = deferred();
    app.server.postGate = gate.promise;
    const verification = app.controller.verify({ message, signature: 'signature' });
    await vi.waitFor(() => expect(app.methods()).toContain('POST'));
    const start = app.states.length;
    app.setIdentity(identity);
    const change = app.controller.sync();
    expect(app.latest().wallet).toBeNull();
    expect(app.methods()).toEqual(['GET', 'POST']);
    gate.resolve();
    expect(await verification).toBe(false);
    await change;
    expect(app.server.wallet).toBeNull();
    expect(app.states.slice(start).every(state => state.wallet === null)).toBe(true);
    expect(app.methods().slice(-1)).toEqual(['DELETE']);
  });

  it('rechecks the current identity even when its React sync effect has not run yet', async () => {
    const app = setup();
    const message = await app.message();
    const gate = deferred();
    app.server.postGate = gate.promise;
    const verification = app.controller.verify({ message, signature: 'signature' });
    await vi.waitFor(() => expect(app.methods()).toContain('POST'));
    app.setIdentity(null);
    gate.resolve();
    expect(await verification).toBe(false);
    expect(app.server.wallet).toBeNull();
    expect(app.states.every(state => state.wallet === null)).toBe(true);
  });

  it('serializes logout after an in-flight POST and blocks restoration for the same connected account', async () => {
    const app = setup();
    const message = await app.message();
    const gate = deferred();
    app.server.postGate = gate.promise;
    const verification = app.controller.verify({ message, signature: 'signature' });
    await vi.waitFor(() => expect(app.methods()).toContain('POST'));
    const revision = app.latest().revision;
    const logout = app.controller.signOut();
    expect(app.latest()).toMatchObject({ wallet: null, revision: revision + 1 });
    expect(app.methods()).toEqual(['GET', 'POST']);
    gate.resolve();
    expect(await verification).toBe(false);
    await logout;
    await app.controller.sync();
    expect(app.server.wallet).toBeNull();
    expect(app.methods().slice(-1)).toEqual(['DELETE']);
    expect(app.methods().filter(method => method === 'GET')).toHaveLength(1);
    expect(app.latest()).toMatchObject({ wallet: null, loading: false });
  });

  it('cancels restoration and an initial nonce request immediately on logout', async () => {
    const app = setup(address);
    const gate = deferred();
    app.server.getGate = gate.promise;
    const nonce = app.controller.getNonce();
    await vi.waitFor(() => expect(app.methods()).toEqual(['GET']));
    const rejection = expect(nonce).rejects.toThrow('berubah');
    const logout = app.controller.signOut();
    gate.resolve();
    await rejection;
    await logout;
    expect(app.methods()).toEqual(['GET', 'DELETE']);
    expect(app.request).toHaveBeenCalledTimes(2);
    expect(app.states.every(state => state.wallet === null)).toBe(true);
  });

  it('rejects a challenge response delivered after disconnect and removes the server challenge', async () => {
    const app = setup();
    const gate = deferred();
    app.server.challengeGate = gate.promise;
    const nonce = app.controller.getNonce();
    await vi.waitFor(() => expect(app.server.challenge).not.toBe(''));
    const rejection = expect(nonce).rejects.toThrow('berubah');
    app.setIdentity(null);
    const disconnected = app.controller.sync();
    gate.resolve();
    await rejection;
    await disconnected;
    expect(app.server.challenge).toBe('');
    expect(app.latest()).toMatchObject({ wallet: null, loading: false });
  });

  it('fails clearly for missing or expired challenges and can request a fresh nonce for retry', async () => {
    vi.useFakeTimers();
    const app = setup();
    await expect(app.controller.createMessage({ nonce: 'missing', address, chainId: selected.chainId })).rejects.toThrow('tidak tersedia');
    const nonce = await app.controller.getNonce();
    vi.advanceTimersByTime(300_001);
    await expect(app.controller.createMessage({ nonce, address, chainId: selected.chainId })).rejects.toThrow('telah berakhir');
    const nextMessage = await app.message();
    expect(nextMessage).not.toContain(`Nonce: ${nonce}`);
    expect(await app.controller.verify({ message: nextMessage, signature: 'new-signature' })).toBe(true);
  });

  it('does not submit a signature once its challenge expires', async () => {
    vi.useFakeTimers();
    const app = setup();
    const message = await app.message();
    vi.advanceTimersByTime(300_001);
    expect(await app.controller.verify({ message, signature: 'late-signature' })).toBe(false);
    expect(app.methods()).toEqual(['GET']);
    expect(app.latest().error).toContain('telah berakhir');
  });

  it('rejects malformed or already expired server challenges', async () => {
    const app = setup();
    app.server.malformedChallenge = true;
    await expect(app.controller.getNonce()).rejects.toThrow('Pesan masuk');
    app.server.malformedChallenge = false;
    app.server.expiresAt = '2000-01-01T00:00:00.000Z';
    await expect(app.controller.getNonce()).rejects.toThrow('telah berakhir');
    expect(app.latest().wallet).toBeNull();
  });

  it('cleans up auth if the server committed the POST but its response failed', async () => {
    const app = setup();
    const message = await app.message();
    app.server.failPost = true;
    expect(await app.controller.verify({ message, signature: 'signature' })).toBe(false);
    expect(app.methods()).toEqual(['GET', 'POST', 'DELETE']);
    expect(app.server.wallet).toBeNull();
    expect(app.latest()).toMatchObject({ wallet: null, error: 'Response unavailable' });
  });

  it('retries a failed logout before requesting another challenge', async () => {
    const app = setup(address);
    await app.controller.sync();
    app.server.failDelete = true;
    await expect(app.controller.signOut()).rejects.toThrow('Logout request failed');
    expect(app.latest().wallet).toBeNull();
    app.server.failDelete = false;
    const message = await app.message();
    expect(message).toBe(app.server.challenge);
    expect(app.methods()).toEqual(['GET', 'DELETE', 'DELETE']);
    expect(app.server.wallet).toBeNull();
  });
});
