import { build } from 'esbuild';
import { readFile, appendFile } from 'node:fs/promises';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, relative } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const web = resolve(root, 'apps/web');
const manifest = JSON.parse(await readFile(resolve(web, 'package.json'), 'utf8'));
const output = resolve(web, 'dist/netlify-functions');

// NFT can miss dynamic imports and the ESM dependency branch of the SDK. Include
// the complete runtime closure, including pnpm aliases, just as the Next build does.
const includedFiles = new Set(['../../package.json']);
const visited = new Set();
function include(path) { includedFiles.add(relative(output, path).replaceAll('\\', '/')); }
function visit(name, owner, optional = false) {
  const lookup = createRequire(resolve(owner, 'package.json'));
  const directory = lookup.resolve.paths(`${name}/package.json`)?.map(base => resolve(base, name))
    .find(candidate => existsSync(resolve(candidate, 'package.json')));
  if (!directory) {
    if (optional) return;
    throw new Error(`Missing Netlify runtime dependency: ${name}`);
  }
  include(directory); // preserve the pnpm symlink as well as its target
  const canonical = realpathSync(directory);
  if (visited.has(canonical)) return;
  visited.add(canonical);
  include(resolve(canonical, '**/*'));
  const pkg = JSON.parse(readFileSync(resolve(canonical, 'package.json'), 'utf8'));
  for (const dependency of Object.keys(pkg.dependencies || {})) visit(dependency, canonical);
  for (const dependency of Object.keys(pkg.optionalDependencies || {})) visit(dependency, canonical, true);
}
for (const name of ['pg', '@aws-sdk/client-s3', '@zama-fhe/relayer-sdk', 'tesseract.js', 'mupdf', 'zxing-wasm', '@tesseract.js-data/ind', '@tesseract.js-data/eng']) visit(name, web);

// Bundle workspace TypeScript before Netlify's V2 NFT pass. That pass treats
// package imports as external and cannot safely transpile TS package exports.
// npm packages remain external so WASM and worker paths keep their location.
await build({
  absWorkingDir: root,
  entryPoints: ['apps/web/src/functions/verification-background.mts', 'apps/web/src/functions/verification-maintenance.mts'],
  outdir: 'apps/web/dist/netlify-functions', outExtension: { '.js': '.mjs' },
  bundle: true, platform: 'node', format: 'esm', target: 'node22',
  external: Object.keys(manifest.dependencies).filter(name => !name.startsWith('@verifikasi/')),
  // next/server is a Next bundler alias; native Node ESM needs its file extension.
  plugins: [{ name: 'next-server-node-entry', setup(builder) {
    builder.onResolve({ filter: /^next\/server$/ }, () => ({ path: 'next/server.js', external: true }));
  } }],
  logLevel: 'warning',
});
for (const name of ['verification-background', 'verification-maintenance']) {
  const config = { includedFiles: [...includedFiles], ...(name.endsWith('-background') ? { background: true } : { schedule: '*/5 * * * *' }) };
  await appendFile(resolve(output, `${name}.mjs`), `\nconst netlifyFunctionConfig = ${JSON.stringify(config)};\nexport { netlifyFunctionConfig as config };\n`);
}
console.log('Netlify background and scheduled function entrypoints built.');
