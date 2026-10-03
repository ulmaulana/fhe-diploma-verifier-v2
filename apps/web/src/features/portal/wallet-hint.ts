/** Topbar element the lazily loaded wallet button renders into. */
export const walletSlotId = 'wallet-slot';

/**
 * True when Wagmi persisted an active connection in this browser. The app shell uses it to
 * restore the topbar wallet without shipping the wallet bundle to every visitor.
 */
export function hasStoredWalletConnection(): boolean {
  try { return /"current":"[^"]+"/.test(localStorage.getItem('wagmi.store') ?? ''); } catch { return false; }
}
