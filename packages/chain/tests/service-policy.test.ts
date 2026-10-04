import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Wallet, ZeroHash, id } from 'ethers';
import type { DiplomaAttributes } from '@verifikasi/domain';

const mock = vi.hoisted(() => ({
  hasRole: vi.fn(), getSigner: vi.fn(), requestUsed: vi.fn(), populate: vi.fn(), readCredential: vi.fn(),
  createInstance: vi.fn(), encrypt: vi.fn(),
  rpc: { getFeeData: vi.fn(), getBalance: vi.fn(), getBlock: vi.fn(), getNetwork: vi.fn(), estimateGas: vi.fn(), getTransactionCount: vi.fn(),
    getTransactionReceipt: vi.fn(), getTransaction: vi.fn(), broadcastTransaction: vi.fn() },
}));
vi.mock('../src/shared', async original => ({
  ...await original<typeof import('../src/shared')>(),
  checkedProvider: vi.fn(async () => mock.rpc),
  readCredential: mock.readCredential,
  credentialContract: () => ({ getFunction: (name: string) => {
    if (name === 'hasRole') return mock.hasRole;
    if (name === 'getSigner') return mock.getSigner;
    if (name === 'requestUsed') return mock.requestUsed;
    if (name === 'verify') return { populateTransaction: mock.populate };
    throw new Error(`Unexpected function ${name}`);
  } }),
}));
vi.mock('@zama-fhe/relayer-sdk/node', () => ({ createInstance: mock.createInstance, SepoliaConfig: {} }));

import { serviceAccounts, submitComparison } from '../src/server';

const relayer = new Wallet('0x' + '11'.repeat(32));
const attestor = new Wallet('0x' + '22'.repeat(32));
const reader = new Wallet('0x' + '33'.repeat(32));
const contract = '0x' + '12'.repeat(20);
const ROLES: Record<string, string> = { [relayer.address]: id('RELAYER_ROLE'), [attestor.address]: id('ATTESTOR_ROLE'), [reader.address]: id('RESULT_READER_ROLE') };
const attributes: DiplomaAttributes = { full_name: 'ANDI CONTOH', diploma_number: 'CONTOH/1', study_program: 'INFORMATIKA', graduation_date: '2026-01-01' };
const input = () => ({ requestId: '0x' + '31'.repeat(32), credentialId: '0x' + '32'.repeat(32), uploadCommitment: '0x' + '33'.repeat(32),
  ocrConfigHash: '0x' + '34'.repeat(32), attributes, onPreparedTransaction: vi.fn(), onTransaction: vi.fn() });
let contractCounter = 0;

beforeEach(() => {
  vi.resetAllMocks();
  // A fresh contract address per test bypasses the 60 s role-policy cache.
  vi.stubEnv('CREDENTIAL_CONTRACT_ADDRESS', '0x' + (++contractCounter).toString(16).padStart(40, 'a'));
  vi.stubEnv('RPC_URL', 'https://rpc.example.test'); vi.stubEnv('CHAIN_ID', '11155111');
  vi.stubEnv('RELAYER_PRIVATE_KEY', relayer.privateKey); vi.stubEnv('ATTESTOR_PRIVATE_KEY', attestor.privateKey); vi.stubEnv('RESULT_READER_PRIVATE_KEY', reader.privateKey);
  mock.hasRole.mockImplementation(async (role: string, account: string) => ROLES[account] === role);
  mock.getSigner.mockResolvedValue({ active: false });
  mock.requestUsed.mockResolvedValue(false);
  mock.readCredential.mockResolvedValue({ confirmed: true, historicalSignerAuthorized: true, revoked: false, issuerActive: true });
  mock.rpc.getFeeData.mockResolvedValue({ maxFeePerGas: 10n, maxPriorityFeePerGas: 1n, gasPrice: 10n });
  mock.rpc.getBalance.mockResolvedValue(10n ** 18n);
  mock.rpc.getBlock.mockResolvedValue({ timestamp: 1_800_000_000 });
  mock.createInstance.mockResolvedValue({ createEncryptedInput: () => ({ add256: vi.fn(), encrypt: mock.encrypt }) });
  mock.encrypt.mockResolvedValue({ handles: [1, 2, 3, 4].map(n => new Uint8Array(32).fill(n)), inputProof: new Uint8Array([1, 2]) });
});
afterEach(() => vi.unstubAllEnvs());

describe('service key policy before a comparison transaction', () => {
  it('rejects duplicate service keys locally, before any RPC or contract call', async () => {
    vi.stubEnv('ATTESTOR_PRIVATE_KEY', relayer.privateKey);
    expect(() => serviceAccounts()).toThrow(/tiga alamat berbeda/);
    await expect(submitComparison(input())).rejects.toMatchObject({ code: 'CHAIN_CONFIGURATION_INVALID' });
    expect(mock.hasRole).not.toHaveBeenCalled();
    expect(mock.requestUsed).not.toHaveBeenCalled();
  });

  it.each([
    ['the relayer lacks RELAYER_ROLE', () => mock.hasRole.mockImplementation(async (role: string, account: string) => account !== relayer.address && ROLES[account] === role), /relayer .* tidak memegang perannya/],
    ['the attestor is also administrator', () => mock.hasRole.mockImplementation(async (role: string, account: string) => ROLES[account] === role || (account === attestor.address && role === ZeroHash)), /attestor .* memegang peran lain/],
    ['the reader is an active institution signer', () => mock.getSigner.mockImplementation(async (account: string) => ({ active: account === reader.address })), /result reader .* signer institusi aktif/],
  ])('rejects when %s, before encryption or signing', async (_label, arrange, message) => {
    arrange();
    const job = input();
    await expect(submitComparison(job)).rejects.toThrow(message);
    expect(mock.createInstance).not.toHaveBeenCalled();
    expect(job.onPreparedTransaction).not.toHaveBeenCalled();
  });

  it('stops when the role check cannot be read instead of treating it as passed', async () => {
    mock.hasRole.mockRejectedValue(Object.assign(new Error('rpc down'), { code: 'NETWORK_ERROR' }));
    const job = input();
    await expect(submitComparison(job)).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(mock.createInstance).not.toHaveBeenCalled();
    expect(job.onPreparedTransaction).not.toHaveBeenCalled();
  });

  it('refuses before FHE encryption when the relayer balance cannot cover a comparison', async () => {
    mock.rpc.getBalance.mockResolvedValue(1n);
    const job = input();
    await expect(submitComparison(job)).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
    expect(mock.createInstance).not.toHaveBeenCalled();
    expect(job.onPreparedTransaction).not.toHaveBeenCalled();
    expect(mock.rpc.broadcastTransaction).not.toHaveBeenCalled();
  });

  it('refuses to sign when the estimated transaction costs more than the balance', async () => {
    // Enough for the 1.2M-gas pre-check at 10 wei, not for a 5M-gas estimate at 10 wei.
    mock.rpc.getBalance.mockResolvedValue(20_000_000n);
    mock.populate.mockResolvedValue({ to: contract, data: '0x1234' });
    mock.rpc.getNetwork.mockResolvedValue({ chainId: 11155111n });
    mock.rpc.estimateGas.mockResolvedValue(5_000_000n);
    mock.rpc.getTransactionCount.mockResolvedValue(7);
    const job = input();
    await expect(submitComparison(job)).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
    expect(mock.encrypt).toHaveBeenCalledOnce();
    expect(job.onPreparedTransaction).not.toHaveBeenCalled();
    expect(mock.rpc.broadcastTransaction).not.toHaveBeenCalled();
  });
});
