import { sql } from 'drizzle-orm';
import { check, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { State, CredentialDraft, StoredCredential } from '../types';

/** A typed JSONB aggregate preserves the prototype's atomic quotas and queue claims.
 * This is intentionally not a normalized, high-volume queue. Splitting the
 * aggregate requires equivalent transactional ownership/idempotency guarantees. */
export const verificationState = pgTable('verification_state', {
  id: integer('id').primaryKey(),
  body: jsonb('body').$type<State>().notNull(),
}, table => [check('verification_state_id_check', sql`${table.id} = 1`)]).enableRLS();

/** Durable leases work with Supabase transaction pooling; no session locks. */
export const relayerLeases = pgTable('verification_relayer_leases', {
  name: text('name').primaryKey(),
  owner: uuid('owner').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
}).enableRLS();

/** Issuance proofs outlive verification jobs and must never enter upload cleanup. */
export const credentialDrafts = pgTable('credential_drafts', {
  credentialId: text('credential_id').primaryKey(),
  ownerWallet: text('owner_wallet').notNull(),
  body: jsonb('body').$type<CredentialDraft>().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
}).enableRLS();
export const signedCredentials = pgTable('signed_credentials', {
  credentialId: text('credential_id').primaryKey(),
  ownerWallet: text('owner_wallet').notNull(),
  body: jsonb('body').$type<StoredCredential>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}).enableRLS();

/** Durable private diploma archive; deliberately independent of job/session retention. */
export const credentialDocuments = pgTable('credential_documents', {
  credentialId: text('credential_id').primaryKey(),
  issuerId: text('issuer_id').notNull(),
  body: jsonb('body').$type<import('../document-types').CredentialDocument>().notNull(),
}).enableRLS();
