import { zipFunctions } from '@netlify/zip-it-and-ship-it';
import toml from 'toml';
import yauzl from 'yauzl';
import { createWriteStream } from 'node:fs';
import { readFile, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { resolve, dirname, relative, sep, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { pipeline } from 'node:stream/promises';
import { spawnSync } from 'node:child_process';
import './build-netlify-functions.mjs';

const root = resolve(import.meta.dirname, '..');
const settings = toml.parse(await readFile(resolve(root, 'netlify.toml'), 'utf8'));
const config = Object.fromEntries(Object.entries(settings.functions).filter(([, value]) => typeof value === 'object').map(([name, value]) => [name, {
  nodeBundler: value.node_bundler, externalNodeModules: value.external_node_modules,
  includedFiles: value.included_files, nodeVersion: '22',
}]));
config['*'] = { nodeVersion: '22' };
const temporary = await mkdtemp(resolve(tmpdir(), 'verifikasi-netlify-'));
function inside(base, name) {
  const target = resolve(base, name);
  if (!target.startsWith(base + sep)) throw new Error('Archive path escapes test directory');
  return target;
}
async function extract(archive, directory) {
  const zip = await new Promise((ok, fail) => yauzl.open(archive, { lazyEntries: true }, (error, value) => error ? fail(error) : ok(value)));
  const links = new Map(); let bytes = 0;
  await new Promise((ok, fail) => {
    zip.on('error', fail); zip.on('end', ok);
    zip.on('entry', entry => {
      (async () => {
        const target = inside(directory, entry.fileName);
        if (entry.fileName.endsWith('/')) { await mkdir(target, { recursive: true }); return; }
        bytes += entry.uncompressedSize;
        await mkdir(dirname(target), { recursive: true });
        const stream = await new Promise((done, reject) => zip.openReadStream(entry, (error, value) => error ? reject(error) : done(value)));
        if (((entry.externalFileAttributes >>> 16) & 0o170000) === 0o120000) {
          const chunks = []; for await (const chunk of stream) chunks.push(chunk);
          const raw = Buffer.concat(chunks).toString();
          // pnpm uses absolute junction targets on Windows, relative symlinks on
          // Linux. Relocate only targets within this checkout for the local probe.
          const absolute = resolve(dirname(target), raw);
          const link = isAbsolute(raw) && absolute.startsWith(root + sep)
            ? inside(directory, relative(root, absolute)) : absolute;
          inside(directory, relative(directory, link));
          links.set(target, link);
        } else await pipeline(stream, createWriteStream(target));
      })().then(() => zip.readEntry(), fail);
    });
    zip.readEntry();
  });
  for (const [target, link] of links) await symlink(link, target, process.platform === 'win32' ? 'junction' : 'dir');
  if (bytes > 250 * 1024 * 1024) throw new Error('Netlify function exceeds the uncompressed Lambda size limit');
  return bytes;
}
try {
  const functions = await zipFunctions(resolve(root, settings.functions.directory), resolve(temporary, 'archives'), {
    basePath: root, repositoryRoot: root, config, archiveFormat: 'zip', parallelLimit: 1,
  });
  if (functions.find(fn => fn.name === 'verification-maintenance')?.schedule !== '*/5 * * * *') throw new Error('Maintenance schedule missing');
  for (const fn of functions) {
    const directory = resolve(temporary, fn.name);
    const bytes = await extract(fn.path, directory);
    const probe = resolve(directory, 'apps/web/netlify-probe.mjs');
    await writeFile(probe, `
import handler from './dist/netlify-functions/${fn.name}.mjs';
if (typeof handler !== 'function') throw new Error('Missing function handler');
${fn.name === 'verification-background' ? "await handler(new Request('https://example.invalid', { method: 'POST', body: '{}' }));" : ''}
import { createRequire } from 'node:module';
import { readFile, copyFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
const require = createRequire(import.meta.url);
const sdk = await import('@zama-fhe/relayer-sdk/node');
if (typeof sdk.createInstance !== 'function') throw new Error('SDK import failed');
const pg = await import('pg');
if (typeof pg.Pool !== 'function') throw new Error('Postgres import failed');
const mupdf = await import('mupdf');
const doc = mupdf.Document.openDocument(await readFile(process.argv[2]), 'application/pdf');
const png = doc.loadPage(0).toPixmap(mupdf.Matrix.scale(200 / 72, 200 / 72), mupdf.ColorSpace.DeviceRGB, false).asPNG().slice();
const zxing = await import('zxing-wasm/reader');
const wasm = await readFile(require.resolve('zxing-wasm/reader/zxing_reader.wasm'));
await zxing.prepareZXingModule({ overrides: { wasmBinary: wasm }, fireImmediately: true });
const [qr] = await zxing.readBarcodes(png, { formats: ['QRCode'] });
if (qr?.text !== 'http://localhost:3000/c/0x${'12'.repeat(32)}') throw new Error('QR probe failed');
const langPath = resolve('tessdata'); await mkdir(langPath);
for (const code of ['ind', 'eng']) {
  const data = require('@tesseract.js-data/' + code);
  await copyFile(join(data.langPath, code + '.traineddata.gz'), join(langPath, code + '.traineddata.gz'));
}
const { default: Tesseract } = await import('tesseract.js');
const worker = await Tesseract.createWorker('ind+eng', 1, { langPath, cacheMethod: 'none', logger() {}, errorHandler() {} });
try {
  const { data } = await worker.recognize(Buffer.from(png));
  if (!data.text.includes('ANDI PRATAMA')) throw new Error('OCR probe failed');
} finally { await worker.terminate(); }
${fn.name === 'verification-background' ? `
// Exercise the actual packaged pipeline with private filesystem storage in demo
// mode. It must read the fixture and stop before any blockchain transaction.
const id = '0x' + 'ab'.repeat(32); const generation = 'c'.repeat(64);
const bytes = await readFile(process.argv[2]);
const expiresAt = new Date(Date.now() + 86400_000).toISOString();
const job = { id, owner: 'probe', idempotencyKey: 'netlify-probe-123456', status: 'RECEIVED',
  fileName: 'fixture.pdf', fileSize: bytes.length, mimeType: 'application/pdf', mode: 'demo', synthetic: false,
  createdAt: new Date().toISOString(), expiresAt, artifactsExpireAt: expiresAt, attempts: 0,
  workflowToken: generation, digest: '0x' + createHash('sha256').update(bytes).digest('hex'),
  expectedCredentialId: '0x' + '12'.repeat(32) };
const dataDir = process.env.PRIVATE_DATA_DIR;
await mkdir(join(dataDir, 'jobs', id), { recursive: true });
await writeFile(join(dataDir, 'jobs', id, 'upload.bin'), bytes);
await writeFile(join(dataDir, 'state.json'), JSON.stringify({ jobs: { [id]: job }, sessions: {}, rates: {}, audit: [] }));
await handler(new Request('https://example.invalid', { method: 'POST', body: JSON.stringify({ id, generation }) }));
const state = JSON.parse(await readFile(join(dataDir, 'state.json'), 'utf8'));
if (!state.jobs[id].ocrConfigHash || state.jobs[id].status !== 'FAILED' || !state.jobs[id].reason.includes('konfigurasi Zama testnet')) throw new Error('Packaged pipeline did not complete real OCR in demo mode');
` : ''}
`);
    // No source checkout, no env file, no real DB/RPC/Blobs request.
    const result = spawnSync(process.execPath, [probe, resolve(root, 'packages/ocr/tests/fixtures/synthetic-A1.pdf')], {
      cwd: directory, env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '', APP_MODE: 'demo', APP_ORIGIN: 'http://localhost:3000',
        PRIVATE_DATA_DIR: resolve(directory, '.private-data'), DATABASE_URL: '', VERCEL: '', NETLIFY: '', SITE_ID: '', URL: '',
        STORAGE_PROVIDER: '', BLOB_READ_WRITE_TOKEN: '', S3_BUCKET: '' }, encoding: 'utf8', timeout: 120_000,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Isolated ${fn.name} probe failed: ${result.stderr.slice(0, 2500)}`);
    console.log(`${fn.name}: packaged handler, SDK, database driver, QR and OCR passed (${Math.ceil(bytes / 1048576)} MiB).`);
  }
} finally {
  const suffix = relative(resolve(tmpdir()), temporary);
  if (!suffix.startsWith('verifikasi-netlify-') || suffix.includes('/') || suffix.includes('\\')) throw new Error('Unsafe test cleanup path');
  await rm(temporary, { recursive: true, force: true });
}
