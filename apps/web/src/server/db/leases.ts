import { randomUUID } from 'node:crypto';
import { and, eq, gt, lte, sql } from 'drizzle-orm';
import type { Database } from './client';
import { relayerLeases } from './schema';

export class RelayerBusyError extends Error {
  constructor() { super('Relayer is busy'); this.name = 'RelayerBusyError'; }
}
export class RelayerLeaseLostError extends Error {
  constructor() { super('Relayer lease expired or ownership changed'); this.name = 'RelayerLeaseLostError'; }
}
export interface RelayerLease {
  /** Revalidate and renew immediately before persisting/broadcasting a transaction.
   * Expired owners can never renew or delete their successor's lease. */
  assertHeld: () => Promise<void>;
}

/** One atomic statement acquires an absent or expired lease using database time. */
export async function acquireLease(db: Database, name: string, durationMs = 120_000) {
  if (!Number.isInteger(durationMs) || durationMs < 100 || durationMs > 900_000) throw new Error('Invalid relayer lease duration');
  const owner = randomUUID();
  const expires = sql`clock_timestamp() + (${durationMs} * interval '1 millisecond')`;
  const [row] = await db.insert(relayerLeases).values({ name, owner, expiresAt: expires })
    .onConflictDoUpdate({ target: relayerLeases.name, set: { owner, expiresAt: expires }, setWhere: lte(relayerLeases.expiresAt, sql`clock_timestamp()`) })
    .returning({ owner: relayerLeases.owner });
  if (!row) throw new RelayerBusyError();
  return {
    async assertHeld() {
      const renewed = await db.update(relayerLeases).set({ expiresAt: expires })
        .where(and(eq(relayerLeases.name, name), eq(relayerLeases.owner, owner), gt(relayerLeases.expiresAt, sql`clock_timestamp()`)))
        .returning({ owner: relayerLeases.owner });
      if (renewed.length !== 1) throw new RelayerLeaseLostError();
    },
    async release() {
      await db.delete(relayerLeases).where(and(eq(relayerLeases.name, name), eq(relayerLeases.owner, owner)));
    },
  };
}

/** Network/crypto work runs outside every SQL transaction. Database expiry recovers
 * crashed/frozen instances; owner tokens fence late renewals and releases. A
 * paused JavaScript process must call assertHeld again before external effects. */
export async function withDatabaseRelayerLock<T>(db: Database, action: (lease: RelayerLease) => Promise<T>, name = 'verification-relayer'): Promise<T> {
  const lease = await acquireLease(db, name);
  let lost = false;
  let renewing = false;
  const assertHeld = async () => {
    if (lost) throw new RelayerLeaseLostError();
    try { await lease.assertHeld(); }
    catch (error) { lost = true; throw error; }
  };
  const heartbeat = setInterval(() => {
    if (renewing || lost) return;
    renewing = true;
    void assertHeld().catch(() => { lost = true; }).finally(() => { renewing = false; });
  }, 30_000);
  heartbeat.unref();
  try {
    const result = await action({ assertHeld });
    await assertHeld();
    return result;
  } finally {
    clearInterval(heartbeat);
    // A crashed invocation is recovered by expiry. A release error must not mask
    // a successful transaction or the original failure and cause a fresh send.
    await lease.release().catch(() => {});
  }
}
