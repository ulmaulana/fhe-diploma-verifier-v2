import { eq, inArray } from 'drizzle-orm';
import { credentialDigest, hashPublicProfile } from '@verifikasi/credentials';
import { ApiError, config } from './config';
import { withState } from './store';
import { database } from './db/client';
import { credentialDrafts, signedCredentials } from './db/schema';
import type { CredentialDraft, StoredCredential } from './types';

function sameDraft(a: CredentialDraft, b: CredentialDraft) {
  return a.ownerWallet === b.ownerWallet && a.documentDate === b.documentDate && credentialDigest(a.authorization, a.domain) === credentialDigest(b.authorization, b.domain) && hashPublicProfile(a.profile) === hashPublicProfile(b.profile);
}
function mergeProof(previous: StoredCredential, incoming: StoredCredential): StoredCredential {
  if (previous.ownerWallet !== incoming.ownerWallet ||
      previous.documentDate !== incoming.documentDate ||
      credentialDigest(previous.signed.authorization, previous.signed.domain) !== credentialDigest(incoming.signed.authorization, incoming.signed.domain) ||
      hashPublicProfile(previous.signed.profile) !== hashPublicProfile(incoming.signed.profile) ||
      previous.signed.signature.toLowerCase() !== incoming.signed.signature.toLowerCase() ||
      previous.issuanceTxHash && incoming.issuanceTxHash && previous.issuanceTxHash !== incoming.issuanceTxHash) {
    throw new ApiError(409, 'IMMUTABLE_CREDENTIAL', 'Bukti penerbitan sudah tersimpan dan tidak dapat diganti. Koreksi memerlukan penerbitan ID baru.');
  }
  return { ...previous, issuanceTxHash: previous.issuanceTxHash || incoming.issuanceTxHash };
}

export async function readDraft(id: string): Promise<CredentialDraft | null> {
  if (!config().databaseUrl) return withState(state => state.credentialDrafts?.[id] || null);
  const [row] = await database().select().from(credentialDrafts).where(eq(credentialDrafts.credentialId, id));
  return row?.body || null;
}
export async function saveDraft(draft: CredentialDraft): Promise<void> {
  if (!config().databaseUrl) {
    return withState(state => {
      state.credentialDrafts ??= {};
      const previous = state.credentialDrafts[draft.credentialId];
      if (previous && !sameDraft(previous, draft)) throw new ApiError(409, 'DRAFT_FROZEN', 'Data draf telah dibekukan. Buat ID baru untuk perubahan data.');
      state.credentialDrafts[draft.credentialId] = previous || draft;
    });
  }
  await database().transaction(async tx => {
    await tx.insert(credentialDrafts).values({ credentialId: draft.credentialId, ownerWallet: draft.ownerWallet, body: draft, expiresAt: new Date(draft.expiresAt) }).onConflictDoNothing();
    const [row] = await tx.select().from(credentialDrafts).where(eq(credentialDrafts.credentialId, draft.credentialId)).for('update');
    if (!row || !sameDraft(row.body, draft)) throw new ApiError(409, 'DRAFT_FROZEN', 'Data draf telah dibekukan. Buat ID baru untuk perubahan data.');
  });
}
export async function readStoredCredential(id: string): Promise<StoredCredential | null> {
  if (!config().databaseUrl) return withState(state => state.signedCredentials?.[id] || null);
  const [row] = await database().select().from(signedCredentials).where(eq(signedCredentials.credentialId, id));
  return row?.body || null;
}
/** One query for a page of portal rows; ids without a stored proof are absent from the map. */
export async function readStoredCredentials(ids: string[]): Promise<Map<string, StoredCredential>> {
  if (!ids.length) return new Map();
  if (!config().databaseUrl) return withState(state => new Map(ids.flatMap(id => state.signedCredentials?.[id] ? [[id, state.signedCredentials[id]!] as const] : [])));
  const rows = await database().select().from(signedCredentials).where(inArray(signedCredentials.credentialId, ids));
  return new Map(rows.map(row => [row.credentialId, row.body]));
}
export async function saveStoredCredential(incoming: StoredCredential): Promise<void> {
  if (!config().databaseUrl) {
    return withState(state => {
      state.signedCredentials ??= {};
      const previous = state.signedCredentials[incoming.credentialId];
      state.signedCredentials[incoming.credentialId] = previous ? mergeProof(previous, incoming) : incoming;
    });
  }
  await database().transaction(async tx => {
    await tx.insert(signedCredentials).values({ credentialId: incoming.credentialId, ownerWallet: incoming.ownerWallet, body: incoming }).onConflictDoNothing();
    const [row] = await tx.select().from(signedCredentials).where(eq(signedCredentials.credentialId, incoming.credentialId)).for('update');
    if (!row) throw new Error('Credential storage unavailable');
    const merged = mergeProof(row.body, incoming);
    await tx.update(signedCredentials).set({ body: merged }).where(eq(signedCredentials.credentialId, incoming.credentialId));
  });
}
