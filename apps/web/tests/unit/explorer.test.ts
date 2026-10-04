import { describe, expect, it } from 'vitest';
import { explorerAddressUrl, explorerTxUrl } from '../../src/features/shared/explorer';

const hash = `0x${'ab'.repeat(32)}`;
const address = `0x${'12'.repeat(20)}`;

describe('explorer links (FT-02)', () => {
  it('builds Sepolia links only for the configured chain and validated values', () => {
    expect(explorerTxUrl(11155111, hash)).toBe(`https://sepolia.etherscan.io/tx/${hash}`);
    expect(explorerAddressUrl(11155111, address)).toBe(`https://sepolia.etherscan.io/address/${address}`);
  });

  it.each([
    [1, hash], [31337, hash], [null, hash], [11155111, '0x1234'], [11155111, `${hash}/../../evil`], [11155111, 'javascript:alert(1)'], [11155111, null],
  ])('returns no link for chain %s and value %s', (chainId, value) => {
    expect(explorerTxUrl(chainId, value)).toBeNull();
  });
});
