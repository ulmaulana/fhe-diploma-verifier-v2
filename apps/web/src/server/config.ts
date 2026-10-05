import path from 'node:path';
import { serviceAccounts } from '@verifikasi/chain/server';

export function isNetlify() {
  // NETLIFY is a build flag; SITE_ID and URL are also available in Functions.
  return process.env.NETLIFY === 'true' || Boolean(process.env.SITE_ID && process.env.URL);
}

/** Only NEON_STORAGE_* is read: hosted runtimes such as Netlify reserve the AWS_* names. */
export function neonStorageConfig() {
  return {
    bucket: process.env.S3_BUCKET,
    endpoint: process.env.NEON_STORAGE_ENDPOINT,
    region: process.env.NEON_STORAGE_REGION,
    accessKeyId: process.env.NEON_STORAGE_ACCESS_KEY_ID,
    secretAccessKey: process.env.NEON_STORAGE_SECRET_ACCESS_KEY,
  };
}

export function config() {
  const mode = process.env.APP_MODE === 'testnet' ? 'testnet' as const : 'demo' as const;
  return {
    mode, origin: (process.env.APP_ORIGIN?.trim() || (isNetlify() && process.env.URL?.trim()) || 'http://localhost:3000').replace(/\/$/, ''),
    dataDir: path.resolve(process.env.PRIVATE_DATA_DIR || '.private-data'),
    databaseUrl: process.env.DATABASE_URL,
    maxBytes: 10 * 1024 * 1024, maxActive: 5, historyMs: 24 * 60 * 60 * 1000, artifactMs: 60 * 60 * 1000,
  };
}
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export function requireRealConfiguration() {
  const neonStorage = process.env.STORAGE_PROVIDER === 'neon';
  if (neonStorage && Object.values(neonStorageConfig()).some(value => !value?.trim())) {
    throw new ApiError(503, 'CONFIGURATION_REQUIRED', 'Penyimpanan dokumen belum dikonfigurasi. Unggahan belum diterima.');
  }
  if (isNetlify() && !process.env.DATABASE_URL) throw new ApiError(503, 'CONFIGURATION_REQUIRED', 'Penyimpanan sesi hosting belum dikonfigurasi. Unggahan belum diterima.');
  // Hosted sessions require Postgres; private file storage can be Neon or Vercel Blob.
  if (process.env.VERCEL === '1') {
    const required = neonStorage ? ['DATABASE_URL', 'APP_ORIGIN'] : ['DATABASE_URL', 'BLOB_READ_WRITE_TOKEN', 'BLOB_STORE_HOSTNAME', 'APP_ORIGIN'];
    const missing = required.filter(key => !process.env[key]);
    if (missing.length) throw new ApiError(503, 'CONFIGURATION_REQUIRED', 'Layanan hosting belum dikonfigurasi. Unggahan belum diterima.');
  }
  if (config().mode !== 'testnet') return;
  const missing = ['DATABASE_URL', 'RPC_URL', 'CREDENTIAL_CONTRACT_ADDRESS', 'RELAYER_PRIVATE_KEY', 'ATTESTOR_PRIVATE_KEY', 'RESULT_READER_PRIVATE_KEY'].filter(key => !process.env[key]);
  if (missing.length) throw new ApiError(503, 'CONFIGURATION_REQUIRED', 'Layanan testnet belum dikonfigurasi. Unggahan belum diterima.');
  // Local check without RPC: three valid, distinct service keys. Role checks on chain happen before signing.
  try { serviceAccounts(); }
  catch { throw new ApiError(503, 'CONFIGURATION_INVALID', 'Kunci layanan testnet tidak valid atau tidak terpisah. Unggahan belum diterima.'); }
}
