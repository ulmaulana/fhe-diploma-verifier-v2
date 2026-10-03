import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Wallet, keccak256, toUtf8Bytes } from 'ethers';
import type { Hex32 } from '@verifikasi/domain';
import type { CredentialMetadata } from '@verifikasi/chain';
import {
  credentialAuthorizationTypes, credentialDigest, credentialDomain, hashEncryptedAttributes, hashPublicProfile,
  type CredentialPublicProfile, type SignedCredential,
} from '@verifikasi/credentials';
import type { CredentialDraft, Session, State, StoredCredential } from '../../src/server/types';

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(), issuer: vi.fn(), configuration: vi.fn(),
  drafts: new Map<string, CredentialDraft>(), records: new Map<string, StoredCredential>(),
  state: { sessions: {}, jobs: {}, rates: {}, audit: [] } as State,
  saveDraft: vi.fn(), saveRecord: vi.fn(), fetch: vi.fn(),
}));
vi.mock('@verifikasi/chain/server', () => ({
  lookupCredential: mocks.lookup, getIssuer: mocks.issuer, serverChainConfig: mocks.configuration,
  submitComparison: vi.fn(() => { throw new Error('QR must not submit a comparison'); }),
  decryptComparison: vi.fn(() => { throw new Error('QR must not decrypt'); }),
}));
vi.mock('../../src/server/store', () => ({
  withState: async (fn: (state: State) => unknown) => fn(mocks.state),
  audit: (state: State, action: string, objectId: string) => state.audit.push({ action, objectId, at: new Date().toISOString() }),
}));
vi.mock('../../src/server/credentials-repository', () => ({
  readDraft: async (id: string) => structuredClone(mocks.drafts.get(id) || null),
  readStoredCredential: async (id: string) => structuredClone(mocks.records.get(id) || null),
  saveDraft: mocks.saveDraft, saveStoredCredential: mocks.saveRecord,
}));
// Route aliases resolve to the same actual service under test, without Next's build system.
vi.mock('@/server/credentials', () => import('../../src/server/credentials'));
vi.mock('@/server/http', () => import('../../src/server/http'));

import { createCredentialDraft, inspectCredential, submitCredentialProof, verifyRecord } from '../../src/server/credentials';
import { GET as readPublicCredential } from '../../src/app/api/credentials/[id]/route';
import { GET as readPublicVerification } from '../../src/app/api/credentials/[id]/verification/route';

const wallet = new Wallet(`0x${'11'.repeat(32)}`);
const secondWallet = new Wallet(`0x${'22'.repeat(32)}`);
const id = `0x${'ab'.repeat(32)}` as Hex32;
const issuerId = `0x${'cd'.repeat(32)}` as Hex32;
const domain = credentialDomain({ chainId: 11155111, contractAddress: `0x${'56'.repeat(20)}` });
const inputHandles = [1, 2, 3, 4].map(n => `0x${n.toString(16).padStart(64, '0')}`);
const txHash = `0x${'78'.repeat(32)}`;
const profile: CredentialPublicProfile = { schemaVersion: 1, disclosurePolicyVersion: 1, issuerId,
  issuerDisplayName: 'Universitas Sintetis', fullName: 'Andi Contoh', diplomaNumber: 'SINTETIS-001', studyProgram: 'Informatika' };
const session: Session = { id: 'owner-session', csrf: 'test-csrf', wallet: wallet.address, expiresAt: '2099-01-01T00:00:00.000Z' };
let proof: SignedCredential;
let metadata: CredentialMetadata;

async function makeProof(deadline = '1', override: Partial<CredentialPublicProfile> = {}): Promise<SignedCredential> {
  const publicProfile = { ...profile, ...override };
  const authorization = { credentialId: id, issuerId, signer: wallet.address,
    publicDataHash: hashPublicProfile(publicProfile), encryptedAttributesHash: hashEncryptedAttributes(inputHandles),
    schemaVersion: 1, encodingVersion: 1, disclosurePolicyVersion: 1, nonce: '123456789012345678901234567890', issuanceDeadline: deadline };
  return { authorization, profile: publicProfile, domain,
    signature: await wallet.signTypedData(domain, credentialAuthorizationTypes, authorization) };
}
function chainRecord(signed: SignedCredential): CredentialMetadata {
  return { credentialId: id, issuer: wallet.address, issuerId, signer: wallet.address, issuerName: profile.issuerDisplayName,
    issuerActive: true, revoked: false, issuedAt: '2025-01-01T00:00:00.000Z', revokedAt: null,
    schemaVersion: 1, encodingVersion: 1, disclosurePolicyVersion: 1,
    credentialDigest: credentialDigest(signed.authorization, domain), publicDataHash: signed.authorization.publicDataHash,
    encryptedAttributesHash: signed.authorization.encryptedAttributesHash,
    issuerNameHash: keccak256(toUtf8Bytes(signed.profile.issuerDisplayName)), signerAuthorizationId: '5', historicalSignerAuthorized: true,
    issuanceBlock: 100, issuanceTransactionHash: txHash, revocationBlock: null, confirmed: true,
    checkedBlock: 110, checkedBlockHash: `0x${'90'.repeat(32)}`, checkedAt: '2026-09-24T00:00:00.000Z',
    chainId: domain.chainId, contractAddress: domain.verifyingContract };
}
function storeProof(signed = proof, hash: string | null = txHash) {
  mocks.records.set(id, { credentialId: id, ownerWallet: wallet.address.toLowerCase(), signed: structuredClone(signed),
    issuanceTxHash: hash, createdAt: new Date().toISOString() });
}
async function pendingDraft() {
  proof = await makeProof(String(Math.floor(Date.now() / 1000) + 3600));
  metadata = chainRecord(proof);
  mocks.records.clear(); mocks.lookup.mockResolvedValue(null);
  await createCredentialDraft(session, { authorization: proof.authorization, profile: proof.profile, domain, inputHandles });
}

beforeEach(async () => {
  vi.clearAllMocks(); mocks.drafts.clear(); mocks.records.clear();
  mocks.state = { sessions: {}, jobs: {}, rates: {}, audit: [] };
  for (const key of ['RELAYER_PRIVATE_KEY', 'ATTESTOR_PRIVATE_KEY', 'RESULT_READER_PRIVATE_KEY']) vi.stubEnv(key, '');
  vi.stubEnv('APP_MODE', 'testnet'); vi.stubEnv('APP_ORIGIN', 'https://verifikasi.example');
  vi.stubEnv('DATABASE_URL', ''); vi.stubEnv('VERCEL', '');
  mocks.configuration.mockReturnValue({ chainId: domain.chainId, contractAddress: domain.verifyingContract, rpcUrl: 'https://rpc.invalid' });
  mocks.issuer.mockResolvedValue({ wallet: wallet.address, issuerId, name: profile.issuerDisplayName, active: true, exists: true, signerActive: true, authorizationId: '5' });
  mocks.saveDraft.mockImplementation(async (draft: CredentialDraft) => { mocks.drafts.set(draft.credentialId, structuredClone(draft)); });
  mocks.saveRecord.mockImplementation(async (record: StoredCredential) => { mocks.records.set(record.credentialId, structuredClone(record)); });
  mocks.fetch.mockImplementation(() => { throw new Error('OCR and decryption services are unavailable'); });
  vi.stubGlobal('fetch', mocks.fetch);
  proof = await makeProof(); metadata = chainRecord(proof); mocks.lookup.mockResolvedValue(metadata); storeProof();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('public record proof verification', () => {
  it('verifies repeatedly without OCR, wallet session, jobs, service keys, or new transactions', async () => {
    for (let count = 0; count < 2; count++) {
      const record = await verifyRecord(id);
      expect(record).toMatchObject({ mode: 'RECORD', scope: 'RECORD_ONLY', documentDecision: null,
        recordVerificationStatus: 'VERIFIED_RECORD', profile, checkedBlock: 110, issuanceTxHash: txHash });
      expect(Object.keys(record.profile!)).toEqual(Object.keys(profile));
      expect(JSON.stringify(record)).not.toContain('graduation');
      expect(JSON.stringify(record)).not.toContain('referenceValues');
    }
    expect(mocks.state.jobs).toEqual({}); expect(mocks.state.sessions).toEqual({});
    expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.issuer).not.toHaveBeenCalled();
    expect(mocks.saveRecord).not.toHaveBeenCalled(); expect(mocks.saveDraft).not.toHaveBeenCalled();
  });

  it.each(['fullName', 'diplomaNumber', 'studyProgram', 'issuerDisplayName'] as const)('rejects a tampered public %s and hides the entire official profile', async field => {
    mocks.records.get(id)!.signed.profile[field] = 'Diubah setelah pengesahan';
    expect(await inspectCredential(id)).toMatchObject({ verification: { recordVerificationStatus: 'INVALID_PROOF', profile: null }, signedCredential: null });
  });

  it('rejects missing signatures and valid signatures for another payload', async () => {
    mocks.records.get(id)!.signed.signature = '0x';
    expect((await verifyRecord(id)).recordVerificationStatus).toBe('INVALID_PROOF');
    storeProof();
    mocks.records.get(id)!.signed.signature = await secondWallet.signTypedData(domain, credentialAuthorizationTypes, proof.authorization);
    expect((await verifyRecord(id)).recordVerificationStatus).toBe('INVALID_PROOF');
  });

  it.each(['credentialDigest', 'publicDataHash', 'encryptedAttributesHash', 'issuerNameHash'] as const)('rejects the chain %s binding when it differs', async field => {
    mocks.lookup.mockResolvedValue({ ...metadata, [field]: `0x${'ef'.repeat(32)}` });
    expect(await verifyRecord(id)).toMatchObject({ recordVerificationStatus: 'INVALID_PROOF', profile: null });
  });

  it('distinguishes a missing off-chain payload, an absent chain record, and an RPC failure', async () => {
    mocks.records.clear();
    expect(await verifyRecord(id)).toMatchObject({ recordVerificationStatus: 'ERROR', profile: null });
    mocks.lookup.mockResolvedValue(null);
    expect(await verifyRecord(id)).toMatchObject({ recordVerificationStatus: 'NOT_FOUND', profile: null });
    mocks.lookup.mockRejectedValue(new Error('unavailable RPC'));
    expect(await verifyRecord(id)).toMatchObject({ recordVerificationStatus: 'ERROR', profile: null });
  });

  it('keeps signed or insufficiently confirmed issuance pending and does not publish its profile', async () => {
    mocks.lookup.mockResolvedValue(null);
    expect(await inspectCredential(id)).toMatchObject({ verification: { recordVerificationStatus: 'PENDING', profile: null }, signedCredential: null });
    mocks.lookup.mockResolvedValue({ ...metadata, confirmed: false });
    expect(await verifyRecord(id)).toMatchObject({ recordVerificationStatus: 'PENDING', profile: null });
  });

  it('keeps issuer inactivity and revocation separate from a valid signature', async () => {
    mocks.lookup.mockResolvedValue({ ...metadata, issuerActive: false });
    expect(await verifyRecord(id)).toMatchObject({ recordVerificationStatus: 'ISSUER_INACTIVE', profile, documentDecision: null });
    mocks.lookup.mockResolvedValue({ ...metadata, issuerActive: false, revoked: true });
    expect(await verifyRecord(id)).toMatchObject({ recordVerificationStatus: 'REVOKED', profile, documentDecision: null });
  });

  it('uses historical authorization after wallet rotation and preserves past-deadline record validity', async () => {
    mocks.issuer.mockRejectedValue(new Error('The old signer is no longer authorized for new issuance'));
    expect(BigInt(proof.authorization.issuanceDeadline)).toBeLessThan(BigInt(Math.floor(Date.now() / 1000)));
    expect(await verifyRecord(id)).toMatchObject({ recordVerificationStatus: 'VERIFIED_RECORD', signer: wallet.address });
    expect(mocks.issuer).not.toHaveBeenCalled();
    mocks.lookup.mockResolvedValue({ ...metadata, historicalSignerAuthorized: false });
    expect(await verifyRecord(id)).toMatchObject({ recordVerificationStatus: 'INVALID_PROOF', profile: null });
  });

  it('rejects private fields injected into the stored public profile', async () => {
    Object.assign(mocks.records.get(id)!.signed.profile, { graduationDate: '2024-06-01' });
    expect(await inspectCredential(id)).toMatchObject({ verification: { recordVerificationStatus: 'INVALID_PROOF', profile: null }, signedCredential: null });
  });

  it('serves both public GET routes anonymously with no-store and actual signed proof', async () => {
    const request = new Request(`https://verifikasi.example/api/credentials/${id}`);
    const response = await readPublicCredential(request, { params: Promise.resolve({ id }) });
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(await response.json()).toMatchObject({ recordVerificationStatus: 'VERIFIED_RECORD', profile,
      documentDecision: null, scope: 'RECORD_ONLY', signedCredential: proof });
    const verification = await readPublicVerification(request, { params: Promise.resolve({ id }) });
    expect(await verification.json()).toMatchObject({ recordVerificationStatus: 'VERIFIED_RECORD', documentDecision: null });
    expect(mocks.state.jobs).toEqual({}); expect(mocks.state.sessions).toEqual({}); expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('does not disclose pending proof through the public API', async () => {
    mocks.lookup.mockResolvedValue(null);
    const response = await readPublicCredential(new Request('https://verifikasi.example'), { params: Promise.resolve({ id }) });
    expect(await response.json()).toMatchObject({ recordVerificationStatus: 'PENDING', profile: null, signedCredential: null });
  });
});

describe('frozen issuance and durable proof submission', () => {
  it('copies the private PDF date from the draft, never from proof submission or into public responses', async () => {
    await pendingDraft();
    const body = { authorization: proof.authorization, profile: proof.profile, domain, inputHandles, documentDate: '2027-03-09' };
    await createCredentialDraft(session, body);
    await expect(createCredentialDraft(session, { ...body, documentDate: '2027-02-30' })).rejects.toMatchObject({ code: 'INVALID_DATE' });
    await expect(submitCredentialProof(session, id, { signedCredential: proof, documentDate: '2020-01-01' })).rejects.toMatchObject({ code: 'INVALID_PROOF' });
    mocks.lookup.mockResolvedValue(metadata);
    await submitCredentialProof(session, id, { signedCredential: proof });
    expect(mocks.records.get(id)?.documentDate).toBe('2027-03-09');
    const response = await readPublicCredential(new Request('https://verifikasi.example'), { params: Promise.resolve({ id }) });
    const json = await response.json();
    expect(json.recordVerificationStatus).toBe('VERIFIED_RECORD');
    expect(JSON.stringify(json)).not.toContain('2027-03-09');
    expect(json.signedCredential.profile).not.toHaveProperty('documentDate');
  });
  it('persists the reviewed public snapshot and signed proof before broadcast without publishing a QR', async () => {
    await pendingDraft();
    expect(mocks.drafts.get(id)).toMatchObject({ credentialId: id, ownerWallet: wallet.address.toLowerCase(), profile });
    expect(mocks.drafts.get(id)).not.toHaveProperty('inputHandles');
    const result = await submitCredentialProof(session, id, { signedCredential: proof, issuanceTxHash: `0x${'99'.repeat(32)}` });
    expect(mocks.records.get(id)).toMatchObject({ signed: proof, issuanceTxHash: null });
    expect(result).toMatchObject({ qrUrl: null, verification: { recordVerificationStatus: 'PENDING', profile: null } });
    expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.state.jobs).toEqual({});
  });

  it('publishes the QR only after the durable proof matches confirmed issuance', async () => {
    await pendingDraft(); await submitCredentialProof(session, id, { signedCredential: proof });
    mocks.lookup.mockResolvedValue(metadata);
    const result = await submitCredentialProof(session, id, { signedCredential: proof, issuanceTxHash: txHash });
    expect(result).toMatchObject({ qrUrl: `https://verifikasi.example/c/${id}`, verification: { recordVerificationStatus: 'VERIFIED_RECORD' } });
    expect(mocks.records.get(id)!.issuanceTxHash).toBe(txHash);
  });

  it('rejects a changed frozen snapshot even when the changed payload has a valid signature', async () => {
    await pendingDraft();
    const changed = await makeProof(proof.authorization.issuanceDeadline, { fullName: 'Budi Contoh' });
    await expect(submitCredentialProof(session, id, { signedCredential: changed })).rejects.toMatchObject({ code: 'DRAFT_CHANGED', status: 409 });
    expect(mocks.saveRecord).not.toHaveBeenCalled();
  });

  it('requires wallet ownership and a matching draft before saving signed data', async () => {
    await pendingDraft();
    await expect(submitCredentialProof({ ...session, wallet: secondWallet.address }, id, { signedCredential: proof })).rejects.toMatchObject({ code: 'CREDENTIAL_OWNER', status: 403 });
    await expect(createCredentialDraft({ ...session, wallet: undefined }, {})).rejects.toMatchObject({ code: 'WALLET_REQUIRED', status: 401 });
    mocks.drafts.clear();
    await expect(submitCredentialProof(session, id, { signedCredential: proof })).rejects.toMatchObject({ code: 'DRAFT_NOT_FOUND', status: 404 });
    expect(mocks.saveRecord).not.toHaveBeenCalled();
  });

  it('refuses changed handles, arbitrary campus identity, and private fields during draft creation', async () => {
    await pendingDraft(); mocks.saveDraft.mockClear();
    const body = { authorization: proof.authorization, profile: proof.profile, domain, inputHandles };
    await expect(createCredentialDraft(session, { ...body, inputHandles: [...inputHandles].reverse() })).rejects.toMatchObject({ code: 'INVALID_PROOF' });
    await expect(createCredentialDraft(session, { ...body, profile: { ...profile, graduationDate: '2024-06-01' } })).rejects.toMatchObject({ code: 'INVALID_PROOF' });
    const fakeCampus = await makeProof(proof.authorization.issuanceDeadline, { issuerDisplayName: 'Kampus tidak terdaftar' });
    await expect(createCredentialDraft(session, { ...body, authorization: fakeCampus.authorization, profile: fakeCampus.profile })).rejects.toMatchObject({ code: 'ISSUER_UNAUTHORIZED', status: 403 });
    expect(mocks.saveDraft).not.toHaveBeenCalled();
  });

  it('binds transaction references to the chain event and rejects stored reference tampering', async () => {
    await pendingDraft(); mocks.lookup.mockResolvedValue(metadata);
    await expect(submitCredentialProof(session, id, { signedCredential: proof, issuanceTxHash: `0x${'99'.repeat(32)}` })).rejects.toMatchObject({ code: 'INVALID_PROOF' });
    expect(mocks.saveRecord).not.toHaveBeenCalled();
    storeProof(proof, `0x${'99'.repeat(32)}`);
    expect(await verifyRecord(id)).toMatchObject({ recordVerificationStatus: 'INVALID_PROOF', profile: null });
  });

  it('allows recovery of an already issued proof after its deadline but rejects unissued expired submission', async () => {
    mocks.drafts.set(id, { credentialId: id, ownerWallet: wallet.address.toLowerCase(), authorization: proof.authorization,
      profile: proof.profile, domain, createdAt: '2025-01-01T00:00:00.000Z', expiresAt: '2025-01-01T00:00:01.000Z' });
    mocks.records.clear();
    expect((await submitCredentialProof(session, id, { signedCredential: proof, issuanceTxHash: txHash })).verification.recordVerificationStatus).toBe('VERIFIED_RECORD');
    mocks.lookup.mockResolvedValue(null); mocks.saveRecord.mockClear();
    await expect(submitCredentialProof(session, id, { signedCredential: proof })).rejects.toMatchObject({ code: 'ISSUANCE_EXPIRED' });
    expect(mocks.saveRecord).not.toHaveBeenCalled();
  });
});
