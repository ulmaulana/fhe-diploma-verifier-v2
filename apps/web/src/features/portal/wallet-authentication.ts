export interface WalletIdentity { address: string; chainId: number; connectorId: string }
export interface WalletAuthenticationState { wallet: string | null; loading: boolean; revision: number; error?: string }

interface Options {
  getIdentity: () => WalletIdentity | null;
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
  bootstrap: () => Promise<unknown>;
  onChange: (state: WalletAuthenticationState) => void;
}
interface Snapshot { key: string; revision: number }
interface Challenge extends Snapshot { address: string; chainId: number; nonce: string; message: string; expiresAt: number }

const sessionPath = '/api/portal/session';
const changedMessage = 'Wallet atau jaringan berubah. Buka kembali proses masuk dengan wallet yang dipilih.';
const expiredMessage = 'Permintaan tanda tangan telah berakhir. Buka kembali proses masuk untuk meminta pesan baru.';

export function walletIdentityKey(identity: WalletIdentity | null): string {
  return identity ? JSON.stringify([identity.address.toLowerCase(), identity.chainId, identity.connectorId]) : '';
}

/** Coordinates the session API; the selected connector signs the returned message outside this controller. */
export function createWalletAuthentication({ getIdentity, request, bootstrap, onChange }: Options) {
  let state: WalletAuthenticationState = { wallet: null, loading: true, revision: 0 };
  let observedKey: string | undefined;
  let challenge: Challenge | undefined;
  let challengeAttempt = 0;
  let syncFailed = false;
  let queue: Promise<unknown> = Promise.resolve();
  let pendingSync = Promise.resolve();

  // Include challenge writes and logout in this queue: an older POST must finish before DELETE.
  function serial<T>(operation: () => Promise<T>): Promise<T> {
    const next = queue.then(operation);
    queue = next.catch(() => undefined);
    return next;
  }
  function current(snapshot: Snapshot) {
    return snapshot.revision === state.revision && snapshot.key === walletIdentityKey(getIdentity());
  }
  function publish(snapshot: Snapshot, update: Partial<WalletAuthenticationState>) {
    if (!current(snapshot)) return;
    state = { ...state, ...update };
    onChange({ ...state });
  }
  function invalidate(key: string): Snapshot {
    observedKey = key;
    challenge = undefined;
    challengeAttempt++;
    syncFailed = false;
    state = { wallet: null, loading: true, revision: state.revision + 1 };
    onChange({ ...state });
    return { key, revision: state.revision };
  }
  function assertCurrent(snapshot: Snapshot) {
    if (!current(snapshot)) throw new Error(changedMessage);
  }
  function selectedIdentity() {
    const identity = getIdentity();
    if (!identity || !/^0x[\da-f]{40}$/i.test(identity.address)) throw new Error('Hubungkan wallet terlebih dahulu.');
    if (identity.chainId !== 11155111) throw new Error('Pilih jaringan Sepolia untuk masuk ke portal.');
    return { ...identity };
  }
  function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Proses masuk wallet belum berhasil. Silakan coba lagi.';
  }
  async function clearServer() {
    await bootstrap();
    await request(sessionPath, { method: 'DELETE' });
  }
  function sync(): Promise<void> {
    const identity = getIdentity();
    const key = walletIdentityKey(identity);
    if (observedKey === key && !syncFailed) return pendingSync;
    const restore = observedKey === undefined;
    const snapshot = invalidate(key);
    pendingSync = serial(async () => {
      try {
        if (restore) {
          await bootstrap();
          if (!current(snapshot)) return;
          const session = await request<{ wallet: string | null }>(sessionPath, { cache: 'no-store' });
          if (!current(snapshot)) return;
          if (session.wallet && identity?.chainId === 11155111 && session.wallet.toLowerCase() === identity.address.toLowerCase()) {
            publish(snapshot, { wallet: session.wallet });
          } else if (session.wallet) {
            await clearServer();
          }
        } else {
          await clearServer();
        }
      } catch (error) {
        if (current(snapshot)) syncFailed = true;
        publish(snapshot, { wallet: null, error: errorMessage(error) });
        throw error;
      } finally {
        publish(snapshot, { loading: false });
      }
    });
    return pendingSync;
  }

  async function getNonce(): Promise<string> {
    const ready = sync();
    const snapshot = { key: walletIdentityKey(getIdentity()), revision: state.revision };
    const attempt = ++challengeAttempt;
    challenge = undefined;
    await ready;
    assertCurrent(snapshot);
    const identity = selectedIdentity();
    publish(snapshot, { wallet: null, error: undefined });
    return serial(async () => {
      try {
        assertCurrent(snapshot);
        if (attempt !== challengeAttempt) throw new Error(changedMessage);
        const response = await request<{ message: string; expiresAt: string }>('/api/portal/challenge', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: identity.address }),
        });
        assertCurrent(snapshot);
        if (attempt !== challengeAttempt) throw new Error(changedMessage);
        const nonce = /^Nonce: ([\da-f]{48})$/im.exec(response.message)?.[1];
        const address = /^Wallet: (0x[\da-f]{40})$/im.exec(response.message)?.[1];
        const expiresAt = Date.parse(response.expiresAt);
        if (!nonce || address?.toLowerCase() !== identity.address.toLowerCase() || !Number.isFinite(expiresAt)) {
          throw new Error('Pesan masuk tidak sesuai wallet yang dipilih. Buka kembali proses masuk.');
        }
        if (expiresAt <= Date.now()) throw new Error(expiredMessage);
        challenge = { ...snapshot, address: identity.address, chainId: identity.chainId, nonce, message: response.message, expiresAt };
        return nonce;
      } catch (error) {
        if (attempt === challengeAttempt) publish(snapshot, { error: errorMessage(error) });
        throw error;
      }
    });
  }

  async function createMessage({ nonce, address, chainId }: { nonce: string; address: string; chainId: number }): Promise<string> {
    const expected = challenge;
    await sync();
    selectedIdentity();
    if (!expected || expected !== challenge) throw new Error('Permintaan tanda tangan tidak tersedia. Buka kembali proses masuk.');
    assertCurrent(expected);
    if (expected.nonce !== nonce || expected.address.toLowerCase() !== address.toLowerCase() || expected.chainId !== chainId) {
      throw new Error(changedMessage);
    }
    if (expected.expiresAt <= Date.now()) {
      challenge = undefined;
      throw new Error(expiredMessage);
    }
    return expected.message;
  }

  async function verify({ message, signature }: { message: string; signature: string }): Promise<boolean> {
    const expected = challenge;
    try {
      await sync();
      selectedIdentity();
      if (!expected || expected !== challenge || expected.message !== message || !signature) return false;
      assertCurrent(expected);
      if (expected.expiresAt <= Date.now()) throw new Error(expiredMessage);
    } catch (error) {
      if (expected) publish(expected, { error: errorMessage(error) });
      return false;
    }
    challenge = undefined; // A signed challenge may only be submitted once.
    publish(expected, { wallet: null, error: undefined });
    return serial(async () => {
      let submitted = false;
      try {
        assertCurrent(expected);
        if (expected.expiresAt <= Date.now()) throw new Error(expiredMessage);
        submitted = true;
        const session = await request<{ wallet: string }>(sessionPath, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: expected.address, signature }),
        });
        assertCurrent(expected);
        if (session.wallet.toLowerCase() !== expected.address.toLowerCase()) throw new Error(changedMessage);
        publish(expected, { wallet: session.wallet });
        return true;
      } catch (error) {
        // A failed response can still have committed auth on the server; clean it before newer work.
        if (submitted) {
          try { await clearServer(); } catch (cleanupError) {
            publish(expected, { error: errorMessage(cleanupError) });
          }
        }
        publish(expected, { wallet: null, error: errorMessage(error) });
        return false;
      }
    });
  }

  function signOut(): Promise<void> {
    const snapshot = invalidate(walletIdentityKey(getIdentity()));
    pendingSync = serial(async () => {
      try {
        await clearServer();
      } catch (error) {
        if (current(snapshot)) syncFailed = true;
        publish(snapshot, { error: errorMessage(error) });
        throw error;
      } finally {
        publish(snapshot, { loading: false });
      }
    });
    return pendingSync;
  }

  return { sync, getNonce, createMessage, verify, signOut };
}
