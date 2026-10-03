import { eq, inArray } from 'drizzle-orm';
import { database } from './db/client';
import { credentialDocuments } from './db/schema';
import { config } from './config';
import { withState } from './store';
import type { CredentialDocument } from './document-types';

export async function readDocument(id: string): Promise<CredentialDocument | null> {
  if (!config().databaseUrl) return withState(state => state.credentialDocuments?.[id] ?? null);
  const [row] = await database().select().from(credentialDocuments).where(eq(credentialDocuments.credentialId, id));
  return row?.body ?? null;
}
/** One query for a page of portal rows; ids without a document are absent from the map. */
export async function readDocuments(ids: string[]): Promise<Map<string, CredentialDocument>> {
  if (!ids.length) return new Map();
  if (!config().databaseUrl) return withState(state => new Map(ids.flatMap(id => state.credentialDocuments?.[id] ? [[id, state.credentialDocuments[id]!] as const] : [])));
  const rows = await database().select().from(credentialDocuments).where(inArray(credentialDocuments.credentialId, ids));
  return new Map(rows.map(row => [row.credentialId, row.body]));
}
/** Short row transaction. Callbacks must not perform network or nested state/database IO. */
export async function mutateDocument(id: string, initial: CredentialDocument | undefined, change: (current: CredentialDocument) => CredentialDocument): Promise<CredentialDocument | null> {
  if (!config().databaseUrl) return withState(state => {
    state.credentialDocuments ??= {};
    const previous = state.credentialDocuments[id] ?? initial;
    if (!previous) return null;
    const next = change(previous); state.credentialDocuments[id] = next; return next;
  });
  return database().transaction(async tx => {
    if (initial) await tx.insert(credentialDocuments).values({ credentialId: id, issuerId: initial.issuerId, body: initial }).onConflictDoNothing();
    const [row] = await tx.select().from(credentialDocuments).where(eq(credentialDocuments.credentialId, id)).for('update');
    if (!row) return null;
    const next = change(row.body);
    await tx.update(credentialDocuments).set({ body: next }).where(eq(credentialDocuments.credentialId, id));
    return next;
  });
}
