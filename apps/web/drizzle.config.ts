import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'drizzle-kit';

const envFile = resolve(__dirname, '../../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
// Prefer a direct/unpooled connection for migrations; runtime can use a pooled URL.
const url = process.env.DATABASE_MIGRATION_URL?.trim() || process.env.DATABASE_URL?.trim();
if (process.argv.includes('migrate') && !url) {
  throw new Error('URL database belum diisi. Edit .env di root proyek: isi DATABASE_MIGRATION_URL dengan URL PostgreSQL direct/unpooled untuk migrasi, dan DATABASE_URL dengan URL pooled untuk runtime hosting. Gunakan koneksi dari penyedia database Anda. pnpm init:local mempertahankan .env yang sudah ada; perintah itu tidak mengisi kredensial database.');
}

export default defineConfig({
  dialect: 'postgresql', schema: './src/server/db/schema.ts', out: './drizzle',
  ...(url ? { dbCredentials: { url } } : {}),
  schemaFilter: ['public'], tablesFilter: ['verification_state', 'verification_relayer_leases', 'credential_drafts', 'signed_credentials', 'credential_documents'],
  strict: true, verbose: false,
});
