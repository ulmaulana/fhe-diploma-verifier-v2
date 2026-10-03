import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Wallet, getBytes, type Eip1193Provider } from 'ethers';
import { credentialAuthorizationTypes, credentialDomain, deriveCredentialId, hashEncryptedAttributes, hashIssuerName, hashPublicProfile, type CredentialPublicProfile } from '@verifikasi/credentials';
import { prepareCredential, signPreparedCredential, submitCredential, type PreparedCredential } from '../src/browser';
import { contractInterface } from '../src/shared';

const mock = vi.hoisted(() => ({
  getNetwork: vi.fn(), getSigner: vi.fn(), getBlock: vi.fn(), getFunction: vi.fn(), readIssuer: vi.fn(),
  initSDK: vi.fn(), createInstance: vi.fn(), createEncryptedInput: vi.fn(), add256: vi.fn(), encrypt: vi.fn(),
  nonceUsed: vi.fn(), issue: vi.fn(), wait: vi.fn(),
}));
vi.mock('ethers', async original => ({
  ...await original<typeof import('ethers')>(),
  BrowserProvider: class { getNetwork = mock.getNetwork; getSigner = mock.getSigner; getBlock = mock.getBlock; },
}));
vi.mock('../src/shared', async original => ({
  ...await original<typeof import('../src/shared')>(),
  readIssuer: mock.readIssuer, credentialContract: () => ({ getFunction: mock.getFunction }),
}));
vi.mock('@zama-fhe/relayer-sdk/web', () => ({ initSDK: mock.initSDK, createInstance: mock.createInstance, SepoliaConfig: {} }));

const wallet = new Wallet('0x' + '11'.repeat(32));
const config = { chainId: 11155111, contractAddress: '0x' + '22'.repeat(20) };
const credentialId = ('0x' + '33'.repeat(32)) as `0x${string}`;
const issuerId = ('0x' + '44'.repeat(32)) as `0x${string}`;
const handles = [1, 2, 3, 4].map(value => '0x' + String(value).repeat(64));
const profile: CredentialPublicProfile = { schemaVersion: 1, disclosurePolicyVersion: 1, issuerId,
  issuerDisplayName: 'Universitas Contoh', fullName: 'Andi Contoh', diplomaNumber: 'CONTOH-001', studyProgram: 'Informatika' };
const attributes = { full_name: 'Andi Contoh', diploma_number: 'CONTOH-001', study_program: 'Informatika', graduation_date: '2026-01-01' };
const provider: Eip1193Provider = { request: vi.fn(async () => [wallet.address]) };
function snapshot(): PreparedCredential {
  return { domain: credentialDomain(config), profile: { ...profile }, inputHandles: [...handles], inputProof: '0x1234', authorization: {
    credentialId: deriveCredentialId(config, issuerId, wallet.address, '123'), issuerId, signer: wallet.address,
    issuerNameHash: hashIssuerName(profile.issuerDisplayName), publicDataHash: hashPublicProfile(profile), encryptedAttributesHash: hashEncryptedAttributes(handles),
    schemaVersion: 1, encodingVersion: 1, disclosurePolicyVersion: 1, nonce: '123', issuanceDeadline: '2000000000',
  } };
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.getNetwork.mockResolvedValue({ chainId: 11155111n });
  mock.getSigner.mockResolvedValue(wallet);
  mock.getBlock.mockResolvedValue({ timestamp: 1_800_000_000 });
  mock.readIssuer.mockResolvedValue({ issuerId, name: profile.issuerDisplayName, active: true, exists: true, signerActive: true, wallet: wallet.address, authorizationId: '1' });
  mock.nonceUsed.mockResolvedValue(false);
  mock.getFunction.mockImplementation((name: string) => {
    if (name === 'issuanceNonceUsed') return mock.nonceUsed;
    if (name === 'issueCredential') return mock.issue;
    throw new Error(`Unexpected function ${name}`);
  });
  mock.issue.mockResolvedValue({ hash: credentialId, wait: mock.wait });
  mock.wait.mockResolvedValue({ status: 1, hash: credentialId, blockNumber: 123 });
  mock.createInstance.mockResolvedValue({ createEncryptedInput: mock.createEncryptedInput });
  mock.createEncryptedInput.mockReturnValue({ add256: mock.add256, encrypt: mock.encrypt });
  mock.encrypt.mockResolvedValue({ handles: handles.map(handle => getBytes(handle)), inputProof: getBytes('0x1234') });
});

describe('review, e-sign and transaction stages', () => {
  it('encrypts once, freezes the snapshot, signs a message separately and submits unchanged handles', async () => {
    const prepared = await prepareCredential(provider, config, { attributes, profile });
    expect(Object.isFrozen(prepared)).toBe(true);
    expect(Object.isFrozen(prepared.profile)).toBe(true);
    expect(Object.isFrozen(prepared.inputHandles)).toBe(true);
    expect(mock.encrypt).toHaveBeenCalledOnce();
    expect(mock.createEncryptedInput).toHaveBeenCalledWith(config.contractAddress, wallet.address);
    expect(JSON.stringify(prepared)).not.toContain(attributes.graduation_date);
    const signed = await signPreparedCredential(provider, config, prepared);
    expect(mock.issue).not.toHaveBeenCalled();
    const result = await submitCredential(provider, config, signed);
    expect(mock.encrypt).toHaveBeenCalledOnce();
    expect(mock.issue).toHaveBeenCalledExactlyOnceWith(prepared.authorization, signed.signature, prepared.inputHandles, prepared.inputProof);
    expect(mock.wait).toHaveBeenCalledWith(2);
    expect(prepared.authorization.credentialId).toBe(deriveCredentialId(config, issuerId, wallet.address, prepared.authorization.nonce));
    expect(prepared.authorization.issuerNameHash).toBe(hashIssuerName(profile.issuerDisplayName));
    expect(result).toMatchObject({ credentialId: prepared.authorization.credentialId, transactionHash: credentialId, blockNumber: 123 });
  });

  it('rejects profile/encrypted-reference mismatch before loading the SDK', async () => {
    await expect(prepareCredential(provider, config, { attributes, profile: { ...profile, fullName: 'Budi Contoh' } })).rejects.toThrow('tidak sesuai atribut');
    expect(mock.initSDK).not.toHaveBeenCalled();
  });

  it.each(['profile', 'handles', 'domain'] as const)('rejects a changed %s snapshot before asking the wallet to submit', async field => {
    const prepared = snapshot();
    const signature = await wallet.signTypedData(prepared.domain, credentialAuthorizationTypes, prepared.authorization);
    const changed = field === 'profile' ? { ...prepared, profile: { ...profile, fullName: 'Budi Contoh' } } :
      field === 'handles' ? { ...prepared, inputHandles: [...handles].reverse() } :
        { ...prepared, domain: credentialDomain({ ...config, chainId: 1 }) };
    await expect(submitCredential(provider, config, { ...changed, signature })).rejects.toThrow();
    expect(mock.issue).not.toHaveBeenCalled();
    expect(mock.encrypt).not.toHaveBeenCalled();
  });

  it.each([
    ['a free-form credential ID', { credentialId: ('0x' + 'ab'.repeat(32)) as `0x${string}` }],
    ['another institution name', { issuerNameHash: hashIssuerName('Kampus Lain') }],
  ] as const)('rejects a signed snapshot with %s (protocol v2) before submission', async (_label, change) => {
    const base = snapshot();
    const prepared = { ...base, authorization: { ...base.authorization, ...change } };
    const signature = await wallet.signTypedData(prepared.domain, credentialAuthorizationTypes, prepared.authorization);
    await expect(submitCredential(provider, config, { ...prepared, signature })).rejects.toThrow();
    expect(mock.issue).not.toHaveBeenCalled();
  });

  it('rejects submission when the registry name changed after e-sign', async () => {
    const prepared = snapshot();
    const signature = await wallet.signTypedData(prepared.domain, credentialAuthorizationTypes, prepared.authorization);
    mock.readIssuer.mockResolvedValue({ issuerId, name: 'Nama Kampus Baru', active: true, exists: true, signerActive: true, wallet: wallet.address, authorizationId: '1' });
    await expect(submitCredential(provider, config, { ...prepared, signature })).rejects.toThrow('identitas penerbit berubah');
    expect(mock.issue).not.toHaveBeenCalled();
  });

  it('does not treat a transaction signature as credential authorization', async () => {
    await expect(submitCredential(provider, config, { ...snapshot(), signature: '0x' })).rejects.toThrow();
    expect(mock.issue).not.toHaveBeenCalled();
  });

  it('reports the submitted hash before a receipt timeout so the UI can recover without another issuance', async () => {
    const prepared = snapshot();
    const signature = await wallet.signTypedData(prepared.domain, credentialAuthorizationTypes, prepared.authorization);
    const onSubmitted = vi.fn(() => { expect(mock.wait).not.toHaveBeenCalled(); });
    mock.wait.mockRejectedValueOnce(new Error('timeout'));
    await expect(submitCredential(provider, config, { ...prepared, signature }, { onSubmitted })).rejects.toThrow('timeout');
    expect(onSubmitted).toHaveBeenCalledExactlyOnceWith(credentialId);
    expect(mock.issue).toHaveBeenCalledOnce();
    expect(mock.encrypt).not.toHaveBeenCalled();
  });

  it('recovers a wallet fee speed-up using the confirmed replacement hash without another issuance', async () => {
    const prepared = snapshot();
    const signature = await wallet.signTypedData(prepared.domain, credentialAuthorizationTypes, prepared.authorization);
    const replacementHash = '0x' + '77'.repeat(32);
    const replacement = { hash: replacementHash, from: wallet.address, to: config.contractAddress, chainId: BigInt(config.chainId), value: 0n,
      data: contractInterface.encodeFunctionData('issueCredential', [prepared.authorization, signature, prepared.inputHandles, prepared.inputProof]),
      wait: vi.fn(async () => ({ status: 1, hash: replacementHash, blockNumber: 124 })) };
    mock.wait.mockRejectedValueOnce(Object.assign(new Error('repriced'), { code: 'TRANSACTION_REPLACED', cancelled: false, replacement }));
    const onSubmitted = vi.fn();
    expect(await submitCredential(provider, config, { ...prepared, signature }, { onSubmitted })).toMatchObject({ transactionHash: replacementHash, blockNumber: 124 });
    expect(onSubmitted.mock.calls.map(call => call[0])).toEqual([credentialId, replacementHash]);
    expect(replacement.wait).toHaveBeenCalledWith(2);
    expect(mock.issue).toHaveBeenCalledOnce();
    expect(mock.encrypt).not.toHaveBeenCalled();
  });

  it.each(['cancelled', 'calldata', 'chain'] as const)('rejects a %s replacement instead of reporting issuance success', async changed => {
    const prepared = snapshot();
    const signature = await wallet.signTypedData(prepared.domain, credentialAuthorizationTypes, prepared.authorization);
    const replacement = { hash: '0x' + '77'.repeat(32), from: wallet.address, to: config.contractAddress, chainId: changed === 'chain' ? 1n : BigInt(config.chainId), value: 0n,
      data: changed === 'calldata' ? '0x' : contractInterface.encodeFunctionData('issueCredential', [prepared.authorization, signature, prepared.inputHandles, prepared.inputProof]),
      wait: vi.fn() };
    mock.wait.mockRejectedValueOnce(Object.assign(new Error('replacement rejected'), { code: 'TRANSACTION_REPLACED', cancelled: changed === 'cancelled', replacement }));
    await expect(submitCredential(provider, config, { ...prepared, signature })).rejects.toThrow('replacement rejected');
    expect(replacement.wait).not.toHaveBeenCalled();
    expect(mock.issue).toHaveBeenCalledOnce();
  });

  it('rejects a different wallet after the e-sign stage', async () => {
    const prepared = snapshot();
    const signature = await wallet.signTypedData(prepared.domain, credentialAuthorizationTypes, prepared.authorization);
    mock.getSigner.mockResolvedValue(new Wallet('0x' + '66'.repeat(32)));
    await expect(submitCredential(provider, config, { ...prepared, signature })).rejects.toThrow('wallet yang mengesahkan');
    expect(mock.issue).not.toHaveBeenCalled();
  });

  it.each(['deadline', 'nonce', 'authority'])('requires fresh authorization when %s changes before issuance', async condition => {
    if (condition === 'deadline') mock.getBlock.mockResolvedValue({ timestamp: 2_000_000_001 });
    if (condition === 'nonce') mock.nonceUsed.mockResolvedValue(true);
    if (condition === 'authority') mock.readIssuer.mockResolvedValue({ issuerId, name: profile.issuerDisplayName, active: true, signerActive: false });
    await expect(signPreparedCredential(provider, config, snapshot())).rejects.toThrow();
    expect(mock.issue).not.toHaveBeenCalled();
  });
});
