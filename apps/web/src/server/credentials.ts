import { diagnostic, readWithRetry } from './diagnostics';
import { getAddress } from 'ethers';
import { isCredentialId, type RecordVerificationResult } from '@verifikasi/domain';
import {
  LEGACY_CREDENTIAL_PROTOCOL_VERSION, credentialDomain, credentialDigest, hashEncryptedAttributes, hashPublicProfile,
  legacyCredentialDomainV1, parseCredentialAuthorization, parsePublicProfile, validateLegacySignedCredentialV1, validateSignedCredential,
  type LegacySignedCredentialV1, type SignedCredential,
} from '@verifikasi/credentials';
import { getIssuer, legacyCredentialContracts, lookupCredential, lookupLegacyCredential, serverChainConfig, type CredentialMetadata } from '@verifikasi/chain/server';
import { ApiError, config } from './config';
import { readDraft, readStoredCredential, saveDraft, saveStoredCredential } from './credentials-repository';
import { audit, withState } from './store';
import { limit } from './http';
import type { Session } from './types';
import { graduationDate } from './document-date';

const equal = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
export function credentialId(value: string) {
  if (!isCredentialId(value)) throw new ApiError(400, 'INVALID_CREDENTIAL', 'Format ID kredensial tidak valid.');
  return value.toLowerCase();
}
function portalWallet(current: Session) {
  if (!current.wallet) throw new ApiError(401, 'WALLET_REQUIRED', 'Masuk dengan wallet pejabat kampus terlebih dahulu.');
  if (config().mode !== 'testnet') throw new ApiError(503, 'TESTNET_REQUIRED', 'Penerbitan resmi memerlukan konfigurasi testnet.');
  return getAddress(current.wallet);
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'INVALID_PAYLOAD', 'Payload kredensial tidak valid.');
  return value as Record<string, unknown>;
}
function proofError(): never { throw new ApiError(400, 'INVALID_PROOF', 'Payload, domain, atau tanda tangan kredensial tidak valid.'); }

/** The PDF date is private issuer input, separate from the public signed profile. */
export async function createCredentialDraft(current: Session, value: unknown) {
  const wallet = portalWallet(current);
  const body = object(value);
  if (Object.keys(body).some(key => !['authorization', 'profile', 'domain', 'inputHandles', 'documentDate'].includes(key))) proofError();
  const documentDate = body.documentDate === undefined ? undefined : graduationDate(body.documentDate);
  const trustedDomain = credentialDomain(serverChainConfig());
  const parsed = (() => {
    try {
      const authorization = parseCredentialAuthorization(body.authorization);
      const profile = parsePublicProfile(body.profile);
      const suppliedDomain = object(body.domain);
      if (Object.keys(suppliedDomain).length !== 4 || suppliedDomain.name !== trustedDomain.name || suppliedDomain.version !== trustedDomain.version || suppliedDomain.chainId !== trustedDomain.chainId || typeof suppliedDomain.verifyingContract !== 'string' || !equal(suppliedDomain.verifyingContract, trustedDomain.verifyingContract)) proofError();
      if (!Array.isArray(body.inputHandles) || body.inputHandles.length !== 4 || body.inputHandles.some(handle => typeof handle !== 'string' || !isCredentialId(handle))) proofError();
      if (!equal(authorization.signer, wallet) || !equal(profile.issuerId, authorization.issuerId) ||
          hashPublicProfile(profile) !== authorization.publicDataHash || hashEncryptedAttributes(body.inputHandles as string[], authorization.encodingVersion) !== authorization.encryptedAttributesHash ||
          profile.schemaVersion !== authorization.schemaVersion || profile.disclosurePolicyVersion !== authorization.disclosurePolicyVersion) proofError();
      const seconds = BigInt(Math.floor(Date.now() / 1000));
      if (BigInt(authorization.issuanceDeadline) <= seconds || BigInt(authorization.issuanceDeadline) > seconds + 86_400n) throw new ApiError(400, 'INVALID_DEADLINE', 'Batas penerbitan harus berada dalam 24 jam mendatang.');
      return { authorization, profile };
    } catch (error) { if (error instanceof ApiError) throw error; proofError(); }
  })();
  const issuer = await getIssuer(wallet);
  if (!issuer.exists || !issuer.active || !issuer.signerActive || !equal(issuer.issuerId, parsed.authorization.issuerId) || issuer.name !== parsed.profile.issuerDisplayName) throw new ApiError(403, 'ISSUER_UNAUTHORIZED', 'Wallet atau identitas kampus belum berwenang untuk penerbitan ini.');
  const id = credentialId(parsed.authorization.credentialId);
  await withState(state => limit(state, `draft:${wallet.toLowerCase()}`, 30, 3600_000));
  await saveDraft({ credentialId: id, ownerWallet: wallet.toLowerCase(), ...parsed, documentDate, domain: trustedDomain, createdAt: new Date().toISOString(), expiresAt: new Date(Number(parsed.authorization.issuanceDeadline) * 1000).toISOString() });
  await withState(state => audit(state, 'CREDENTIAL_DRAFT_FROZEN', id));
  return { credentialId: id, status: 'DRAFT' as const };
}

type RecordProof = SignedCredential | LegacySignedCredentialV1;
const INVALID_PROOF_REASON = 'Profil publik atau bukti pengesahan tidak sesuai dengan rekaman penerbitan. Data ini tidak ditampilkan sebagai rekaman resmi.';
const LEGACY_NOTE = 'Rekaman ini diterbitkan pada kontrak versi 1 yang dipertahankan untuk pembacaan. Pemeriksaan dokumen dengan FHE hanya tersedia untuk kontrak aktif.';

function storedDomainOf(value: unknown): Record<string, unknown> | null {
  const domain = value && typeof value === 'object' ? (value as { domain?: unknown }).domain : null;
  return domain && typeof domain === 'object' ? domain as Record<string, unknown> : null;
}

/** Status of a validated proof bound to a successful chain read. */
function statusPatch(metadata: CredentialMetadata | null, signed: RecordProof, note = ''): Partial<RecordVerificationResult> {
  if (!metadata || !metadata.confirmed) return { recordVerificationStatus: 'PENDING', reason: 'Bukti pengesahan tersimpan; penerbitan belum terkonfirmasi pada blockchain.', checkedBlock: metadata?.checkedBlock ?? null };
  const status = metadata.revoked ? 'REVOKED' : !metadata.issuerActive ? 'ISSUER_INACTIVE' : 'VERIFIED_RECORD';
  const reason = status === 'REVOKED' ? 'Kredensial telah dicabut oleh penerbit.' : status === 'ISSUER_INACTIVE' ? 'Bukti pengesahan valid, tetapi kewenangan kampus saat ini tidak aktif.' : 'Pengesahan dan rekaman penerbit valid. Cocokkan informasi ini dengan dokumen yang Anda periksa.';
  return {
    recordVerificationStatus: status, profile: signed.profile, issuerName: signed.profile.issuerDisplayName,
    checkedAt: metadata.checkedAt, checkedBlock: metadata.checkedBlock, issuanceTxHash: metadata.issuanceTransactionHash,
    issuanceBlock: metadata.issuanceBlock, revokedAt: metadata.revokedAt, revocationBlock: metadata.revocationBlock,
    revocationTxHash: metadata.revocationTransactionHash,
    signer: metadata.signer, credentialDigest: metadata.credentialDigest,
    reason: note ? `${reason} ${note}` : reason,
  };
}

function boundProof<T extends RecordProof>(validate: () => T, id: string, metadata: CredentialMetadata | null, issuanceTxHash: string | null): T {
  const signed = validate();
  if (!equal(signed.authorization.credentialId, id) || metadata && !metadata.historicalSignerAuthorized) proofError();
  if (metadata && issuanceTxHash && !equal(issuanceTxHash, metadata.issuanceTransactionHash)) proofError();
  return signed;
}

export async function inspectCredential(value: string): Promise<{ verification: RecordVerificationResult; signedCredential: RecordProof | null }> {
  const id = credentialId(value);
  const base: RecordVerificationResult = {
    mode: 'RECORD', environment: config().mode, scope: 'RECORD_ONLY', credentialId: id,
    recordVerificationStatus: 'ERROR', documentDecision: null,
    reason: 'Bukti penerbitan atau blockchain belum dapat diperiksa. Coba kembali.',
    profile: null, issuerName: null, checkedAt: new Date().toISOString(), checkedBlock: null,
    chainId: null, contractAddress: null, legacyContract: false, issuanceTxHash: null, issuanceBlock: null, revokedAt: null, revocationBlock: null,
    revocationTxHash: null, signer: null, credentialDigest: null,
  };
  // A signed proof is disclosed only with a confirmed status; a PENDING answer never carries it.
  const answer = (patch: Partial<RecordVerificationResult>, signedCredential: RecordProof | null = null) => ({ verification: { ...base, ...patch },
    signedCredential: patch.recordVerificationStatus === 'PENDING' ? null : signedCredential });
  if (config().mode !== 'testnet') return answer({ reason: 'Mode demonstrasi tidak memverifikasi rekaman blockchain. Konfigurasikan testnet untuk pemeriksaan resmi.' });
  let stage: 'CONFIGURATION' | 'RPC' | 'PROOF_STORAGE' = 'CONFIGURATION';
  try {
    const chain = serverChainConfig();
    const trustedDomain = credentialDomain(chain);
    base.chainId = trustedDomain.chainId; base.contractAddress = trustedDomain.verifyingContract;
    stage = 'RPC';
    const metadata = await readWithRetry('RPC', () => lookupCredential(id));
    stage = 'PROOF_STORAGE';
    const stored = await readWithRetry('PROOF_STORAGE', () => readStoredCredential(id));
    if (!metadata && !stored) return answer({ recordVerificationStatus: 'NOT_FOUND', reason: 'Pembacaan blockchain berhasil; rekaman tidak ditemukan.' });
    if (!stored) return answer({ checkedAt: metadata!.checkedAt, checkedBlock: metadata!.checkedBlock, reason: 'Rekaman blockchain ditemukan, tetapi bukti penerbitan belum tersedia. Hubungi penerbit.' });
    // A protocol v1 proof belongs to an earlier contract. It is never validated against the active (v2) domain;
    // it is read only from a contract the server lists as trusted, never from an address in the proof alone.
    const storedDomain = storedDomainOf(stored.signed);
    if (!metadata && storedDomain?.version === LEGACY_CREDENTIAL_PROTOCOL_VERSION) {
      stage = 'CONFIGURATION';
      const legacy = legacyCredentialContracts().find(entry => typeof storedDomain.verifyingContract === 'string' && equal(entry.address, storedDomain.verifyingContract));
      if (!legacy || storedDomain.chainId !== chain.chainId) {
        return answer({ reason: 'Bukti tersimpan berasal dari kontrak versi 1 yang tidak terdaftar sebagai kontrak resmi pada konfigurasi server. Rekaman tidak dinyatakan palsu, tetapi tidak dapat diverifikasi oleh kontrak aktif; hubungi penerbit untuk penerbitan ulang.' });
      }
      const legacyBase = { contractAddress: legacy.address, legacyContract: true };
      stage = 'RPC';
      const legacyMetadata = await readWithRetry('RPC', () => lookupLegacyCredential(id, legacy.address));
      if (!legacyMetadata) return answer({ ...legacyBase, recordVerificationStatus: 'NOT_FOUND', reason: 'Pembacaan kontrak versi 1 berhasil; rekaman tidak ditemukan.' });
      if (legacyMetadata.issuanceBlock > legacy.cutoffBlock) {
        return answer({ ...legacyBase, checkedBlock: legacyMetadata.checkedBlock, reason: `Rekaman pada kontrak versi 1 diterbitkan setelah batas migrasi (blok ${legacy.cutoffBlock}) sehingga tidak diperlakukan sebagai rekaman resmi.` });
      }
      let signed: LegacySignedCredentialV1;
      try {
        signed = boundProof(() => validateLegacySignedCredentialV1(stored.signed, legacyCredentialDomainV1({ chainId: chain.chainId, contractAddress: legacy.address }), legacyMetadata),
          id, legacyMetadata, stored.issuanceTxHash);
      } catch {
        return answer({ ...legacyBase, recordVerificationStatus: 'INVALID_PROOF', checkedBlock: legacyMetadata.checkedBlock, reason: INVALID_PROOF_REASON });
      }
      return answer({ ...legacyBase, ...statusPatch(legacyMetadata, signed, LEGACY_NOTE) }, signed);
    }
    let signed: SignedCredential;
    try {
      signed = boundProof(() => validateSignedCredential(stored.signed, trustedDomain, metadata || undefined), id, metadata, stored.issuanceTxHash);
    } catch {
      return answer({ recordVerificationStatus: 'INVALID_PROOF', checkedBlock: metadata?.checkedBlock ?? null, reason: INVALID_PROOF_REASON });
    }
    return answer(statusPatch(metadata, signed), signed);
  } catch (error) {
    const code = diagnostic(stage, error);
    const reasons = { CONFIGURATION: 'Konfigurasi jaringan atau kontrak belum valid.', RPC: 'Layanan RPC belum dapat membaca rekaman blockchain.', PROOF_STORAGE: 'Penyimpanan bukti penerbitan belum dapat dibaca.' };
    return answer({ reason: `${reasons[stage]} Coba kembali. (${stage}/${code})` });
  }
}
export async function verifyRecord(id: string): Promise<RecordVerificationResult> { return (await inspectCredential(id)).verification; }

/** Signed data is durable BEFORE broadcast; only a verified chain binding publishes it. */
export async function submitCredentialProof(current: Session, value: string, bodyValue: unknown) {
  const wallet = portalWallet(current); const id = credentialId(value); const body = object(bodyValue);
  if (Object.keys(body).some(key => !['signedCredential', 'issuanceTxHash'].includes(key))) proofError();
  const domain = credentialDomain(serverChainConfig());
  let signed: SignedCredential;
  try { signed = validateSignedCredential(body.signedCredential, domain); } catch { proofError(); }
  if (!equal(signed.authorization.credentialId, id) || !equal(signed.authorization.signer, wallet)) throw new ApiError(403, 'CREDENTIAL_OWNER', 'Wallet tidak berwenang menyimpan bukti ini.');
  let txHash: string | null = null;
  if (body.issuanceTxHash !== undefined) { if (typeof body.issuanceTxHash !== 'string' || !isCredentialId(body.issuanceTxHash)) proofError(); txHash = body.issuanceTxHash.toLowerCase(); }
  const draft = await readDraft(id);
  if (!draft || draft.ownerWallet !== wallet.toLowerCase()) throw new ApiError(404, 'DRAFT_NOT_FOUND', 'Draf penerbitan tidak ditemukan untuk wallet ini.');
  if (credentialDigest(draft.authorization, draft.domain) !== credentialDigest(signed.authorization, domain) || hashPublicProfile(draft.profile) !== hashPublicProfile(signed.profile)) throw new ApiError(409, 'DRAFT_CHANGED', 'Data berbeda dari snapshot yang ditinjau. Buat draf dan pengesahan baru.');
  // A submission after its deadline is acceptable only for an already issued record.
  const metadata = await lookupCredential(id);
  if (!metadata && BigInt(signed.authorization.issuanceDeadline) <= BigInt(Math.floor(Date.now() / 1000))) throw new ApiError(409, 'ISSUANCE_EXPIRED', 'Batas pengajuan penerbitan telah berakhir.');
  if (metadata) {
    try { validateSignedCredential(signed, domain, metadata); } catch { proofError(); }
    if (!metadata.historicalSignerAuthorized || txHash && !equal(txHash, metadata.issuanceTransactionHash)) proofError();
  } else {
    const issuer = await getIssuer(wallet);
    if (!issuer.exists || !issuer.active || !issuer.signerActive || !equal(issuer.issuerId, signed.authorization.issuerId) || issuer.name !== signed.profile.issuerDisplayName) throw new ApiError(403, 'ISSUER_UNAUTHORIZED', 'Kewenangan penerbit tidak aktif atau identitas kampus berubah.');
    // Do not pin an arbitrary transaction hash before its issuance event can be checked.
    txHash = null;
  }
  await saveStoredCredential({ credentialId: id, ownerWallet: wallet.toLowerCase(), signed, documentDate: draft.documentDate, issuanceTxHash: metadata?.issuanceTransactionHash || txHash, createdAt: new Date().toISOString() });
  await withState(state => audit(state, 'CREDENTIAL_PROOF_SAVED', id));
  const verification = await verifyRecord(id);
  return { verification, qrUrl: verification.recordVerificationStatus === 'VERIFIED_RECORD' ? `${config().origin}/c/${id}` : null };
}
