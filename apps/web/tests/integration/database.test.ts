import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { Wallet } from 'ethers';
import { credentialDomain, credentialAuthorizationTypes, deriveCredentialId, hashIssuerName, hashPublicProfile, hashEncryptedAttributes, type SignedCredential } from '@verifikasi/credentials';
import { signedCredentials, credentialDrafts } from '../../src/server/db/schema';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { createDatabase } from '../../src/server/db/client';
import { acquireLease, RelayerBusyError, RelayerLeaseLostError, withDatabaseRelayerLock } from '../../src/server/db/leases';
import { withDatabaseState } from '../../src/server/db/state';
import type { State } from '../../src/server/types';

const url = process.env.TEST_DATABASE_URL;
// Integration tests create and drop only an isolated, random schema on localhost.
// They deliberately never fall back to the application's DATABASE_URL.
if (url && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL must point to a local disposable PostgreSQL server');
}

describe.skipIf(!url)('Drizzle PostgreSQL persistence and transaction-pooler leases', () => {
  const schema = `verification_test_${randomUUID().replaceAll('-', '')}`;
  const freshSchema = `verification_test_${randomUUID().replaceAll('-', '')}`;
  let admin: Pool;
  let first: ReturnType<typeof createDatabase>;
  let second: ReturnType<typeof createDatabase>;
  let fresh: ReturnType<typeof createDatabase>;
  const empty = (): State => ({ sessions: {}, jobs: {}, rates: {}, audit: [] });

  beforeAll(async () => {
    admin = new Pool({ connectionString: url, max: 1 });
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.query(`CREATE SCHEMA "${freshSchema}"`);
    const scoped = new URL(url!);
    scoped.searchParams.set('options', `-c search_path=${schema}`);
    first = createDatabase(scoped.toString());
    second = createDatabase(scoped.toString());
    scoped.searchParams.set('options', `-c search_path=${freshSchema}`);
    fresh = createDatabase(scoped.toString());
    // Simulate a legacy deployment and prove the migration preserves its data.
    await first.pool.query('CREATE TABLE verification_state (id integer PRIMARY KEY CHECK (id=1), body jsonb NOT NULL)');
    await first.pool.query('INSERT INTO verification_state VALUES (1, $1)', [JSON.stringify({ ...empty(), rates: { retained: { count: 7, resetAt: 1 } } })]);
    await migrate(first.db, { migrationsFolder: resolve('drizzle'), migrationsSchema: schema });
  });

  afterAll(async () => {
    await first?.pool.end(); await second?.pool.end(); await fresh?.pool.end();
    if (admin) {
      for (const target of [schema, freshSchema]) {
        if (!/^verification_test_[a-f0-9]{32}$/.test(target)) throw new Error('Unsafe cleanup schema');
        await admin.query(`DROP SCHEMA IF EXISTS "${target}" CASCADE`);
      }
      await admin.end();
    }
  });

  it('requires an explicit migration and initializes a new database', async () => {
    await expect(withDatabaseState(fresh.db, state => state)).rejects.toThrow();
    expect((await fresh.pool.query("SELECT to_regclass('verification_state') AS table_name")).rows[0].table_name).toBeNull();
    await migrate(fresh.db, { migrationsFolder: resolve('drizzle'), migrationsSchema: freshSchema });
    expect(await withDatabaseState(fresh.db, state => state)).toEqual(empty());
  });

  it('preserves legacy data, seeds once and enables private RLS tables', async () => {
    expect(await withDatabaseState(first.db, state => state.rates.retained?.count)).toBe(7);
    await migrate(first.db, { migrationsFolder: resolve('drizzle'), migrationsSchema: schema });
    expect(await withDatabaseState(first.db, state => state.rates.retained?.count)).toBe(7);
    const rls = await first.pool.query<{ relrowsecurity: boolean }>('SELECT relrowsecurity FROM pg_class WHERE relnamespace = current_schema()::regnamespace AND relname IN ($1, $2, $3, $4)', ['verification_state', 'verification_relayer_leases', 'credential_drafts', 'signed_credentials']);
    expect(rls.rows).toHaveLength(4);
    expect(rls.rows.every(row => row.relrowsecurity)).toBe(true);
    expect((await first.pool.query('SELECT * FROM pg_policies WHERE schemaname = current_schema()')).rowCount).toBe(0);
  });

  it('persists signed issuance in separate RLS tables across pools and job-state cleanup', async () => {
    const wallet = Wallet.createRandom();
    const chain = { chainId: 11155111, contractAddress: `0x${'42'.repeat(20)}` };
    const domain = credentialDomain(chain);
    const profile = { schemaVersion: 1, disclosurePolicyVersion: 1, issuerId: `0x${'51'.repeat(32)}` as const, issuerDisplayName: 'Kampus Uji', fullName: 'ANDI CONTOH', diplomaNumber: 'CONTOH/1', studyProgram: 'INFORMATIKA' };
    const id = deriveCredentialId(chain, profile.issuerId, wallet.address, '7');
    const authorization = { credentialId: id, issuerId: profile.issuerId, signer: wallet.address, issuerNameHash: hashIssuerName(profile.issuerDisplayName), publicDataHash: hashPublicProfile(profile), encryptedAttributesHash: hashEncryptedAttributes(Array.from({ length: 4 }, (_, i) => `0x${String(60 + i).repeat(32)}`)), schemaVersion: 1, encodingVersion: 1, disclosurePolicyVersion: 1, nonce: '7', issuanceDeadline: '2000000000' };
    const signed: SignedCredential = { domain, profile, authorization, signature: await wallet.signTypedData(domain, credentialAuthorizationTypes, authorization) };
    const createdAt = new Date().toISOString();
    await first.db.insert(credentialDrafts).values({ credentialId: id, ownerWallet: wallet.address.toLowerCase(), expiresAt: new Date('2033-01-01'), body: { credentialId: id, ownerWallet: wallet.address.toLowerCase(), domain, profile, authorization, createdAt, expiresAt: '2033-01-01T00:00:00.000Z' } });
    await first.db.insert(signedCredentials).values({ credentialId: id, ownerWallet: wallet.address.toLowerCase(), body: { credentialId: id, ownerWallet: wallet.address.toLowerCase(), signed, issuanceTxHash: null, createdAt } });
    await withDatabaseState(first.db, state => { state.jobs = {}; state.sessions = {}; });
    const [stored] = await second.db.select().from(signedCredentials).where(eq(signedCredentials.credentialId, id));
    expect(stored?.body.signed).toEqual(signed);
    expect(JSON.stringify(stored?.body)).not.toContain('graduation');
    expect(await second.db.select().from(credentialDrafts).where(eq(credentialDrafts.credentialId, id))).toHaveLength(1);
  });

  it('serializes mutations across independent connection pools without lost updates', async () => {
    await withDatabaseState(first.db, state => { state.rates.concurrent = { count: 0, resetAt: 1 }; });
    await Promise.all(Array.from({ length: 20 }, (_, index) => withDatabaseState(index % 2 ? first.db : second.db, async state => {
      const prior = state.rates.concurrent!.count;
      await new Promise(resolve => setTimeout(resolve, 2));
      state.rates.concurrent!.count = prior + 1;
    })));
    expect(await withDatabaseState(first.db, state => state.rates.concurrent!.count)).toBe(20);
  });

  it('rolls back state when a mutation fails', async () => {
    await expect(withDatabaseState(first.db, state => { state.rates.rollback = { count: 999, resetAt: 1 }; throw new Error('abort'); })).rejects.toThrow('abort');
    expect(await withDatabaseState(second.db, state => state.rates.rollback)).toBeUndefined();
  });

  it('grants exactly one concurrent relayer lease', async () => {
    const attempts = await Promise.allSettled([acquireLease(first.db, 'race'), acquireLease(second.db, 'race')]);
    expect(attempts.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const failed = attempts.find(result => result.status === 'rejected') as PromiseRejectedResult;
    expect(failed.reason).toBeInstanceOf(RelayerBusyError);
    for (const result of attempts) if (result.status === 'fulfilled') await result.value.release();
  });

  it('fences an expired owner and prevents its release from deleting a successor', async () => {
    const old = await acquireLease(first.db, 'expiry');
    // Advance only this database lease; wall-clock sleeps would make this flaky.
    await first.db.execute(sql`update verification_relayer_leases set expires_at = clock_timestamp() - interval '1 second' where name = 'expiry'`);
    const successor = await acquireLease(second.db, 'expiry');
    await expect(old.assertHeld()).rejects.toBeInstanceOf(RelayerLeaseLostError);
    await old.release();
    await successor.assertHeld();
    await expect(acquireLease(first.db, 'expiry')).rejects.toBeInstanceOf(RelayerBusyError);
    await successor.release();
  });

  it('releases on callback failure and performs action outside a SQL transaction', async () => {
    await expect(withDatabaseRelayerLock(first.db, async lease => {
      await lease.assertHeld();
      // With max=1 this query would deadlock if the lock retained a connection.
      await withDatabaseState(first.db, state => { state.rates.insideLease = { count: 1, resetAt: 1 }; });
      throw new Error('operation failed');
    }, 'callback')).rejects.toThrow('operation failed');
    const next = await acquireLease(second.db, 'callback');
    await next.release();
    expect(await withDatabaseState(second.db, state => state.rates.insideLease!.count)).toBe(1);
  });
});
