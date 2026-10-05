import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { pathToFileURL } from 'node:url';
import {
  argumentsForRun, captureExecutingSource, executingHelperProvenance, isolatedEnvironment, loadRunEnvironment, localDatabase, publishPlaywrightReport,
  runPnpm, sanitizeEvidence, saveJson, sourceIdentity, writePlaywrightConfig,
} from './run-uas-checks.mjs';

const executingSepoliaRunner = await captureExecutingSource(import.meta.filename, 'Sepolia runner');

async function main() {
  const options = argumentsForRun(process.argv.slice(2), { kind: 'sepolia', port: '3030', steps: ['e2e'] });
  if (options.help) {
    console.log('Usage: node scripts/run-uas-sepolia.mjs --env-file .env --env-file LOCAL_DB_ENV --env-file SIGNER_ENV [--workspace DIR] [--evidence-dir DIR] [--port 3030] [--plan]\nLater files override earlier files/process variables. Uses the original Sepolia spec with admin AND signer and sends real testnet transactions when run without --plan. No migration/deployment, wallet generation, modified skip-admin harness or implicit external key file is used.');
    return;
  }
  const inputs = await loadRunEnvironment(options);
  const supplied = inputs.configured;
  // When the caller supplies the root .env, database/signer override files may not replace its
  // administrator or service wallets. Process-only runs can still supply their own test configuration.
  const primaryFile = options.envFiles.find(file => path.basename(file) === '.env');
  const primary = primaryFile ? parseEnv(await readFile(primaryFile, 'utf8')) : null;
  const env = isolatedEnvironment(inputs);
  const allow = ['RPC_URL', 'CHAIN_ID', 'CHAIN_CONFIRMATIONS', 'CREDENTIAL_CONTRACT_ADDRESS', 'CONTRACT_DEPLOYMENT_BLOCK', 'LEGACY_CREDENTIAL_CONTRACTS',
    'RELAYER_PRIVATE_KEY', 'ATTESTOR_PRIVATE_KEY', 'RESULT_READER_PRIVATE_KEY', 'DATABASE_POOL_MAX', 'MAX_COMPARISONS_PER_HOUR',
    'NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID', 'SEPOLIA_E2E_ISSUER_ID', 'SEPOLIA_E2E_ISSUER_NAME', 'SEPOLIA_E2E_LEGACY_ID'];
  for (const key of allow) env[key] = supplied[key] || '';
  for (const key of ['RELAYER_PRIVATE_KEY', 'ATTESTOR_PRIVATE_KEY', 'RESULT_READER_PRIVATE_KEY']) {
    if (primary) env[key] = primary[key] || '';
  }
  env.SEPOLIA_E2E_ADMIN_KEY = primary ? primary.DEPLOYER_PRIVATE_KEY || ''
    : supplied.SEPOLIA_E2E_ADMIN_KEY || supplied.DEPLOYER_PRIVATE_KEY || '';
  env.SEPOLIA_E2E_SIGNER_KEY = supplied.SEPOLIA_E2E_SIGNER_KEY || supplied.INSTITUTION_SIGNER_PRIVATE_KEY || '';
  const runId = path.basename(options.evidenceDir).replace(/[^a-zA-Z0-9_-]/g, '_');
  // Playwright artifacts belong to this run. Runtime archives may need to remain readable when the
  // main application later opens the same database, so honor an explicitly supplied local directory.
  const privateDir = path.join(options.workspace, '.private-data/uas-sepolia', runId);
  const suppliedPrivateDir = typeof supplied.PRIVATE_DATA_DIR === 'string' ? supplied.PRIVATE_DATA_DIR.trim() : '';
  const privateRuntimeDataPersistent = Boolean(suppliedPrivateDir);
  const invalidRuntimeDirectory = Boolean(suppliedPrivateDir && (
    /^(?:\\\\|\/\/)/.test(suppliedPrivateDir) ||
    (/^[a-z][a-z\d+.-]*:/i.test(suppliedPrivateDir) && !/^[a-z]:[\\/]/i.test(suppliedPrivateDir))
  ));
  const runtimePrivateDir = suppliedPrivateDir && !invalidRuntimeDirectory
    ? path.resolve(options.workspace, suppliedPrivateDir) : privateDir;
  Object.assign(env, { APP_MODE: 'testnet', APP_ORIGIN: 'http://localhost:' + options.port, E2E_PORT: options.port, PORT: options.port,
    PRIVATE_DATA_DIR: runtimePrivateDir, DATABASE_MIGRATION_URL: '', DEPLOYER_PRIVATE_KEY: '', INSTITUTION_SIGNER_PRIVATE_KEY: '', SEPOLIA_E2E: '1',
    SEPOLIA_E2E_EVIDENCE_DIR: options.evidenceDir, SEPOLIA_E2E_VIDEO: supplied.SEPOLIA_E2E_VIDEO ?? '1' });
  env.CHAIN_ID ||= '11155111'; env.CHAIN_CONFIRMATIONS ||= '2'; env.MAX_COMPARISONS_PER_HOUR ||= '30';
  const blockers = [];
  if (invalidRuntimeDirectory) blockers.push('PRIVATE_DATA_DIR_LOCAL_FILESYSTEM_REQUIRED');
  try { env.DATABASE_URL = localDatabase(supplied.DATABASE_URL, 'DATABASE_URL'); } catch (error) { blockers.push(error.message); }
  if (env.CHAIN_ID !== '11155111') blockers.push('SEPOLIA_CHAIN_REQUIRED');
  try { if (!['http:', 'https:'].includes(new URL(env.RPC_URL).protocol)) throw new Error(); } catch { blockers.push('RPC_URL_REQUIRED'); }
  if (!/^0x[a-f\d]{40}$/i.test(env.CREDENTIAL_CONTRACT_ADDRESS) || /^0x0{40}$/i.test(env.CREDENTIAL_CONTRACT_ADDRESS)) blockers.push('ACTIVE_CONTRACT_REQUIRED');
  if (!Number.isSafeInteger(Number(env.CONTRACT_DEPLOYMENT_BLOCK)) || Number(env.CONTRACT_DEPLOYMENT_BLOCK) <= 0) blockers.push('DEPLOYMENT_BLOCK_REQUIRED');
  const require = createRequire(path.join(options.workspace, 'apps/web/package.json'));
  const { Wallet } = require('ethers');
  const accounts = {};
  for (const [label, key] of [['admin', 'SEPOLIA_E2E_ADMIN_KEY'], ['signer', 'SEPOLIA_E2E_SIGNER_KEY'], ['relayer', 'RELAYER_PRIVATE_KEY'], ['attestor', 'ATTESTOR_PRIVATE_KEY'], ['reader', 'RESULT_READER_PRIVATE_KEY']]) {
    if (!env[key]) { blockers.push(key + '_MISSING'); continue; }
    try { env[key] = env[key].startsWith('0x') ? env[key] : '0x' + env[key]; accounts[label] = new Wallet(env[key]).address; }
    catch { blockers.push(key + '_INVALID'); }
  }
  if (Object.keys(accounts).length === 5 && new Set(Object.values(accounts)).size !== 5) blockers.push('FIVE_DISTINCT_ROLE_ADDRESSES_REQUIRED');
  // Explicit issuer ID avoids the original spec silently selecting a different institution on a rerun.
  if (!/^0x[a-f\d]{64}$/i.test(env.SEPOLIA_E2E_ISSUER_ID) || /^0x0{64}$/i.test(env.SEPOLIA_E2E_ISSUER_ID)) blockers.push('SEPOLIA_E2E_ISSUER_ID_REQUIRED');
  if (!env.SEPOLIA_E2E_ISSUER_NAME.trim()) blockers.push('SEPOLIA_E2E_ISSUER_NAME_REQUIRED');
  const spec = await readFile(path.join(options.workspace, 'apps/web/tests/e2e/sepolia.spec.ts'));
  const identity = await sourceIdentity(options.workspace);
  const provenance = executingHelperProvenance(executingSepoliaRunner, identity);
  const summary = { mode: options.plan ? 'plan' : 'sepolia', startedAtUtc: new Date().toISOString(), sourceCommit: identity.sourceCommit,
    sourceFingerprint: identity.sourceFingerprint, spec: 'apps/web/tests/e2e/sepolia.spec.ts', specSha256: createHash('sha256').update(spec).digest('hex'),
    executingRunnerSha256: provenance.executingRunner.sha256, executingHelperSha256: provenance.sharedHelper.sha256,
    launcherCommitReference: provenance.launcherRepository.commitReference, executingHelperProvenance: 'executing-helper-provenance.json',
    specMethod: 'Run the original current-workspace spec; all admin, signer and original assertions retained.',
    provider: 'Automated EIP-6963 provider; signing and real Sepolia transactions in Node, no manual extension wallet.',
    environment: { applicationMode: 'testnet', chainId: 11155111, activeContract: env.CREDENTIAL_CONTRACT_ADDRESS, deploymentBlock: Number(env.CONTRACT_DEPLOYMENT_BLOCK),
      issuerId: env.SEPOLIA_E2E_ISSUER_ID, accounts, runtimeDatabaseLocal: Boolean(env.DATABASE_URL),
      privateRuntimeDataPersistent: privateRuntimeDataPersistent && !invalidRuntimeDirectory,
      administratorAndServiceAccountsSource: primary ? 'explicit root .env' : 'explicit process/file configuration',
      envFileCount: options.envFiles.length, hostingCredentialsExcluded: true, legacyTestConfigured: Boolean(env.SEPOLIA_E2E_LEGACY_ID) },
    blockers };
  await mkdir(options.evidenceDir, { recursive: true });
  await saveJson(path.join(options.evidenceDir, 'source-identity.json'), identity, inputs.redact);
  await saveJson(path.join(options.evidenceDir, 'executing-helper-provenance.json'), provenance, inputs.redact);
  if (options.plan || blockers.length) {
    await saveJson(path.join(options.evidenceDir, 'execution-context.json'), summary, inputs.redact);
    console.log(JSON.stringify({ mode: summary.mode, blockers, accounts, privateRuntimeDataPersistent: summary.environment.privateRuntimeDataPersistent,
      sourceFingerprint: identity.sourceFingerprint }));
    if (blockers.length && !options.plan) process.exitCode = 1;
    return;
  }
  const config = await writePlaywrightConfig(options, privateDir, true);
  const result = await runPnpm(options, inputs, 'playwright', ['--filter', '@verifikasi/web', 'exec', 'playwright', 'test', '--config', config], env);
  Object.assign(summary, result, { stats: await publishPlaywrightReport(privateDir, options.evidenceDir, inputs.redact),
    evidenceTextFilesRedacted: await sanitizeEvidence(options.evidenceDir, inputs.redact) });
  await saveJson(path.join(options.evidenceDir, 'execution-context.json'), summary, inputs.redact);
  console.log(JSON.stringify({ mode: summary.mode, exitCode: result.exitCode, stats: summary.stats }));
  process.exitCode = result.exitCode;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch(() => { console.error('UAS_SEPOLIA_RUNNER_FAILED: inspect configuration and sanitized evidence.'); process.exitCode = 1; });
}
