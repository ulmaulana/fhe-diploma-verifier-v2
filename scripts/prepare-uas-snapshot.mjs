import {cp, mkdir, readdir, readFile, writeFile, stat} from 'node:fs/promises';
import {resolve, relative, join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';

// Validate the actual working tree, including local UI edits, without copying
// private configuration or overwriting the historical screenshots in the repo.
const root = resolve(import.meta.dirname, '..');
const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const target = resolve(tmpdir(), `uas-components-${stamp}`, 'repo');
const evidence = resolve(root, 'docs/uas/evidence/pemenuhan-komponen/2026-10-05');
const ignored = new Set(['node_modules', '.git', '.next', '.private-data', '.data', '.workflow-data',
  'artifacts', 'cache', 'fhevmTemp', 'coverage', 'test-results', 'playwright-report', 'dist']);
const filter = source => {
  const rel = relative(root, source).replaceAll('\\', '/');
  const parts = rel.split('/');
  const name = parts.at(-1);
  return !parts.some(part => ignored.has(part)) &&
    !(name.startsWith('.env') && name !== '.env.example') &&
    rel !== 'docs/uas/evidence' && !rel.startsWith('docs/uas/evidence/');
};
await mkdir(target, {recursive: true});
for (const name of ['apps', 'packages', 'contracts', 'scripts', 'assets', 'docs']) {
  await cp(join(root, name), join(target, name), {recursive: true, filter});
}
for (const name of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.gitignore',
  '.env.example', 'eslint.config.mjs', 'README.md', 'PRD.MD', 'CLAUDE.md', 'netlify.toml']) {
  await cp(join(root, name), join(target, name));
}
const files = [];
async function inventory(dir) {
  for (const item of await readdir(dir, {withFileTypes: true})) {
    const file = join(dir, item.name);
    if (item.isDirectory()) await inventory(file);
    else files.push({path: relative(target, file).replaceAll('\\', '/'),
      bytes: (await stat(file)).size, sha256: createHash('sha256').update(await readFile(file)).digest('hex')});
  }
}
await inventory(target);
files.sort((a, b) => a.path.localeCompare(b.path));
const identity = {createdAtUtc: new Date().toISOString(), workspace: root, snapshot: target,
  commit: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(),
  trackedChanges: execFileSync('git', ['status', '--short', '--untracked-files=no'], {cwd: root, encoding: 'utf8'}).trim(),
  includesWorkingTreeChanges: true, privateConfigurationCopied: false, files};
await mkdir(evidence, {recursive: true});
await writeFile(join(evidence, 'source-snapshot.json'), JSON.stringify(identity, null, 2) + '\n');
console.log(JSON.stringify({snapshot: target, evidence, files: files.length, privateConfigurationCopied: false}));
