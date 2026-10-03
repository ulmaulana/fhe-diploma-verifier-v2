import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZeroHash, type JsonRpcProvider } from 'ethers';
import { SCHEMA_VERSION, ENCODING_VERSION } from '@verifikasi/domain';
import { readCredential, readIssuer } from '../src/shared';

const mock = vi.hoisted(() => ({
  getFunction: vi.fn(), queryFilter: vi.fn(), issuedFilter: vi.fn(),
  getBlockNumber: vi.fn(), getBlock: vi.fn(),
}));
vi.mock('ethers', async original => ({
  ...await original<typeof import('ethers')>(),
  Contract: class { getFunction = mock.getFunction; queryFilter = mock.queryFilter; filters = { CredentialIssued: mock.issuedFilter }; },
}));
// A QR read must not need the FHE runtime at all, even when it is broken.
vi.mock('@zama-fhe/relayer-sdk/node', () => { throw new Error('QR must not load FHE'); });

const credentialId = '0x' + '12'.repeat(32);
const issuerId = '0x' + '23'.repeat(32);
const signer = '0x' + '34'.repeat(20);
const hash = '0x' + '45'.repeat(32);
const config = { chainId: 11155111, rpcUrl: 'https://rpc.example', contractAddress: '0x' + '56'.repeat(20), confirmations: 2 };
const provider = { getBlockNumber: mock.getBlockNumber, getBlock: mock.getBlock } as unknown as JsonRpcProvider;
const credential = () => ({
  issuerId, signer, issuedAt: 1_000n, revokedAt: 0n, issuedBlock: 50n, revokedBlock: 0n, signerAuthorizationId: 17n,
  schemaVersion: 1n, encodingVersion: 1n, disclosurePolicyVersion: 1n,
  credentialDigest: hash, publicDataHash: hash, encryptedAttributesHash: hash, issuerNameHash: hash,
});
let chainRecord = credential();
let historical = { issuerId, signer, authorizedAt: 900n, revokedAt: 1_050n };
let institution = { name: 'Universitas Contoh', active: true, exists: true };
const calls = new Map<string, ReturnType<typeof vi.fn>>();

beforeEach(() => {
  vi.clearAllMocks(); calls.clear();
  chainRecord = credential();
  historical = { issuerId, signer, authorizedAt: 900n, revokedAt: 1_050n };
  institution = { name: 'Universitas Contoh', active: true, exists: true };
  mock.getBlockNumber.mockResolvedValue(100);
  mock.getBlock.mockResolvedValue({ number: 99, timestamp: 1_100, hash });
  mock.issuedFilter.mockReturnValue('issuance-filter');
  mock.queryFilter.mockResolvedValue([{ args: { credentialId }, transactionHash: hash, blockNumber: 50 }]);
  mock.getFunction.mockImplementation((name: string) => {
    if (!calls.has(name)) calls.set(name, vi.fn(async () => {
      if (name === 'getCredential') return chainRecord;
      if (name === 'issuers') return institution;
      if (name === 'signerAuthorizations') return historical;
      if (name === 'getSigner') return { issuerId, active: false, authorizationId: 17n };
      if (name === 'SCHEMA_VERSION') return SCHEMA_VERSION;
      if (name === 'ENCODING_VERSION') return ENCODING_VERSION;
      throw new Error(`Unexpected ${name}`);
    }));
    return calls.get(name)!;
  });
});

describe('confirmed credential reads', () => {
  it('reads the confirmed snapshot and retains historical authority after wallet rotation', async () => {
    const result = await readCredential(config, provider, credentialId);
    expect(result).toMatchObject({ issuerId, signer, confirmed: true, historicalSignerAuthorized: true,
      issuerActive: true, credentialDigest: hash, checkedBlock: 99, checkedBlockHash: hash,
      issuanceBlock: 50, issuanceTransactionHash: hash, revocationBlock: null });
    expect(calls.get('getCredential')).toHaveBeenCalledWith(credentialId, { blockTag: 99 });
    expect(calls.get('signerAuthorizations')).toHaveBeenCalledWith(17n, { blockTag: 99 });
    expect(calls.has('getSigner')).toBe(false);
    expect(mock.queryFilter).toHaveBeenCalledExactlyOnceWith('issuance-filter', 50, 50);
  });

  it('separates an inactive institution from a historically valid signer', async () => {
    institution.active = false;
    expect(await readCredential(config, provider, credentialId)).toMatchObject({ issuerActive: false, historicalSignerAuthorized: true });
  });

  it('detects historical signer binding inconsistency', async () => {
    historical.issuerId = hash;
    expect(await readCredential(config, provider, credentialId)).toMatchObject({ historicalSignerAuthorized: false });
  });

  it('reports issuance at the tip as unconfirmed instead of missing', async () => {
    mock.getFunction('getCredential').mockResolvedValueOnce({ issuerId: ZeroHash }).mockResolvedValueOnce({ ...credential(), issuedBlock: 100n });
    const result = await readCredential(config, provider, credentialId);
    expect(result).toMatchObject({ confirmed: false, checkedBlock: 100, issuanceBlock: 100 });
    expect(calls.get('getCredential')).toHaveBeenNthCalledWith(2, credentialId, { blockTag: 100 });
  });

  it('returns missing only when both the confirmed block and tip lack the record', async () => {
    mock.getFunction('getCredential').mockResolvedValue({ issuerId: ZeroHash });
    expect(await readCredential(config, provider, credentialId)).toBeNull();
    expect(mock.queryFilter).not.toHaveBeenCalled();
  });

  it('reports confirmed revocation and its block', async () => {
    chainRecord.revokedAt = 1_070n; chainRecord.revokedBlock = 80n;
    expect(await readCredential(config, provider, credentialId)).toMatchObject({ revoked: true, revocationBlock: 80 });
  });

  it('fails closed if issuance event lookup is unavailable', async () => {
    mock.queryFilter.mockResolvedValue([]);
    await expect(readCredential(config, provider, credentialId)).rejects.toThrow('Bukti transaksi');
  });

  it('resolves operator status through institution identity and current signer authorization separately', async () => {
    const { Contract } = await import('ethers');
    const contract = new Contract(config.contractAddress, []);
    expect(await readIssuer(contract, signer, 99)).toMatchObject({ wallet: signer, issuerId, active: true, signerActive: false, authorizationId: '17' });
    expect(calls.get('issuers')).toHaveBeenCalledWith(issuerId, { blockTag: 99 });
  });
});
