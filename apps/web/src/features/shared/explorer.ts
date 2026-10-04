/** Block explorers for chains this application is configured for. Links are built only from a chain ID
 * returned by the server configuration and a validated hash/address, never from a QR or user input. */
const EXPLORERS: Readonly<Record<number, string>> = { 11155111: 'https://sepolia.etherscan.io' };

export function explorerTxUrl(chainId: number | null | undefined, hash: string | null | undefined): string | null {
  if (chainId == null || !hash || !/^0x[0-9a-fA-F]{64}$/.test(hash)) return null;
  const base = EXPLORERS[chainId];
  return base ? `${base}/tx/${hash}` : null;
}

export function explorerAddressUrl(chainId: number | null | undefined, address: string | null | undefined): string | null {
  if (chainId == null || !address || !/^0x[0-9a-fA-F]{40}$/.test(address)) return null;
  const base = EXPLORERS[chainId];
  return base ? `${base}/address/${address}` : null;
}
