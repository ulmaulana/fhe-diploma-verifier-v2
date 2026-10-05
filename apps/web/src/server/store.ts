import { mkdir, readFile, writeFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ApiError, config, isNetlify } from './config';
import { diagnostic } from './diagnostics';
import type { State } from './types';
import { database } from './db/client';
import { withDatabaseState } from './db/state';
import { withDatabaseRelayerLock, type RelayerLease } from './db/leases';

const empty = (): State => ({ sessions: {}, jobs: {}, rates: {}, audit: [] });

/** A transaction serializes quota, ownership, queue leases and idempotency atomically.
 * The singleton JSON document is intentionally a small-prototype implementation.
 * PostgreSQL row locking works across web replicas and survives process restarts. */
export async function withState<T>(fn: (state: State) => Promise<T> | T): Promise<T> {
  const cfg = config();
  if (cfg.databaseUrl) {
    try { return await withDatabaseState(database(), fn); }
    catch (error) {
      if (error instanceof ApiError) throw error;
      // Drizzle wraps driver failures. Log only the allowlisted code, never SQL or credentials.
      const cause = error instanceof Error && error.cause ? error.cause : error;
      diagnostic('SESSION_STORAGE', cause);
      throw new ApiError(503, 'SESSION_STORAGE_UNAVAILABLE', 'Penyimpanan sesi sedang tidak tersedia. Silakan coba lagi atau hubungi pengelola situs.');
    }
  }
  if (cfg.mode === 'testnet' || process.env.VERCEL || isNetlify()) {
    throw new ApiError(503, 'DATABASE_CONFIGURATION_REQUIRED', 'Penyimpanan sesi belum dikonfigurasi. Hubungi pengelola situs.');
  }
  await mkdir(cfg.dataDir, { recursive: true, mode: 0o700 });
  const lock = path.join(cfg.dataDir, 'state.lock');
  const started = Date.now();
  for (;;) {
    try { await mkdir(lock); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const age = await stat(lock).then(value => Date.now() - value.mtimeMs).catch(() => 0);
      if (age > 120_000) { await rm(lock, { recursive: true, force: true }); continue; }
      if (Date.now() - started > 15_000) throw new Error('State is busy');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  try {
    const statePath = path.join(cfg.dataDir, 'state.json');
    const state: State = await readFile(statePath, 'utf8').then(JSON.parse).catch(error => {
      if (error.code === 'ENOENT') return empty();
      throw error;
    });
    const result = await fn(state);
    const tmp = path.join(cfg.dataDir, `state-${randomUUID()}.tmp`);
    await writeFile(tmp, JSON.stringify(state), { mode: 0o600 });
    await rename(tmp, statePath);
    return result;
  } finally { await rm(lock, { recursive: true, force: true }); }
}

export function audit(state: State, action: string, objectId: string) {
  state.audit.push({ action, objectId, at: new Date().toISOString() });
  state.audit = state.audit.slice(-1000);
}

/** Durable owner-token lease is compatible with PostgreSQL transaction pooling. */
export async function withRelayerLock<T>(action: (lease: RelayerLease) => Promise<T>): Promise<T> {
  return withDatabaseRelayerLock(database(), action);
}
