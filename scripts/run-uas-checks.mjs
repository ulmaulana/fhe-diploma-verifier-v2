import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { pathToFileURL } from 'node:url';

export const repositoryRoot = path.resolve(import.meta.dirname, '..');
/** Capture the launcher bytes when its module loads, before long-running checks can change files. */
export async function captureExecutingSource(file, role) {
  const bytes = await readFile(file);
  return { role, file: path.resolve(file), capturedAtUtc: new Date().toISOString(), bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex') };
}
export const executingChecksHelper = await captureExecutingSource(import.meta.filename, 'checks runner and shared helper');
const osKeys = /^(?:PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|TMPDIR|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|HOMEDRIVE|HOMEPATH|HOME|SHELL|LANG|LC_[A-Z_]+|TERM|CI|PNPM_HOME|HTTP_PROXY|HTTPS_PROXY|NO_PROXY|SSL_CERT_FILE|SSL_CERT_DIR|NODE_EXTRA_CA_CERTS)$/i;
const secretName = /PRIVATE_KEY|(?:^|_)KEY$|SECRET|TOKEN|PASSWORD|DATABASE.*URL|RPC_URL|ACCESS_KEY|PROXY$/i;
const stepsAvailable = ['lint', 'typecheck', 'test', 'build', 'db', 'e2e', 'coverage'];

export function argumentsForRun(argv, defaults = {}) {
  const options = { workspace: repositoryRoot, envFiles: [], port: '3000', steps: ['lint', 'typecheck', 'test', 'build', 'db', 'e2e'], plan: false, ...defaults };
  const names = { '--workspace': 'workspace', '--evidence-dir': 'evidenceDir', '--port': 'port', '--steps': 'steps' };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--plan') { options.plan = true; continue; }
    if (argument === '--help' || argument === '-h') { options.help = true; continue; }
    if (argument === '--env-file') {
      if (!argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error('ENV_FILE_ARGUMENT_REQUIRED');
      options.envFiles.push(path.resolve(argv[++index]));
      continue;
    }
    if (!names[argument] || !argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error('UNKNOWN_OR_INCOMPLETE_ARGUMENT');
    options[names[argument]] = argument === '--steps' ? argv[++index].split(',').filter(Boolean) : argv[++index];
  }
  options.workspace = path.resolve(options.workspace);
  if (!/^\d+$/.test(options.port) || Number(options.port) < 1024 || Number(options.port) > 65535) throw new Error('INVALID_LOCAL_PORT');
  if (!Array.isArray(options.steps) || !options.steps.length || options.steps.some(step => !stepsAvailable.includes(step))) throw new Error('INVALID_CHECK_STEPS');
  const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  options.evidenceDir = path.resolve(options.evidenceDir || path.join(repositoryRoot, 'docs/uas/evidence/pemenuhan-komponen/2026-10-05/qa', options.kind || 'local', runId));
  return options;
}

/** Explicit files override inherited variables; the last explicit file wins. No implicit production config. */
export async function loadRunEnvironment(options) {
  const configured = { ...process.env };
  const redactionEntries = Object.entries(configured);
  const shadowKeys = new Set();
  for (const file of options.envFiles) {
    let parsed;
    try { parsed = parseEnv(await readFile(file, 'utf8')); } catch { throw new Error('ENV_FILE_UNREADABLE'); }
    Object.assign(configured, parsed);
    redactionEntries.push(...Object.entries(parsed));
  }
  // run-web.mjs/Next.js can load dotenv files themselves. Blank disallowed keys so those files cannot
  // restore production RPC, storage credentials or database settings into an isolated child process.
  for (const directory of [options.workspace, path.join(options.workspace, 'apps/web')]) {
    const names = ['.env', '.env.local', '.env.production', '.env.production.local', '.env.development', '.env.development.local', '.env.test', '.env.test.local', '.env.example'];
    for (const name of names) {
      try {
        const parsed = parseEnv(await readFile(path.join(directory, name), 'utf8'));
        Object.keys(parsed).forEach(key => shadowKeys.add(key));
        redactionEntries.push(...Object.entries(parsed));
      } catch (error) { if (error.code !== 'ENOENT') throw new Error('DOTENV_SHADOW_CONFIGURATION_UNREADABLE'); }
    }
  }
  return { configured, shadowKeys, redact: makeRedactor(redactionEntries) };
}

export function makeRedactor(entries) {
  const secrets = new Set();
  for (const [key, value] of entries) {
    if (!secretName.test(key) || typeof value !== 'string' || !value) continue;
    if (value.length >= 6) secrets.add(value);
    if (/^(?:0x)?[a-f\d]{64}$/i.test(value)) {
      secrets.add(value.replace(/^0x/i, ''));
      secrets.add('0x' + value.replace(/^0x/i, ''));
    }
    try {
      const url = new URL(value);
      for (const part of [url.username, url.password, ...url.searchParams.values()]) if (part) {
        secrets.add(part);
        try { secrets.add(decodeURIComponent(part)); } catch { /* Keep the encoded form. */ }
      }
      if (/RPC_URL/i.test(key)) for (const part of url.pathname.split('/')) if (part.length >= 16) secrets.add(part);
    } catch { /* Not a URL. */ }
  }
  const escaped = [...secrets].sort((a, b) => b.length - a.length).map(value => value.replace(/[.*+?^{}()|[\]\\$]/g, '\\$&'));
  const pattern = escaped.length ? new RegExp(escaped.join('|'), 'gi') : null;
  return value => {
    const text = String(value).replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[REDACTED_DATABASE_CONNECTION]');
    return pattern ? text.replace(pattern, '[REDACTED_CONFIGURED_SECRET]') : text;
  };
}

export function isolatedEnvironment(inputs) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) if (osKeys.test(key) && value !== undefined) env[key] = value;
  for (const key of inputs.shadowKeys) if (!osKeys.test(key)) env[key] = '';
  // Also block hosting auto-detection and storage/proxy variables absent from the example dotenv file.
  for (const key of ['NETLIFY', 'SITE_ID', 'URL', 'VERCEL', 'STORAGE_PROVIDER', 'NODE_OPTIONS', 'SEPOLIA_E2E', 'SEPOLIA_E2E_ADMIN_KEY', 'SEPOLIA_E2E_SIGNER_KEY', 'SEPOLIA_E2E_LEGACY_ID', 'INSTITUTION_SIGNER_PRIVATE_KEY', 'TEST_DATABASE_URL']) env[key] = '';
  return { ...env, CI: '1', NO_COLOR: '1', TRUST_PROXY: 'false', STORAGE_PROVIDER: '',
    CHAIN_ID: '11155111', CHAIN_CONFIRMATIONS: '2', CONTRACT_DEPLOYMENT_BLOCK: '0',
    MAX_COMPARISONS_PER_HOUR: '30', DATABASE_POOL_MAX: '1' };
}

export function localDatabase(value, name) {
  if (!value) throw new Error(name + '_LOCAL_DATABASE_REQUIRED');
  let url;
  try { url = new URL(value); } catch { throw new Error(name + '_INVALID_DATABASE_URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    !url.pathname || url.pathname === '/' || /^(?:postgres|template0|template1)$/i.test(url.pathname.slice(1))) {
    throw new Error(name + '_DISPOSABLE_LOOPBACK_DATABASE_REQUIRED');
  }
  return value;
}

function gitOutput(workspace, args) {
  const result = spawnSync('git', args, { cwd: workspace, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) throw new Error('SOURCE_IDENTITY_GIT_READ_FAILED');
  return result.stdout;
}

export function executingHelperProvenance(runner, identity) {
  let launcherCommitReference = null;
  try { launcherCommitReference = gitOutput(repositoryRoot, ['rev-parse', 'HEAD']).trim(); } catch { /* A launcher can also run without git. */ }
  return {
    capturedAtUtc: new Date().toISOString(),
    method: 'Capture executing launcher/helper file bytes at module initialization, independently of the tested workspace inventory.',
    executingRunner: runner, sharedHelper: executingChecksHelper,
    launcherRepository: { directory: repositoryRoot, commitReference: launcherCommitReference,
      commitReferenceScope: 'Reference to launcher repository HEAD only; modified, untracked and snapshot files are established by their hashes, not this commit.' },
    testedWorkspace: { sourceCommit: identity.sourceCommit, sourceFingerprint: identity.sourceFingerprint, capturedAtUtc: identity.capturedAtUtc,
      identityFile: 'source-identity.json', scope: 'Preserved identity of the actual tested workspace, including modified and untracked application files.' },
  };
}

export async function sourceIdentity(workspace) {
  const paths = [];
  const ignored = /^(?:node_modules|\.next|\.private-data|\.data|\.workflow-data|coverage|cache|artifacts|fhevmTemp|test-results|playwright-report|dist)$/;
  async function inventory(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || ignored.test(entry.name) || entry.name.startsWith('.env') || /\.tsbuildinfo$/.test(entry.name)) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await inventory(file);
      else paths.push(path.relative(workspace, file).replaceAll('\\', '/'));
    }
  }
  for (const name of ['apps/web', 'packages', 'contracts', 'scripts']) await inventory(path.join(workspace, name));
  for (const name of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'eslint.config.mjs', 'netlify.toml']) {
    if (existsSync(path.join(workspace, name))) paths.push(name);
  }
  const selected = [...new Set(paths)].sort();
  const files = [];
  for (const file of selected) {
    const bytes = await readFile(path.join(workspace, file));
    files.push({ path: file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  let sourceCommit = null; let workingTree = [];
  try {
    const gitRoot = path.resolve(gitOutput(workspace, ['rev-parse', '--show-toplevel']).trim());
    sourceCommit = gitOutput(workspace, ['rev-parse', 'HEAD']).trim();
    if (gitRoot.toLowerCase() === path.resolve(workspace).toLowerCase()) {
      workingTree = gitOutput(workspace, ['status', '--porcelain=v1']).trim().split(/\r?\n/).filter(Boolean);
    }
  } catch { /* A standalone current-file snapshot intentionally has no .git directory. */ }
  return {
    capturedAtUtc: new Date().toISOString(), sourceCommit, workingTree,
    method: 'Hash actual current files, including untracked application files; never git archive HEAD.',
    sourceFingerprint: createHash('sha256').update(JSON.stringify(files)).digest('hex'), files,
  };
}

export async function saveJson(file, value, redact = text => text) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, redact(JSON.stringify(value, null, 2)) + '\n');
}

/** Run the pnpm Node entry point on Windows, avoiding cmd.exe interpolation of paths and arguments. */
export function pnpmInvocation(args) {
  if (process.platform !== 'win32') return { executable: 'pnpm', args };
  const directories = [...new Set([path.dirname(process.execPath), ...(process.env.PATH || '').split(path.delimiter).map(entry => entry.replace(/^"|"$/g, ''))])];
  for (const directory of directories) {
    for (const suffix of ['node_modules/pnpm/bin/pnpm.cjs', 'node_modules/corepack/dist/pnpm.js', 'pnpm.cjs']) {
      const candidate = path.join(directory, suffix);
      if (existsSync(candidate)) return { executable: process.execPath, args: [candidate, ...args] };
    }
    const binary = path.join(directory, 'pnpm.exe');
    if (existsSync(binary)) return { executable: binary, args };
  }
  throw new Error('PNPM_NODE_ENTRYPOINT_NOT_FOUND');
}

export async function runPnpm(options, inputs, name, args, env) {
  await mkdir(options.evidenceDir, { recursive: true });
  const logFile = path.join(options.evidenceDir, name + '.log');
  const log = createWriteStream(logFile);
  const invocation = pnpmInvocation(args);
  const startedAtUtc = new Date().toISOString();
  const start = Date.now();
  const child = spawn(invocation.executable, invocation.args, { cwd: options.workspace, env, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
  const emit = line => { const safe = inputs.redact(line); log.write(safe); process.stdout.write(safe); };
  const pending = new Map();
  for (const stream of [child.stdout, child.stderr]) {
    pending.set(stream, ''); stream.setEncoding('utf8');
    stream.on('data', chunk => {
      const text = pending.get(stream) + chunk;
      const lines = text.split('\n'); pending.set(stream, lines.pop());
      for (const line of lines) emit(line + '\n');
    });
  }
  const onSignal = () => child.kill('SIGTERM');
  process.once('SIGINT', onSignal); process.once('SIGTERM', onSignal);
  const result = await new Promise(resolve => {
    child.once('error', () => resolve({ exitCode: 127, signal: null }));
    child.once('close', (code, signal) => resolve({ exitCode: code ?? 1, signal }));
  });
  process.removeListener('SIGINT', onSignal); process.removeListener('SIGTERM', onSignal);
  for (const text of pending.values()) if (text) emit(text);
  await new Promise(resolve => log.end(resolve));
  const context = { command: ['pnpm', ...args], startedAtUtc, finishedAtUtc: new Date().toISOString(), durationSeconds: (Date.now() - start) / 1000, ...result, log: path.basename(logFile) };
  await saveJson(path.join(options.evidenceDir, name + '.json'), context, inputs.redact);
  return context;
}

export async function writePlaywrightConfig(options, privateDir, sepolia) {
  const require = createRequire(path.join(options.workspace, 'apps/web/package.json'));
  const config = {
    testDir: path.join(options.workspace, 'apps/web/tests/e2e'), testMatch: sepolia ? 'sepolia.spec.ts' : '*.spec.ts',
    workers: 1, fullyParallel: false, timeout: 60_000, globalTimeout: 2 * 60 * 60 * 1000,
    use: { baseURL: 'http://localhost:' + options.port, trace: 'off', screenshot: 'only-on-failure' },
    outputDir: path.join(privateDir, 'playwright-artifacts'),
    reporter: [['list'], ['json', { outputFile: path.join(privateDir, 'playwright-results.json') }]],
    webServer: { command: 'pnpm start', cwd: path.join(options.workspace, 'apps/web'), url: 'http://localhost:' + options.port + '/verifikasi',
      env: { PORT: options.port, APP_ORIGIN: 'http://localhost:' + options.port }, reuseExistingServer: false, timeout: 120_000 },
  };
  const file = path.join(options.evidenceDir, 'playwright.config.cjs');
  await mkdir(options.evidenceDir, { recursive: true });
  // A failed rerun must not publish a JSON report from an earlier invocation sharing this directory.
  for (const report of [path.join(privateDir, 'playwright-results.json'), path.join(options.evidenceDir, 'playwright-results.json')]) {
    try { await unlink(report); } catch (error) { if (error.code !== 'ENOENT') throw new Error('PREVIOUS_PLAYWRIGHT_REPORT_CLEAR_FAILED'); }
  }
  await writeFile(file, 'const { defineConfig } = require(' + JSON.stringify(require.resolve('@playwright/test')) + ');\nmodule.exports = defineConfig(' + JSON.stringify(config, null, 2) + ');\n');
  return file;
}

export async function publishPlaywrightReport(privateDir, evidenceDir, redact) {
  const file = path.join(privateDir, 'playwright-results.json');
  if (!existsSync(file)) return null;
  const raw = await readFile(file, 'utf8');
  const parsed = JSON.parse(raw);
  await writeFile(path.join(evidenceDir, 'playwright-results.json'), redact(raw));
  return parsed.stats;
}

export async function sanitizeEvidence(directory, redact) {
  let replacements = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) { replacements += await sanitizeEvidence(file, redact); continue; }
    if (!/\.(?:json|log|txt|md|cjs|ts|html)$/i.test(entry.name)) continue;
    const original = await readFile(file, 'utf8'); const safe = redact(original);
    if (safe !== original) { await writeFile(file, safe); replacements++; }
  }
  return replacements;
}

async function main() {
  const options = argumentsForRun(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: node scripts/run-uas-checks.mjs [--env-file FILE ...] [--workspace DIR] [--evidence-dir DIR] [--steps lint,typecheck,test,build,db,e2e,coverage] [--port 3000] [--plan]\nFiles override process variables in order. db/E2E require disposable localhost PostgreSQL. No migration or blockchain transaction command is included. Use the current workspace or a complete current-file snapshot.');
    return;
  }
  const inputs = await loadRunEnvironment(options);
  const env = isolatedEnvironment(inputs);
  const runId = path.basename(options.evidenceDir).replace(/[^a-zA-Z0-9_-]/g, '_');
  const privateDir = path.join(options.workspace, '.private-data/uas-checks', runId);
  Object.assign(env, { APP_MODE: 'demo', APP_ORIGIN: 'http://localhost:' + options.port, E2E_PORT: options.port, PORT: options.port, DATABASE_URL: '', DATABASE_MIGRATION_URL: '',
    PRIVATE_DATA_DIR: privateDir, RPC_URL: '', CREDENTIAL_CONTRACT_ADDRESS: '', LEGACY_CREDENTIAL_CONTRACTS: '', SEPOLIA_E2E: '0' });
  const blockers = [];
  if (options.steps.includes('db')) {
    try { env.TEST_DATABASE_URL = localDatabase(inputs.configured.TEST_DATABASE_URL || inputs.configured.DATABASE_URL, 'TEST_DATABASE_URL'); }
    catch (error) { blockers.push(error.message); }
  }
  if (options.steps.includes('e2e')) {
    try { env.DATABASE_URL = localDatabase(inputs.configured.DATABASE_URL, 'DATABASE_URL'); }
    catch (error) { blockers.push(error.message); }
  }
  const identity = await sourceIdentity(options.workspace);
  const provenance = executingHelperProvenance(executingChecksHelper, identity);
  const summary = { mode: options.plan ? 'plan' : 'checks', sourceCommit: identity.sourceCommit, sourceFingerprint: identity.sourceFingerprint,
    executingRunnerSha256: provenance.executingRunner.sha256, executingHelperSha256: provenance.sharedHelper.sha256,
    launcherCommitReference: provenance.launcherRepository.commitReference, executingHelperProvenance: 'executing-helper-provenance.json',
    steps: options.steps, envFileCount: options.envFiles.length, environment: { applicationMode: 'demo', runtimeDatabaseLocal: Boolean(env.DATABASE_URL),
      integrationDatabaseLocal: Boolean(env.TEST_DATABASE_URL), hostingCredentialsExcluded: true, blockchainKeysExcluded: true },
    blockers, commands: [], startedAtUtc: new Date().toISOString() };
  await saveJson(path.join(options.evidenceDir, 'source-identity.json'), identity, inputs.redact);
  await saveJson(path.join(options.evidenceDir, 'executing-helper-provenance.json'), provenance, inputs.redact);
  if (options.plan || blockers.length) {
    await saveJson(path.join(options.evidenceDir, 'run-summary.json'), summary, inputs.redact);
    console.log(JSON.stringify({ mode: summary.mode, steps: summary.steps, blockers, sourceFingerprint: identity.sourceFingerprint }));
    if (blockers.length && !options.plan) process.exitCode = 1;
    return;
  }
  const commands = { lint: ['lint'], typecheck: ['typecheck'], test: ['test'], build: ['build'], db: ['test:db'], coverage: ['coverage'] };
  for (const step of options.steps) {
    let args = commands[step];
    const stepEnv = { ...env };
    if (step !== 'e2e') stepEnv.DATABASE_URL = '';
    if (step !== 'db') stepEnv.TEST_DATABASE_URL = '';
    if (step === 'e2e') {
      const config = await writePlaywrightConfig(options, privateDir, false);
      args = ['--filter', '@verifikasi/web', 'exec', 'playwright', 'test', '--config', config];
    }
    const result = await runPnpm(options, inputs, step, args, stepEnv);
    if (step === 'e2e') result.stats = await publishPlaywrightReport(privateDir, options.evidenceDir, inputs.redact);
    summary.commands.push({ step, ...result });
    summary.finishedAtUtc = new Date().toISOString();
    summary.exitCode = result.exitCode;
    await saveJson(path.join(options.evidenceDir, 'run-summary.json'), summary, inputs.redact);
    if (result.exitCode !== 0) { process.exitCode = result.exitCode; break; }
  }
  summary.evidenceTextFilesRedacted = await sanitizeEvidence(options.evidenceDir, inputs.redact);
  await saveJson(path.join(options.evidenceDir, 'run-summary.json'), summary, inputs.redact);
  console.log(JSON.stringify({ mode: summary.mode, exitCode: summary.exitCode, completed: summary.commands.map(item => item.step) }));
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch(() => { console.error('UAS_CHECKS_RUNNER_FAILED: inspect configuration and sanitized stage evidence.'); process.exitCode = 1; });
}
