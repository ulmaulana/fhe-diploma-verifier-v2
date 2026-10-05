import { attachDatabasePool } from '@vercel/functions';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export function createDatabase(connectionString: string, max = 1) {
  if (!Number.isInteger(max) || max < 1 || max > 10) throw new Error('DATABASE_POOL_MAX must be between 1 and 10');
  const pool = new Pool({
    connectionString, max, idleTimeoutMillis: 5_000, connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });
  // Idle network errors should discard the connection, not crash the process.
  // Do not log errors here: driver messages can contain connection details.
  pool.on('error', () => {});
  if (process.env.VERCEL) attachDatabasePool(pool);
  // Keep queries unnamed and avoid session state so runtime does not depend on
  // a transaction pooler's support for named prepared statements or sessions.
  return { db: drizzle(pool, { schema }), pool };
}

export type Database = ReturnType<typeof createDatabase>['db'];
let cached: ReturnType<typeof createDatabase> | undefined;

export function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required for persistent storage');
  cached ??= createDatabase(url, Number(process.env.DATABASE_POOL_MAX || 1));
  return cached.db;
}
