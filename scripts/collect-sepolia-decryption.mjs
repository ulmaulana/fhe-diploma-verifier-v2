import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { performance } from 'node:perf_hooks';

// Follow-up decryption of synthetic UI results. This script never prepares or
// broadcasts transactions. Runtime keys, commitments and ciphertext handles stay
// in memory; only validated public IDs, booleans and elapsed timers are exported.
const root = resolve(import.meta.dirname, '..');
const chainRequire = createRequire(resolve(root, 'packages/chain/package.json'));
const webRequire = createRequire(resolve(root, 'apps/web/package.json'));
const CHAIN_ID = 11155111;
const CONTRACT = '0x65b1C8C7B59D9651F8619F287Bc1c309FaE094e0';
const FIELD_KEYS = ['full_name', 'diploma_number', 'study_program', 'graduation_date'];
const TIMEOUT_MS = 60_000;
const TEST_COMMITS = {
  'e2e-run-2026-10-04T14-25-01-445Z': '018614f1f47ef4d7525c532cc2e8a7c8fbb350f5',
  'e2e-run-2026-10-04T14-37-04-887Z': '5ab6f099f10a7244775fc9b9adfff2c3a088b5b2',
};

// Third-party diagnostics can contain request details. Emit our own allowlisted
// status instead of SDK/provider logs or raw exceptions.
for (const method of ['log', 'warn', 'error', 'info', 'debug']) console[method] = () => {};
const emit = value => process.stdout.write(`${JSON.stringify(value)}\n`);
const fail = code => { throw Object.assign(new Error(code), { collectorCode: code }); };
const requireHex32 = value => {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value)) fail('INVALID_PUBLIC_ID');
  return value.toLowerCase();
};
const secondsSince = start => Number(((performance.now() - start) / 1000).toFixed(6));

function options(args) {
  const result = { evidenceFiles: [] };
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]; const value = args[index + 1];
    if (!value) fail('INVALID_ARGUMENTS');
    if (flag === '--runtime-env-file' && !result.envFile) result.envFile = resolve(value);
    else if (flag === '--evidence-file') result.evidenceFiles.push(resolve(value));
    else if (flag === '--output' && !result.output) result.output = resolve(value);
    else fail('INVALID_ARGUMENTS');
  }
  if (!result.envFile || !result.output || !result.evidenceFiles.length) fail('INVALID_ARGUMENTS');
  const outputRelative = relative(resolve(root, 'docs/uas/evidence'), result.output);
  if (!outputRelative || outputRelative.startsWith('..') || isAbsolute(outputRelative) || !result.output.endsWith('.json')) fail('OUTPUT_OUTSIDE_EVIDENCE');
  if (result.evidenceFiles.includes(result.output) || result.envFile === result.output) fail('OUTPUT_OVERWRITES_INPUT');
  return result;
}

function runtimeConfig(text) {
  const env = Object.fromEntries(text.split(/\r?\n/).map(line => line.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean)
    .map(match => [match[1], match[2].trim().replace(/^["']|["']$/g, '')]));
  if (env.APP_MODE !== 'testnet' || Number(env.CHAIN_ID || CHAIN_ID) !== CHAIN_ID || env.CREDENTIAL_CONTRACT_ADDRESS?.toLowerCase() !== CONTRACT.toLowerCase()) fail('RUNTIME_CONFIGURATION_REJECTED');
  let database; let rpc;
  try { database = new URL(env.DATABASE_URL); rpc = new URL(env.RPC_URL); }
  catch { fail('RUNTIME_CONFIGURATION_REJECTED'); }
  if (!['postgres:', 'postgresql:'].includes(database.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(database.hostname)
    || database.port !== '54329' || database.pathname !== '/verifikasi_local') fail('DATABASE_TARGET_REJECTED');
  if (!['http:', 'https:'].includes(rpc.protocol) || !/^(?:0x)?[0-9a-fA-F]{64}$/.test(env.RESULT_READER_PRIVATE_KEY || '')) fail('RUNTIME_CONFIGURATION_REJECTED');
  const confirmations = Math.max(2, Number(env.CHAIN_CONFIRMATIONS || 2));
  if (!Number.isSafeInteger(confirmations)) fail('RUNTIME_CONFIGURATION_REJECTED');
  return { env, confirmations };
}

async function inputRuns(files) {
  const runs = [];
  for (const file of files) {
    const evidence = JSON.parse(await readFile(file, 'utf8'));
    if (evidence.chainId !== CHAIN_ID || !Array.isArray(evidence.steps)) fail('INVALID_EVIDENCE');
    const runName = file.replaceAll('\\', '/').split('/').at(-2);
    let executionContext;
    try { executionContext = JSON.parse(await readFile(resolve(dirname(file), 'execution-context.json'), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') fail('INVALID_EXECUTION_CONTEXT'); }
    const sourceTestCommit = executionContext?.sourceCommit || TEST_COMMITS[runName] || evidence.sourceCommit;
    if (!/^[0-9a-f]{40}$/.test(sourceTestCommit || '')) fail('TEST_COMMIT_UNAVAILABLE');
    runs.push({ sourceEvidence: relative(root, file).replaceAll('\\', '/'), sourceTestCommit,
      completedMarker: evidence.steps.some(step => step.step === 'finished'), entries: evidence.steps.filter(step => step.comparisonTxHash) });
  }
  if (!runs.some(run => run.completedMarker)) fail('FINISHED_RUN_REQUIRED');
  return runs;
}

function checkExport(text, env) {
  for (const [name, raw] of Object.entries(env)) {
    if (!/KEY|SECRET|TOKEN|PASSWORD|DATABASE_URL|RPC_URL|MNEMONIC/.test(name) || /^NEXT_PUBLIC_/.test(name) || raw.length < 8) continue;
    const bare = raw.replace(/^0x/, '');
    if (text.includes(raw) || (bare.length >= 32 && text.includes(bare))) fail('SECRET_EXPORT_REJECTED');
  }
  if (/postgres(?:ql)?:\/\/|-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) fail('SECRET_EXPORT_REJECTED');
}

async function main() {
  const args = options(process.argv.slice(2));
  const { env, confirmations } = runtimeConfig(await readFile(args.envFile, 'utf8'));
  const runs = await inputRuns(args.evidenceFiles);
  const { Contract, Interface, JsonRpcProvider, Wallet, FetchRequest, getAddress, id } = chainRequire('ethers');
  const { createInstance, SepoliaConfig } = chainRequire('@zama-fhe/relayer-sdk/node');
  const { Pool } = webRequire('pg');
  const artifact = JSON.parse(await readFile(resolve(root, 'contracts/generated/VerifikasiIjazah.json'), 'utf8'));
  const iface = new Interface(artifact.abi);
  const request = new FetchRequest(env.RPC_URL); request.timeout = 20_000;
  const provider = new JsonRpcProvider(request, CHAIN_ID, { staticNetwork: true, batchMaxCount: 1 });
  const reader = new Wallet(env.RESULT_READER_PRIVATE_KEY.startsWith('0x') ? env.RESULT_READER_PRIVATE_KEY : `0x${env.RESULT_READER_PRIVATE_KEY}`);
  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 5_000 });
  let storageUnavailable = false;
  pool.on('error', () => { storageUnavailable = true; });
  // Reject accidental DML and cap the whitelisted lookup even if credentials have
  // broader rights in the disposable database.
  let client;
  try {
    if (BigInt(await provider.send('eth_chainId', [])) !== BigInt(CHAIN_ID) || await provider.getCode(CONTRACT) === '0x') fail('NETWORK_TARGET_REJECTED');
    const contract = new Contract(CONTRACT, artifact.abi, provider);
    if (!await contract.getFunction('hasRole')(id('RESULT_READER_ROLE'), reader.address)) fail('READER_ROLE_MISSING');
    client = await pool.connect();
    client.on('error', () => { storageUnavailable = true; });
    await client.query('SET default_transaction_read_only = on');
    await client.query("SET statement_timeout = '10s'");
    const collectorSHA256 = createHash('sha256').update(await readFile(import.meta.filename)).digest('hex');
    const samples = []; const seen = new Set();
    for (const run of runs) {
      for (const entry of run.entries) {
        if (storageUnavailable) fail('LOCAL_STORAGE_UNAVAILABLE');
        const requestId = requireHex32(entry.requestId); const credentialId = requireHex32(entry.credentialId);
        const txHash = requireHex32(entry.comparisonTxHash);
        if (seen.has(requestId)) continue;
        seen.add(requestId);
        const { rows } = await client.query("SELECT j.key AS id, j.value->>'credentialId' AS credential_id, j.value->>'commitment' AS commitment FROM verification_state s CROSS JOIN LATERAL jsonb_each(s.body->'jobs') j WHERE s.id=1 AND j.key=$1", [requestId]);
        if (rows.length !== 1 || requireHex32(rows[0].id) !== requestId || requireHex32(rows[0].credential_id) !== credentialId) fail('JOB_BINDING_REJECTED');
        const commitment = requireHex32(rows[0].commitment);
        const receipt = await provider.getTransactionReceipt(txHash);
        if (!receipt || receipt.status !== 1 || !receipt.to || getAddress(receipt.to) !== getAddress(CONTRACT)) fail('RECEIPT_REJECTED');
        const receiptConfirmations = await receipt.confirmations();
        if (receiptConfirmations < confirmations) fail('INSUFFICIENT_CONFIRMATIONS');
        const matchingEvent = receipt.logs.filter(log => getAddress(log.address) === getAddress(CONTRACT)).map(log => {
          try { return iface.parseLog(log); } catch { return null; }
        }).find(log => log?.name === 'ComparisonRequested' && requireHex32(log.args.requestId) === requestId);
        if (!matchingEvent || requireHex32(matchingEvent.args.credentialId) !== credentialId
          || requireHex32(matchingEvent.args.uploadCommitment) !== commitment || getAddress(matchingEvent.args.resultReader) !== reader.address) fail('EVENT_BINDING_REJECTED');
        const comparison = await contract.getFunction('getComparison')(requestId, { blockTag: receipt.blockNumber });
        if (requireHex32(comparison.credentialId) !== credentialId || requireHex32(comparison.uploadCommitment) !== commitment
          || getAddress(comparison.resultReader) !== reader.address) fail('COMPARISON_BINDING_REJECTED');
        const handles = [...comparison.fields, comparison.allMatch];
        const bootstrapStarted = performance.now();
        const instance = await createInstance({ ...SepoliaConfig, network: env.RPC_URL });
        const sdkBootstrapSeconds = secondsSince(bootstrapStarted);
        const keypair = instance.generateKeypair();
        const startTimestamp = Math.floor(Date.now() / 1000) - 60;
        const typed = instance.createEIP712(keypair.publicKey, [CONTRACT], startTimestamp, 1);
        const types = Object.fromEntries(Object.entries(typed.types).filter(([name]) => name !== 'EIP712Domain').map(([name, fields]) => [name, fields.map(field => ({ ...field }))]));
        const signature = await reader.signTypedData(typed.domain, types, typed.message);
        const measuredAtUtc = new Date().toISOString();
        const decryptStarted = performance.now();
        const decrypted = await instance.userDecrypt(handles.map(handle => ({ handle, contractAddress: CONTRACT })),
          keypair.privateKey, keypair.publicKey, signature, [CONTRACT], reader.address, startTimestamp, 1,
          { timeout: TIMEOUT_MS, signal: AbortSignal.timeout(TIMEOUT_MS) });
        const userDecryptSeconds = secondsSince(decryptStarted);
        const boolean = handle => { const value = decrypted[handle]; if (typeof value !== 'boolean') fail('NON_BOOLEAN_RESULT'); return value; };
        const fields = Object.fromEntries(FIELD_KEYS.map((field, index) => [field, boolean(handles[index])]));
        const allMatch = boolean(handles[4]);
        if (allMatch !== Object.values(fields).every(Boolean)) fail('INCONSISTENT_AGGREGATE_RESULT');
        if (!Array.isArray(entry.fields) || entry.fields.length !== FIELD_KEYS.length
          || new Set(entry.fields.map(field => field.key)).size !== FIELD_KEYS.length) fail('INVALID_UI_FIELDS');
        for (const field of entry.fields) {
          if (!FIELD_KEYS.includes(field.key) || !['MATCH', 'MISMATCH'].includes(field.status)
            || fields[field.key] !== (field.status === 'MATCH')) fail('UI_RESULT_DIFFERS');
        }
        if (['MATCH', 'MISMATCH'].includes(entry.decision) && allMatch !== (entry.decision === 'MATCH')) fail('UI_RESULT_DIFFERS');
        samples.push({ scenario: entry.step, sourceEvidence: run.sourceEvidence, sourceTestCommit: run.sourceTestCommit,
          requestId, credentialId, txHash, readerAddress: reader.address, receiptBlock: receipt.blockNumber,
          receiptConfirmations, minimumConfirmations: confirmations, originalUiDecision: entry.decision,
          measuredAtUtc, completedAtUtc: new Date().toISOString(), sdkBootstrapSeconds, userDecryptSeconds,
          fields, allMatch, bindingVerified: true, originalUiFieldsAgree: true, collectorSHA256 });
        emit({ stage: 'decryption-confirmed', requestId, allMatch, userDecryptSeconds });
      }
    }
    if (!samples.length) fail('NO_COMPARISON_SAMPLES');
    const output = { schemaVersion: 1, collectedAtUtc: new Date().toISOString(), chainId: CHAIN_ID, contractAddress: CONTRACT,
      evidenceLevel: 'Sepolia and real Zama authorized user decryption', collectorSHA256,
      method: { operation: 'Read-only follow-up userDecrypt of ciphertext comparison results created by the earlier UI runs; no transaction submission.',
        sdkBootstrapSeconds: 'Monotonic timer immediately around createInstance; includes SDK initialization/network metadata and key material retrieval.',
        userDecryptSeconds: 'Monotonic timer immediately before calling userDecrypt until its promise resolves; includes SDK ACL checks, Zama request/polling, and local result processing inside that call.',
        interpretation: 'These are new follow-up decryption samples, not the uninstrumented decryption duration during the original UI workflow. Previously computed ciphertext results and service caches can affect elapsed time.',
        bindings: 'Local guarded database job ID/credential/commitment matched against ComparisonRequested in its successful receipt and getComparison at that receipt block; authorized reader role checked and at least two confirmations required.',
        privacy: 'Only public identifiers, authorized result booleans and timers exported. No commitments, handles, generation tokens, reader keys or decryption proofs.' },
      sampleCount: samples.length, samples };
    const text = `${JSON.stringify(output, null, 2)}\n`; checkExport(text, env);
    await mkdir(dirname(args.output), { recursive: true }); await writeFile(args.output, text, { encoding: 'utf8', flag: 'wx' });
    emit({ stage: 'exported', file: relative(root, args.output).replaceAll('\\', '/'), samples: samples.length });
  } finally {
    client?.release(); await pool.end(); provider.destroy();
  }
}

main().catch(error => {
  // Intentionally exclude exception messages, URLs, stacks and SDK payloads.
  emit({ stage: 'failed', code: error?.collectorCode || 'COLLECTION_UNAVAILABLE' });
  process.exitCode = 1;
});
