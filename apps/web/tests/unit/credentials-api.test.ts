import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Wallet } from 'ethers';
import type { Hex32 } from '@verifikasi/domain';
import { credentialAuthorizationTypes, credentialDomain, deriveCredentialId, hashEncryptedAttributes, hashIssuerName, hashPublicProfile, type SignedCredential } from '@verifikasi/credentials';
import { readDraft, readStoredCredential, saveDraft, saveStoredCredential } from '../../src/server/credentials-repository';
import { cleanup, createJobFromBytes, eraseJob } from '../../src/server/jobs';
import { getPrivate } from '../../src/server/storage';
import { withState } from '../../src/server/store';
import type { CredentialDraft, Session, StoredCredential } from '../../src/server/types';

const wallet = new Wallet(`0x${'11'.repeat(32)}`);
const issuerId = `0x${'cd'.repeat(32)}` as Hex32;
const txHash = `0x${'78'.repeat(32)}`;
const chain = { chainId: 11155111, contractAddress: `0x${'56'.repeat(20)}` };
const domain = credentialDomain(chain);
const id = deriveCredentialId(chain, issuerId, wallet.address, '1');
const session: Session = { id: 'retention-owner', csrf: 'csrf', expiresAt: '2099-01-01T00:00:00.000Z' };
let directory: string;
let draft: CredentialDraft;
let stored: StoredCredential;

async function signed(name = 'Andi Contoh'): Promise<SignedCredential> {
  const profile = { schemaVersion: 1, disclosurePolicyVersion: 1, issuerId, issuerDisplayName: 'Universitas Sintetis',
    fullName: name, diplomaNumber: 'SINTETIS-001', studyProgram: 'Informatika' };
  const authorization = { credentialId: id, issuerId, signer: wallet.address, issuerNameHash: hashIssuerName(profile.issuerDisplayName), publicDataHash: hashPublicProfile(profile),
    encryptedAttributesHash: hashEncryptedAttributes([1, 2, 3, 4].map(n => `0x${n.toString(16).padStart(64, '0')}`)),
    schemaVersion: 1, encodingVersion: 1, disclosurePolicyVersion: 1, nonce: '1', issuanceDeadline: '1' };
  return { authorization, profile, domain, signature: await wallet.signTypedData(domain, credentialAuthorizationTypes, authorization) };
}
function upload(key: string) {
  return createJobFromBytes(new Request('http://localhost:3000/api/verifications', { method: 'POST', headers: { 'Idempotency-Key': key } }),
    session, { bytes: Buffer.from('%PDF-1.7\nSynthetic upload, not an issued credential payload'), name: 'synthetic.pdf', mimeType: 'application/pdf' }, id);
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'verifikasi-credential-retention-'));
  vi.stubEnv('PRIVATE_DATA_DIR', directory); vi.stubEnv('APP_MODE', 'demo'); vi.stubEnv('APP_ORIGIN', 'http://localhost:3000');
  for (const key of ['DATABASE_URL', 'S3_BUCKET', 'BLOB_READ_WRITE_TOKEN', 'VERCEL']) vi.stubEnv(key, '');
  const proof = await signed();
  draft = { credentialId: id, ownerWallet: wallet.address.toLowerCase(), authorization: proof.authorization, profile: proof.profile, domain,
    createdAt: '2025-01-01T00:00:00.000Z', expiresAt: '2025-01-01T00:00:01.000Z' };
  stored = { credentialId: id, ownerWallet: wallet.address.toLowerCase(), signed: proof, issuanceTxHash: null, createdAt: draft.createdAt };
});
afterEach(async () => {
  vi.unstubAllEnvs();
  // Only remove the unique directory created by this test, never a computed workspace path.
  const absolute = resolve(directory);
  expect(absolute.startsWith(`${resolve(tmpdir())}${sep}verifikasi-credential-retention-`)).toBe(true);
  await rm(absolute, { recursive: true, force: true });
});

describe('durable credential storage used by the issuance API (local filesystem adapter)', () => {
  it('freezes the private PDF date with the issuance snapshot and proof', async () => {
    const datedDraft = { ...draft, documentDate: '2027-03-09' };
    const datedProof = { ...stored, documentDate: '2027-03-09' };
    await saveDraft(datedDraft); await saveStoredCredential(datedProof);
    await saveStoredCredential({ ...datedProof, issuanceTxHash: txHash });
    expect((await readStoredCredential(id))?.documentDate).toBe('2027-03-09');
    for (const documentDate of ['2027-03-10', undefined]) {
      await expect(saveDraft({ ...datedDraft, documentDate })).rejects.toMatchObject({ code: 'DRAFT_FROZEN' });
      await expect(saveStoredCredential({ ...datedProof, documentDate })).rejects.toMatchObject({ code: 'IMMUTABLE_CREDENTIAL' });
    }
    expect((await readDraft(id))?.documentDate).toBe('2027-03-09');
  });
  it('keeps signed payloads and public snapshots when an upload expires, is deleted, and leaves history', async () => {
    await saveDraft(draft); await saveStoredCredential(stored);
    const expired = await upload('credential-ttl-fixture-1');
    const manual = await upload('credential-ttl-fixture-2');
    await withState(state => { state.jobs[expired.id]!.artifactsExpireAt = new Date(Date.now() - 1000).toISOString(); });
    await cleanup();
    await expect(getPrivate(expired.id, 'upload.bin')).rejects.toThrow();
    expect((await readStoredCredential(id))?.signed).toEqual(stored.signed);
    await eraseJob(manual.id, session.id);
    await expect(getPrivate(manual.id, 'upload.bin')).rejects.toThrow();
    expect(await readDraft(id)).toEqual(draft);
    await withState(state => {
      for (const job of Object.values(state.jobs)) job.expiresAt = new Date(Date.now() - 1000).toISOString();
    });
    await cleanup();
    expect(await withState(state => state.jobs)).toEqual({});
    expect(await readStoredCredential(id)).toEqual(stored);
    expect(await readDraft(id)).toEqual(draft);
    // Re-read persisted bytes independently: no in-memory fixture substitutes for retention.
    const persisted = JSON.parse(await readFile(join(directory, 'state.json'), 'utf8'));
    expect(persisted.signedCredentials[id].signed.signature).toBe(stored.signed.signature);
    expect(persisted.credentialDrafts[id].profile).toEqual(draft.profile);
  });

  it('freezes a draft and permits identical retries without replacing its review timestamp', async () => {
    await saveDraft(draft);
    await saveDraft({ ...draft, createdAt: '2099-01-01T00:00:00.000Z' });
    expect(await readDraft(id)).toEqual(draft);
    const altered = await signed('Budi Contoh');
    await expect(saveDraft({ ...draft, authorization: altered.authorization, profile: altered.profile })).rejects.toMatchObject({ code: 'DRAFT_FROZEN' });
    expect(await readDraft(id)).toEqual(draft);
  });

  it('adds a verified transaction reference idempotently while refusing payload or owner replacement', async () => {
    await saveStoredCredential(stored);
    await saveStoredCredential({ ...stored, issuanceTxHash: txHash });
    await saveStoredCredential({ ...stored, issuanceTxHash: txHash });
    expect(await readStoredCredential(id)).toEqual({ ...stored, issuanceTxHash: txHash });
    await expect(saveStoredCredential({ ...stored, signed: await signed('Budi Contoh') })).rejects.toMatchObject({ code: 'IMMUTABLE_CREDENTIAL' });
    await expect(saveStoredCredential({ ...stored, ownerWallet: domain.verifyingContract.toLowerCase() })).rejects.toMatchObject({ code: 'IMMUTABLE_CREDENTIAL' });
    await expect(saveStoredCredential({ ...stored, issuanceTxHash: `0x${'99'.repeat(32)}` })).rejects.toMatchObject({ code: 'IMMUTABLE_CREDENTIAL' });
    expect((await readStoredCredential(id))?.signed.profile.fullName).toBe('Andi Contoh');
  });
});
