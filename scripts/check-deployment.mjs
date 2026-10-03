import { readFile, stat, lstat, realpath, mkdir, copyFile, mkdtemp, symlink, writeFile, rm } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

// Fail a build that would work locally only because the whole monorepo is present.
const root = resolve(import.meta.dirname, '..');
const trace = resolve(root, 'apps/web/.next/server/app/.well-known/workflow/v1/step/route.js.nft.json');
const { files } = JSON.parse(await readFile(trace, 'utf8'));
const normalized = files.map(file => file.replaceAll('\\', '/'));
const diplomaTrace = resolve(root, 'apps/web/.next/server/app/api/credentials/[id]/document/route.js.nft.json');
const diplomaFiles = JSON.parse(await readFile(diplomaTrace, 'utf8')).files;
if (!diplomaFiles.some(file => file.replaceAll('\\', '/').endsWith('/src/server/assets/NotoSans-Regular.ttf'))) throw new Error('Diploma route is missing its embedded font');
const fontFile = diplomaFiles.find(file => file.replaceAll('\\', '/').endsWith('/src/server/assets/NotoSans-Regular.ttf'));
if ((await stat(resolve(dirname(diplomaTrace), fontFile))).size < 100_000) throw new Error('Diploma font is incomplete');
for (const [name, pattern] of [
  ['Zama Node SDK', /@zama-fhe\/relayer-sdk\/lib\/node\.(cjs|js)$/],
  ['TFHE WASM', /node-tfhe\/.*\.wasm$/],
  ['TKMS WASM', /node-tkms\/.*\.wasm$/],
  ['PostgreSQL driver', /pg\/lib\/index\.js$/],
  ['tesseract.js worker script', /tesseract\.js\/src\/worker-script\/node\/index\.js$/],
  ['Tesseract core WASM', /tesseract\.js-core\/tesseract-core[\w-]*\.wasm$/],
  ['MuPDF WASM', /mupdf\/dist\/mupdf-wasm\.wasm$/],
  ['zxing reader WASM', /zxing-wasm\/dist\/reader\/zxing_reader\.wasm$/],
  ['Indonesian OCR data', /@tesseract\.js-data\/ind\/4\.0\.0\/ind\.traineddata\.gz$/],
  ['English OCR data', /@tesseract\.js-data\/eng\/4\.0\.0\/eng\.traineddata\.gz$/],
]) {
  if (!normalized.some(file => pattern.test(file))) throw new Error(`Deployment trace is missing ${name}`);
}
let bytes = 0;
let hasExternalNodeSdkImport = false;
const sources = new Set([...files.map(file => resolve(dirname(trace), file)), trace.replace(/\.nft\.json$/, '')]);
for (const source of sources) {
  const info = await stat(source);
  if (info.isFile()) bytes += info.size;
  if (source.includes(`${join('.next', 'server')}`) && source.endsWith('.js')) {
    const code = await readFile(source, 'utf8');
    // Workflow can put the step's SDK import in a traced dynamic server chunk.
    hasExternalNodeSdkImport ||= /(?:import|require)\(["']@zama-fhe\/relayer-sdk\/node["']\)/.test(code);
    if (/(?:join|resolve)\(__dirname,\s*["'](?:tfhe_bg|kms_lib_bg)\.wasm["']/.test(code)) {
      throw new Error('Node WASM engine was bundled into a Next chunk; keep the Node SDK external');
    }
  }
}
if (!hasExternalNodeSdkImport) {
  throw new Error('Workflow step does not preserve the external Node SDK import');
}

// Reconstruct only traced files outside the repository so Node cannot silently
// fall back to workspace node_modules. Preserve pnpm's relative dependency links.
const temporaryRoot = await mkdtemp(join(tmpdir(), 'verifikasi-deployment-'));
const localPath = source => {
  const suffix = relative(root, source);
  if (suffix.startsWith('..') || isAbsolute(suffix)) throw new Error('Trace escaped the monorepo');
  return resolve(temporaryRoot, suffix);
};
const aliases = new Map();
const inspected = new Set();
const copied = new Set();
try {
  for (const source of sources) {
    let ancestor = source;
    while (ancestor !== root) {
      localPath(ancestor); // Validate every ancestor before inspecting it.
      if (inspected.has(ancestor)) break;
      inspected.add(ancestor);
      const info = await lstat(ancestor);
      if (info.isSymbolicLink()) {
        const target = await realpath(ancestor);
        aliases.set(ancestor, { target, directory: (await stat(ancestor)).isDirectory() });
      }
      ancestor = dirname(ancestor);
    }
    const canonical = await realpath(source);
    if ((await stat(canonical)).isFile() && !copied.has(canonical)) {
      const destination = localPath(canonical);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(canonical, destination);
      copied.add(canonical);
    }
  }
  for (const [source, { target, directory }] of [...aliases].sort((a, b) => a[0].length - b[0].length)) {
    const destination = localPath(source);
    const resolvedTarget = localPath(target);
    await mkdir(dirname(destination), { recursive: true });
    try {
      await symlink(process.platform === 'win32' ? resolvedTarget : relative(dirname(destination), resolvedTarget), destination,
        directory ? (process.platform === 'win32' ? 'junction' : 'dir') : 'file');
    } catch (error) {
      if (error.code !== 'EEXIST' || await realpath(destination) !== resolvedTarget) throw error;
    }
  }
  const probe = resolve(temporaryRoot, 'apps/web/.next/server/sdk-smoke.mjs');
  await mkdir(dirname(probe), { recursive: true });
  await writeFile(probe, `const sdk = await import('@zama-fhe/relayer-sdk/node');
if (typeof sdk.createInstance !== 'function') throw new Error('Node SDK did not initialize');
const pg = await import('pg');
if (typeof (pg.Pool || pg.default?.Pool) !== 'function') throw new Error('PostgreSQL driver did not initialize');
console.log('Traced Node SDK imports with TFHE/TKMS WASM; PostgreSQL driver imports successfully.');
`);
  const result = spawnSync(process.execPath, [probe], {
    cwd: temporaryRoot, env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' }, encoding: 'utf8', timeout: 30_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Isolated SDK import failed: ${result.stderr}`);
  process.stdout.write(result.stdout);

  // @verifikasi/ocr resolves zxing's WASM and the language data from the app directory at
  // runtime, as a Vercel function does. Run the same resolution against the traced copy.
  const ocrProbe = resolve(temporaryRoot, 'apps/web/.next/server/ocr-smoke.mjs');
  await writeFile(ocrProbe, `import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const appRequire = createRequire(join(process.cwd(), 'noop.js'));
const mupdf = await import('mupdf');
const doc = mupdf.Document.openDocument(await readFile(process.argv[2]), 'application/pdf');
const png = doc.loadPage(0).toPixmap(mupdf.Matrix.scale(200 / 72, 200 / 72), mupdf.ColorSpace.DeviceRGB, false).asPNG().slice();
const zxing = await import('zxing-wasm/reader');
const wasm = await readFile(appRequire.resolve('zxing-wasm/reader/zxing_reader.wasm'));
await zxing.prepareZXingModule({ overrides: { wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) }, fireImmediately: true });
const [qr] = await zxing.readBarcodes(png, { formats: ['QRCode'] });
if (qr?.text !== 'http://localhost:3000/c/0x${'12'.repeat(32)}') throw new Error('Traced zxing WASM did not read the fixture QR');
const langPath = await mkdtemp(join(tmpdir(), 'verifikasi-ocr-probe-'));
try {
  for (const code of ['ind', 'eng']) {
    const data = appRequire('@tesseract.js-data/' + code);
    await copyFile(join(data.langPath, code + '.traineddata.gz'), join(langPath, code + '.traineddata.gz'));
  }
  const { default: Tesseract } = await import('tesseract.js');
  const worker = await Tesseract.createWorker('ind+eng', 1, { langPath, cacheMethod: 'none', logger() {}, errorHandler() {} });
  const { data } = await worker.recognize(Buffer.from(png));
  await worker.terminate();
  if (!data.text.includes('ANDI PRATAMA')) throw new Error('Traced tesseract.js did not read the fixture text');
} finally {
  await rm(langPath, { recursive: true, force: true });
}
console.log('Traced OCR engines (MuPDF, zxing, tesseract.js ind+eng) read the synthetic fixture from the app directory.');
`);
  const ocr = spawnSync(process.execPath, [ocrProbe, resolve(root, 'packages/ocr/tests/fixtures/synthetic-A1.pdf')], {
    cwd: resolve(temporaryRoot, 'apps/web'), env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' }, encoding: 'utf8', timeout: 120_000,
  });
  if (ocr.error) throw ocr.error;
  if (ocr.status !== 0) throw new Error(`Isolated OCR probe failed: ${ocr.stderr.slice(0, 2000)}`);
  process.stdout.write(ocr.stdout);
} finally {
  const suffix = relative(resolve(tmpdir()), temporaryRoot);
  if (!suffix.startsWith('verifikasi-deployment-') || suffix.includes('/') || suffix.includes('\\')) throw new Error('Unsafe deployment test cleanup path');
  await rm(temporaryRoot, { recursive: true, force: true });
}
console.log(`Deployment trace includes Node SDK, both WASM engines, PostgreSQL and OCR engines with ind+eng data (${Math.ceil(bytes / 1048576)} MiB before platform packaging).`);
