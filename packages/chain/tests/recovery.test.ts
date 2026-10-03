import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Transaction, Wallet } from 'ethers';
import { ENCODING_VERSION, NORMALIZER_VERSION, SCHEMA_VERSION } from '@verifikasi/domain';
import { contractInterface } from '../src/shared';
import { resumeComparisonTransaction, submitComparison } from '../src/server';

const rpc = vi.hoisted(() => ({ getTransactionReceipt: vi.fn(), getTransaction: vi.fn(), broadcastTransaction: vi.fn() }));
vi.mock('../src/shared', async original => ({
  ...await original<typeof import('../src/shared')>(),
  checkedProvider: vi.fn(async () => rpc),
}));

const wallet = new Wallet('0x' + '11'.repeat(32));
const otherWallet = new Wallet('0x' + '22'.repeat(32));
const contract = '0x' + '12'.repeat(20);
const requestId = '0x' + '31'.repeat(32);
const credentialId = '0x' + '32'.repeat(32);
const uploadCommitment = '0x' + '33'.repeat(32);
const hash32 = '0x' + '44'.repeat(32);

async function prepared(options: { chainId?: number; to?: string; signer?: Wallet; value?: bigint; attestationRelayer?: string } = {}) {
  const data = contractInterface.encodeFunctionData('verify', [{
    requestId, credentialId, uploadCommitment, schemaVersion: SCHEMA_VERSION, encodingVersion: ENCODING_VERSION,
    normalizerVersion: NORMALIZER_VERSION, ocrConfigHash: hash32, inputHandlesHash: hash32,
    relayer: options.attestationRelayer ?? wallet.address, resultReader: otherWallet.address, nonce: 42n, deadline: 2_000_000_000n,
  }, [hash32, hash32, hash32, hash32], '0x1234', '0x5678']);
  const serializedTransaction = await (options.signer ?? wallet).signTransaction({
    chainId: options.chainId ?? 11155111, to: options.to ?? contract, data, value: options.value ?? 0n,
    nonce: 8, gasLimit: 1_000_000, type: 2, maxFeePerGas: 2n, maxPriorityFeePerGas: 1n,
  });
  return { requestId, credentialId, uploadCommitment, serializedTransaction, transactionHash: Transaction.from(serializedTransaction).hash! };
}

beforeEach(() => {
  vi.resetAllMocks();
  rpc.getTransactionReceipt.mockResolvedValue(null);
  rpc.getTransaction.mockResolvedValue(null);
  rpc.broadcastTransaction.mockResolvedValue({});
  vi.stubEnv('RELAYER_PRIVATE_KEY', wallet.privateKey);
  vi.stubEnv('CREDENTIAL_CONTRACT_ADDRESS', contract);
  vi.stubEnv('RPC_URL', 'https://rpc.example.test');
  vi.stubEnv('CHAIN_ID', '11155111');
});
afterEach(() => vi.unstubAllEnvs());

describe('prepared transaction recovery', () => {
  it('accepts an unprefixed environment key for the same relayer identity', async () => {
    vi.stubEnv('RELAYER_PRIVATE_KEY', wallet.privateKey.slice(2));
    const input = await prepared();
    expect(await resumeComparisonTransaction(input)).toBe(input.transactionHash);
    expect(rpc.broadcastTransaction).toHaveBeenCalledExactlyOnceWith(input.serializedTransaction);
  });

  it.each(['', 'abcd', 'g'.repeat(64), '0x' + '11'.repeat(31)])('rejects a malformed key before broadcasting', async key => {
    vi.stubEnv('RELAYER_PRIVATE_KEY', key);
    await expect(resumeComparisonTransaction(await prepared())).rejects.toMatchObject({ code: 'CHAIN_CONFIGURATION_INVALID' });
    expect(rpc.broadcastTransaction).not.toHaveBeenCalled();
  });

  it('rebroadcasts exactly the persisted signed bytes after checking the fence', async () => {
    const input = await prepared();
    const beforeBroadcast = vi.fn(async () => { expect(rpc.broadcastTransaction).not.toHaveBeenCalled(); });
    expect(await resumeComparisonTransaction({ ...input, beforeBroadcast })).toBe(input.transactionHash);
    expect(beforeBroadcast).toHaveBeenCalledOnce();
    expect(rpc.broadcastTransaction).toHaveBeenCalledExactlyOnceWith(input.serializedTransaction);
  });

  it.each(['confirmed', 'pending'])('does not resend an already %s transaction', async state => {
    const input = await prepared();
    if (state === 'confirmed') rpc.getTransactionReceipt.mockResolvedValue({ status: 1 });
    else rpc.getTransaction.mockResolvedValue({ hash: input.transactionHash });
    expect(await resumeComparisonTransaction(input)).toBe(input.transactionHash);
    expect(rpc.broadcastTransaction).not.toHaveBeenCalled();
  });

  it.each(['requestId', 'credentialId', 'uploadCommitment', 'transactionHash'] as const)('rejects a stored %s binding mismatch even when a receipt exists', async field => {
    const input = await prepared();
    rpc.getTransactionReceipt.mockResolvedValue({ status: 1 });
    await expect(resumeComparisonTransaction({ ...input, [field]: hash32 })).rejects.toThrow();
    expect(rpc.getTransactionReceipt).not.toHaveBeenCalled();
    expect(rpc.broadcastTransaction).not.toHaveBeenCalled();
  });

  it.each([
    { chainId: 1 }, { to: otherWallet.address }, { signer: otherWallet }, { value: 1n }, { attestationRelayer: otherWallet.address },
  ])('rejects a transaction signed for different execution parameters', async options => {
    await expect(resumeComparisonTransaction(await prepared(options))).rejects.toThrow();
    expect(rpc.broadcastTransaction).not.toHaveBeenCalled();
  });

  it('does not broadcast when deletion or lease loss invalidates the fence', async () => {
    await expect(resumeComparisonTransaction({ ...await prepared(), beforeBroadcast: async () => { throw new Error('fenced'); } })).rejects.toThrow('fenced');
    expect(rpc.broadcastTransaction).not.toHaveBeenCalled();
  });

  it('leaves RPC uncertainty retryable using the same bytes and nonce', async () => {
    const input = await prepared();
    rpc.broadcastTransaction.mockRejectedValueOnce(new Error('RPC timeout'));
    await expect(resumeComparisonTransaction(input)).rejects.toThrow('RPC timeout');
    expect(await resumeComparisonTransaction(input)).toBe(input.transactionHash);
    expect(rpc.broadcastTransaction.mock.calls.map(call => call[0])).toEqual([input.serializedTransaction, input.serializedTransaction]);
  });

  it('resumes through submitComparison without rebuilding encrypted inputs', async () => {
    // No attestor or reader keys are configured: recovery only needs the original
    // signed transaction and the current relayer identity.
    vi.stubEnv('ATTESTOR_PRIVATE_KEY', ''); vi.stubEnv('RESULT_READER_PRIVATE_KEY', '');
    const input = await prepared();
    const onTransaction = vi.fn();
    expect(await submitComparison({ ...input, attributes: { full_name: 'CONTOH', diploma_number: '123', study_program: 'CONTOH', graduation_date: '2026-01-01' }, ocrConfigHash: hash32, onTransaction })).toBe(input.transactionHash);
    expect(onTransaction).toHaveBeenCalledExactlyOnceWith(input.transactionHash);
  });
});
