import { eq, sql } from 'drizzle-orm';
import type { State } from '../types';
import type { Database } from './client';
import { verificationState } from './schema';

/** Keep callbacks short: never wait for OCR, RPC, encryption or decryption here. */
export async function withDatabaseState<T>(db: Database, action: (state: State) => Promise<T> | T): Promise<T> {
  return db.transaction(async tx => {
    await tx.execute(sql`set local lock_timeout = '5s'`);
    await tx.execute(sql`set local statement_timeout = '15s'`);
    const [row] = await tx.select().from(verificationState).where(eq(verificationState.id, 1)).for('update');
    if (!row) throw new Error('Database is not initialized. Run pnpm db:migrate before starting the application.');
    const result = await action(row.body);
    await tx.update(verificationState).set({ body: row.body }).where(eq(verificationState.id, 1));
    return result;
  });
}
