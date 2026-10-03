import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZeroHash } from 'ethers';
import { portalState } from '../src/server';

const chain = vi.hoisted(() => ({ calls: [] as { name: string; args: unknown[] }[], provider: { getBlockNumber: async () => 100 } }));
const issuerId = '0x' + 'cd'.repeat(32);
const ids = ['0x' + 'a1'.repeat(32), '0x' + 'a2'.repeat(32)];
const results: Record<string, (...args: unknown[]) => unknown> = {
  getSigner: () => ({ issuerId, active: true, authorizationId: 1n }),
  issuers: () => ({ name: 'Universitas Contoh', active: true, exists: true }),
  hasRole: () => false,
  getIssuerCredentials: () => ({ ids, total: 2n }),
  getCredential: (id: unknown) => ({ issuerId, issuedAt: 1_790_000_000n, revokedAt: id === ids[1] ? 1_790_000_500n : 0n }),
};
vi.mock('../src/shared', async original => ({
  ...await original<typeof import('../src/shared')>(),
  checkedProvider: vi.fn(async () => chain.provider),
  credentialContract: vi.fn(() => ({
    getFunction: (name: string) => async (...args: unknown[]) => { chain.calls.push({ name, args }); return results[name]!(...args); },
    queryFilter: async () => { chain.calls.push({ name: 'queryFilter', args: [] }); return []; },
  })),
}));

beforeEach(() => {
  chain.calls.length = 0;
  vi.stubEnv('RPC_URL', 'https://rpc.invalid'); vi.stubEnv('CHAIN_ID', '11155111');
  vi.stubEnv('CREDENTIAL_CONTRACT_ADDRESS', '0x' + '12'.repeat(20)); vi.stubEnv('CHAIN_CONFIRMATIONS', '2');
});

describe('portalState', () => {
  it('lists each credential with one read at the confirmed block instead of a full verification', async () => {
    const state = await portalState('0x' + '34'.repeat(20));
    expect(state.credentials).toEqual([
      { credentialId: ids[0], issuedAt: new Date(1_790_000_000_000).toISOString(), revoked: false, confirmed: true },
      { credentialId: ids[1], issuedAt: new Date(1_790_000_000_000).toISOString(), revoked: true, confirmed: true },
    ]);
    const reads = chain.calls.filter(call => call.name === 'getCredential');
    expect(reads.map(call => call.args)).toEqual(ids.map(id => [id, { blockTag: 99 }]));
    expect(chain.calls.map(call => call.name)).not.toContain('queryFilter');
    expect(state).toMatchObject({ total: 2, admin: false, issuer: { issuerId, name: 'Universitas Contoh' } });
  });

  it('skips ids that have no credential at the confirmed block', async () => {
    results.getCredential = (id: unknown) => ({ issuerId: id === ids[0] ? ZeroHash : issuerId, issuedAt: 1_790_000_000n, revokedAt: 0n });
    expect((await portalState('0x' + '34'.repeat(20))).credentials.map(item => item.credentialId)).toEqual([ids[1]]);
  });
});
