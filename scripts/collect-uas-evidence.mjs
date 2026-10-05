import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { parseEnv } from 'node:util';
import { pathToFileURL } from 'node:url';
import { localDatabase, makeRedactor, saveJson } from './run-uas-checks.mjs';

// Collect already completed synthetic UI transactions. No signer is connected to
// the provider; the existing reader signs only an off-chain decryption request.
const root = path.resolve(import.meta.dirname, '..');
const CHAIN_ID = 11155111;
const FIELD_KEYS = ['full_name', 'diploma_number', 'study_program', 'graduation_date'];
const JOB_KEYS = ['id', 'status', 'decision', 'reason', 'createdAt', 'expiresAt', 'artifactsExpireAt',
  'credentialId', 'expectedCredentialId', 'digest', 'commitment', 'fileName', 'fileSize', 'mimeType',
  'mode', 'synthetic', 'checkedAt', 'checkedBlock', 'chainId', 'contractAddress', 'txHash', 'txBroadcasted',
  'ocrConfigHash', 'ocrConfigVersion', 'verifiedPage', 'attempts', 'diagnosticCode', 'issuanceTxHash', 'recordVerificationStatus'];
const publicValue = value => typeof value === 'bigint' ? String(value)
  : Array.isArray(value) ? value.map(publicValue) : value;
const sha256 = value => createHash('sha256').update(value).digest('hex');
const fail = code => { throw Object.assign(new Error(code), { collectorCode: code }); };
const hex32 = value => {
  if (typeof value !== 'string' || !/^0x[a-f\d]{64}$/i.test(value)) fail('INVALID_PUBLIC_ID');
  return value.toLowerCase();
};
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const within = (directory, target) => {
  const relative = path.relative(directory, target);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep));
};

function argumentsForCollector(argv) {
  const options = { decrypt: false, plan: false };
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--decrypt') options.decrypt = true;
    else if (argv[index] === '--plan') options.plan = true;
    else if (argv[index] === '--help' || argv[index] === '-h') options.help = true;
    else if (argv[index] === '--evidence-dir' && !options.evidenceDir && argv[index + 1] && !argv[index + 1].startsWith('--')) {
      options.evidenceDir = path.resolve(root, argv[++index]);
    } else fail('INVALID_ARGUMENTS');
  }
  if (!options.help && (!options.evidenceDir || !within(path.join(root, 'docs/uas/evidence'), options.evidenceDir))) fail('EVIDENCE_DIRECTORY_REQUIRED');
  return options;
}

function qrSummary(value, runOrigin) {
  if (typeof value !== 'string') return { validUrl: false };
  try {
    const url = new URL(value);
    const match = url.pathname.match(/^\/c\/(0x[a-f\d]{64})$/i);
    return { validUrl: true, sameOriginAsRun: url.origin === runOrigin, supportedPath: Boolean(match),
      credentialId: match ? hex32(match[1]) : null, hasQueryOrFragment: Boolean(url.search || url.hash) };
  } catch { return { validUrl: false }; }
}

async function readOcr(privateDir, requestId, runOrigin) {
  let bytes;
  try { bytes = await readFile(path.join(privateDir, 'jobs', hex32(requestId), 'ocr.json')); }
  catch (error) { if (error.code === 'ENOENT') return { available: false }; throw error; }
  const original = JSON.parse(bytes.toString('utf8'));
  const fields = Object.fromEntries(FIELD_KEYS.filter(key => original.fields?.[key]).map(key => {
    const field = original.fields[key];
    return [key, { text: typeof field.text === 'string' ? field.text : null,
      confidence: typeof field.confidence === 'number' && Number.isFinite(field.confidence) ? field.confidence : null,
      page: Number.isInteger(field.page) ? field.page : null,
      ...(Array.isArray(field.candidates) ? { candidates: field.candidates.filter(value => typeof value === 'string') } : {}) }];
  }));
  return { available: true, sourceArtifactSha256: sha256(bytes), fields,
    qrCandidates: Array.isArray(original.qrCandidates) ? original.qrCandidates.map(value => qrSummary(value, runOrigin)) : [],
    ...(Number.isInteger(original.qrPage) ? { qrPage: original.qrPage } : {}),
    ...Object.fromEntries(['templateId', 'dateFormat', 'ocrConfigHash', 'ocrConfigVersion', 'errorCode']
      .filter(key => typeof original[key] === 'string').map(key => [key, original[key]])) };
}

async function main() {
  const options = argumentsForCollector(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: node scripts/collect-uas-evidence.mjs --evidence-dir docs/uas/evidence/.../qa/sepolia-run [--decrypt] [--plan]\nReads active contract, local PostgreSQL, PRIVATE_DATA_DIR and existing RESULT_READER_PRIVATE_KEY only from root .env. Collects existing receipts/events/state and optional authorized Zama booleans; never broadcasts transactions or reads an external wallet file. --plan validates local inputs without DB/RPC requests, signing or evidence writes.');
    return;
  }
  let redact = value => String(value);
  const emit = value => process.stdout.write(redact(JSON.stringify(value)) + '\n');
  const write = (name, value) => saveJson(path.join(options.evidenceDir, name), publicValue(value), redact);
  const startedAtUtc = new Date().toISOString();
  let provider; let pool; let client; let stage = 'CONFIGURATION'; let databaseFailed = false;
  // SDK/provider diagnostics can include connection URLs and decryption payloads.
  for (const method of ['log', 'warn', 'error', 'info', 'debug']) console[method] = () => {};
  try {
    const configured = parseEnv(await readFile(path.join(root, '.env'), 'utf8'));
    const entries = [...Object.entries(process.env), ...Object.entries(configured)];
    for (const [name, value] of Object.entries(configured)) {
      if (/URL|ORIGIN|MNEMONIC|PASSPHRASE/i.test(name)) entries.push(['SECRET_CONFIG_' + name, value]);
    }
    redact = makeRedactor(entries);
    if (Number(configured.CHAIN_ID || CHAIN_ID) !== CHAIN_ID) fail('SEPOLIA_REQUIRED');
    const databaseUrl = localDatabase(configured.DATABASE_URL, 'DATABASE_URL');
    let rpcUrl;
    try { rpcUrl = new URL(configured.RPC_URL); } catch { fail('RPC_URL_REQUIRED'); }
    if (!['http:', 'https:'].includes(rpcUrl.protocol)) fail('RPC_URL_REQUIRED');
    const privateDir = path.resolve(root, configured.PRIVATE_DATA_DIR || '');
    if (!configured.PRIVATE_DATA_DIR || !within(path.join(root, '.private-data'), privateDir)) fail('LOCAL_PRIVATE_DATA_DIRECTORY_REQUIRED');
    const confirmations = Math.max(2, Number(configured.CHAIN_CONFIRMATIONS || 2));
    const deploymentBlock = Number(configured.CONTRACT_DEPLOYMENT_BLOCK);
    if (!Number.isSafeInteger(confirmations) || !Number.isSafeInteger(deploymentBlock) || deploymentBlock <= 0) fail('INVALID_CHAIN_CONFIGURATION');
    const chainRequire = createRequire(path.join(root, 'packages/chain/package.json'));
    const webRequire = createRequire(path.join(root, 'apps/web/package.json'));
    const { Contract, Interface, JsonRpcProvider, FetchRequest, Wallet, getAddress, id } = chainRequire('ethers');
    const { Pool } = webRequire('pg');
    const address = getAddress(configured.CREDENTIAL_CONTRACT_ADDRESS || '');
    if (/^0x0{40}$/i.test(address)) fail('ACTIVE_CONTRACT_REQUIRED');
    if (!/^(?:0x)?[a-f\d]{64}$/i.test(configured.RESULT_READER_PRIVATE_KEY || '')) fail('EXISTING_ROOT_READER_REQUIRED');
    const reader = new Wallet(configured.RESULT_READER_PRIVATE_KEY.startsWith('0x')
      ? configured.RESULT_READER_PRIVATE_KEY : '0x' + configured.RESULT_READER_PRIVATE_KEY);
    const artifact = JSON.parse(await readFile(path.join(root, 'contracts/generated/VerifikasiIjazah.json'), 'utf8'));
    const iface = new Interface(artifact.abi);
    if (options.plan) {
      emit({ stage: 'collection-plan', readOnly: true, activeContract: address, chainId: CHAIN_ID, deploymentBlock,
        minimumConfirmations: confirmations, readerAddress: reader.address, rootEnvironmentOnly: true,
        runtimeDatabaseLocal: true, configuredPrivateDirectoryLocal: true, decryptRequested: options.decrypt,
        submittedTransactions: 0, networkRequests: 0, evidenceWrites: 0 });
      return;
    }
    const evidence = JSON.parse(await readFile(path.join(options.evidenceDir, 'sepolia-e2e-evidence.json'), 'utf8'));
    const context = JSON.parse(await readFile(path.join(options.evidenceDir, 'execution-context.json'), 'utf8'));
    if (evidence.chainId !== CHAIN_ID || !Array.isArray(evidence.steps) || !Array.isArray(evidence.transactionsSentByBrowserWallet)) fail('INVALID_UI_EVIDENCE');
    if (!same(context.environment?.activeContract, address) || context.environment?.deploymentBlock !== deploymentBlock) fail('RUN_ACTIVE_CONTRACT_MISMATCH');
    if (context.exitCode !== 0 || !evidence.steps.some(step => step.step === 'finished')) fail('SUCCESSFUL_UI_RUN_REQUIRED');
    const provenance = { sourceCommit: context.sourceCommit, sourceFingerprint: context.sourceFingerprint,
      sourceSoliditySha256: sha256(await readFile(path.join(root, 'contracts/src/VerifikasiIjazah.sol'))),
      collectorSha256: sha256(await readFile(import.meta.filename)), chainId: CHAIN_ID, contractAddress: address };
    const request = new FetchRequest(configured.RPC_URL); request.timeout = 20_000;
    provider = new JsonRpcProvider(request, CHAIN_ID, { staticNetwork: true, batchMaxCount: 1 });
    const originalSend = provider.send.bind(provider);
    provider.send = (method, params) => {
      if (/^(?:eth_send|eth_sign|personal_|wallet_)/i.test(method)) fail('TRANSACTION_OR_SIGNING_RPC_FORBIDDEN');
      return originalSend(method, params);
    };
    if (BigInt(await provider.send('eth_chainId', [])) !== BigInt(CHAIN_ID) || await provider.getCode(address) === '0x') fail('NETWORK_TARGET_REJECTED');
    const contract = new Contract(address, artifact.abi, provider);
    if (!await contract.hasRole(id('RESULT_READER_ROLE'), reader.address)) fail('READER_ROLE_MISSING');
    const hashKeys = ['issuanceTx', 'revocationTx', 'comparisonTxHash', 'setIssuerTx', 'setSignerTx'];
    const hashes = [...new Set([...evidence.transactionsSentByBrowserWallet.map(tx => hex32(tx.hash)),
      ...evidence.steps.flatMap(step => hashKeys.filter(key => step[key]).map(key => hex32(step[key])))])];
    stage = 'RECEIPTS';
    const receipts = []; const receiptByHash = new Map();
    for (const txHash of hashes) {
      const receipt = await provider.getTransactionReceipt(txHash);
      if (!receipt || receipt.status !== 1 || !same(receipt.to, address)) fail('RECEIPT_REJECTED');
      const receiptConfirmations = await receipt.confirmations();
      if (receiptConfirmations < confirmations) fail('INSUFFICIENT_CONFIRMATIONS');
      const block = await provider.getBlock(receipt.blockNumber);
      if (!block) fail('RECEIPT_BLOCK_MISSING');
      const events = receipt.logs.filter(log => same(log.address, address)).flatMap(log => {
        let decoded; try { decoded = iface.parseLog(log); } catch { return []; }
        if (!decoded) return [];
        return [{ name: decoded.name, transactionHash: log.transactionHash, blockNumber: log.blockNumber, index: log.index,
          args: Object.fromEntries(decoded.fragment.inputs.map((field, index) => [field.name, publicValue(decoded.args[index])])) }];
      });
      const entry = { transactionHash: txHash, status: receipt.status, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash,
        blockTimestampUtc: new Date(block.timestamp * 1000).toISOString(), from: receipt.from, to: receipt.to,
        gasUsed: String(receipt.gasUsed), gasPrice: String(receipt.gasPrice), confirmations: receiptConfirmations, events };
      receipts.push(entry); receiptByHash.set(txHash, entry);
      emit({ stage: 'receipt-confirmed', txHash, blockNumber: receipt.blockNumber });
    }
    await write('receipts-events.json', { ...provenance, startedAtUtc, minimumConfirmations: confirmations, receipts });
    const checkedBlock = await provider.getBlockNumber() - (confirmations - 1);
    if (checkedBlock < deploymentBlock) fail('CONFIRMED_DEPLOYMENT_BLOCK_REQUIRED');
    const eventFor = (txHash, name, predicate) => receiptByHash.get(hex32(txHash))?.events.find(event => event.name === name && predicate(event.args));
    stage = 'CREDENTIAL_STATE';
    const state = [];
    for (const step of evidence.steps.filter(step => step.step?.startsWith('issue-'))) {
      const credentialId = hex32(step.credentialId);
      const event = eventFor(step.issuanceTx, 'CredentialIssued', args => same(args.credentialId, credentialId));
      if (!event || !same(event.args.issuerId, evidence.issuerId) || !same(event.args.signer, evidence.signer)) fail('ISSUANCE_EVENT_BINDING_REJECTED');
      const record = await contract.getCredential(credentialId, { blockTag: checkedBlock });
      if (!same(record.signer, event.args.signer) || !same(record.issuerId, event.args.issuerId)
        || !same(record.credentialDigest, event.args.credentialDigest)
        || BigInt(record.signerAuthorizationId) !== BigInt(event.args.signerAuthorizationId)
        || BigInt(record.issuedAt) !== BigInt(event.args.issuedAt)
        || BigInt(record.issuedBlock) !== BigInt(event.blockNumber)) fail('ISSUANCE_STATE_BINDING_REJECTED');
      state.push({ scenario: step.step, credentialId, issuanceTxHash: hex32(step.issuanceTx), bindingVerified: true,
        returnedFields: Object.fromEntries(iface.getFunction('getCredential').outputs[0].components.map((field, index) => [field.name, publicValue(record[index])])) });
    }
    for (const step of evidence.steps.filter(step => step.revocationTx)) {
      const event = eventFor(step.revocationTx, 'CredentialRevoked', args => same(args.credentialId, step.credentialId));
      const record = await contract.getCredential(hex32(step.credentialId), { blockTag: checkedBlock });
      if (!event || !same(record.issuerId, event.args.issuerId) || BigInt(record.revokedAt) === 0n
        || BigInt(record.revokedBlock) !== BigInt(event.blockNumber)
        || BigInt(record.revokedAt) !== BigInt(event.args.revokedAt)) fail('REVOCATION_BINDING_REJECTED');
      state.push({ scenario: step.step, credentialId: hex32(step.credentialId), revocationTxHash: hex32(step.revocationTx),
        revokedAt: String(record.revokedAt), revokedBlock: String(record.revokedBlock), bindingVerified: true });
    }
    await write('credential-state.json', { ...provenance, checkedBlock, state });
    stage = 'LOCAL_JOB_STORAGE';
    pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 5_000 });
    pool.on('error', () => { databaseFailed = true; });
    client = await pool.connect(); client.on('error', () => { databaseFailed = true; });
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '10s'");
    const requestSteps = evidence.steps.filter(step => step.requestId);
    const requestIds = [...new Set(requestSteps.map(step => hex32(step.requestId)))];
    // Project individual fields inside PostgreSQL. Sessions, owners, salts,
    // challenges, CSRF, outbox signatures and worker/lease tokens never leave DB.
    const projection = JOB_KEYS.flatMap(key => ["'" + key + "'", "j.value->'" + key + "'"]).join(', ');
    const { rows } = await client.query(`SELECT j.key AS request_id, jsonb_strip_nulls(jsonb_build_object(${projection})) AS job
      FROM verification_state s CROSS JOIN LATERAL jsonb_each(s.body->'jobs') j
      WHERE s.id = 1 AND j.key = ANY($1::text[])`, [requestIds]);
    const storedJobs = new Map(rows.map(row => [hex32(row.request_id), row.job]));
    const jobs = [];
    for (const step of requestSteps) {
      const requestId = hex32(step.requestId); const job = storedJobs.get(requestId);
      if (databaseFailed || !job || !same(job.id, requestId) || (step.credentialId && !same(job.credentialId, step.credentialId))
        || (job.txHash ? hex32(job.txHash) : null) !== (step.comparisonTxHash ? hex32(step.comparisonTxHash) : null)
        || job.decision !== step.decision || job.status !== step.status) fail('JOB_BINDING_REJECTED');
      if (job.contractAddress && !same(job.contractAddress, address)) fail('JOB_CONTRACT_MISMATCH');
      jobs.push({ scenario: step.step, job, extraction: await readOcr(privateDir, requestId, evidence.origin),
        returnedResultFields: Array.isArray(step.fields) ? step.fields.map(field => ({ key: field.key, status: field.status, confidence: field.confidence })) : [] });
    }
    await client.query('ROLLBACK'); client.release(); client = null;
    await write('job-ocr-policy.json', { ...provenance, readOnly: true,
      source: 'Whitelisted fields of run-owned PostgreSQL jobs and configured local OCR artifacts; no full DB body, owner/session/CSRF/salt/outbox/workflow/lease tokens.', jobs });
    stage = 'COMPARISON_STATE';
    const comparisons = [];
    for (const step of requestSteps.filter(step => step.comparisonTxHash)) {
      const job = storedJobs.get(hex32(step.requestId));
      const event = eventFor(step.comparisonTxHash, 'ComparisonRequested', args => same(args.requestId, step.requestId));
      if (!event || !same(event.args.credentialId, step.credentialId) || !same(event.args.uploadCommitment, job.commitment)
        || !same(event.args.resultReader, reader.address)) fail('COMPARISON_EVENT_BINDING_REJECTED');
      const comparison = await contract.getComparison(hex32(step.requestId), { blockTag: event.blockNumber });
      if (!same(comparison.credentialId, step.credentialId) || !same(comparison.uploadCommitment, job.commitment)
        || !same(comparison.resultReader, reader.address) || BigInt(comparison.comparedAt) === 0n
        || !await contract.requestUsed(hex32(step.requestId), { blockTag: checkedBlock })) fail('COMPARISON_STATE_BINDING_REJECTED');
      comparisons.push({ scenario: step.step, requestId: hex32(step.requestId), credentialId: hex32(step.credentialId),
        txHash: hex32(step.comparisonTxHash), resultReader: comparison.resultReader, uploadCommitment: comparison.uploadCommitment,
        comparedAt: String(comparison.comparedAt), fields: publicValue([...comparison.fields]), allMatchHandle: publicValue(comparison.allMatch),
        receiptBlock: event.blockNumber, bindingVerified: true });
    }
    await write('comparison-state.json', { ...provenance, checkedBlock, comparisons });
    stage = 'NO_COMPARISON_SCAN';
    const rejectedCases = [];
    for (const item of jobs.filter(item => !item.job.txHash)) {
      const requestId = hex32(item.job.id); const logs = [];
      for (let fromBlock = deploymentBlock; fromBlock <= checkedBlock; fromBlock += 2000) {
        logs.push(...await provider.getLogs({ address, fromBlock, toBlock: Math.min(fromBlock + 1999, checkedBlock),
          topics: [iface.getEvent('ComparisonRequested').topicHash, requestId] }));
      }
      const requestUsed = await contract.requestUsed(requestId, { blockTag: checkedBlock });
      const comparison = await contract.getComparison(requestId, { blockTag: checkedBlock });
      rejectedCases.push({ scenario: item.scenario, requestId, status: item.job.status, decision: item.job.decision, txHash: null,
        comparisonEventCount: logs.length, requestUsed, comparedAt: String(comparison.comparedAt),
        noComparisonVerified: logs.length === 0 && !requestUsed && BigInt(comparison.comparedAt) === 0n });
    }
    await write('no-comparison-event-scan.json', { ...provenance, fromBlock: deploymentBlock, toBlock: checkedBlock,
      method: 'Per-request indexed ComparisonRequested logs from active deployment through confirmed snapshot, plus requestUsed and getComparison state; no reliance on wallet popup absence.',
      rejectedCases, allRejectedHaveNoComparisonEvent: rejectedCases.every(item => item.noComparisonVerified) });
    if (rejectedCases.some(item => !item.noComparisonVerified)) fail('REJECTED_REQUEST_HAS_COMPARISON');
    const fixtures = [];
    for (const file of (await readdir(options.evidenceDir)).filter(file => file.endsWith('.pdf'))) {
      const bytes = await readFile(path.join(options.evidenceDir, file));
      fixtures.push({ file, bytes: bytes.length, sha256: sha256(bytes), synthetic: true });
    }
    await write('fixture-manifest.json', { fixtures, groundTruth: 'Synthetic credentials, intentional name alteration and QR substitution specified by the original sepolia.spec.ts run.' });
    stage = 'AUTHORIZED_DECRYPTION';
    const samples = [];
    if (options.decrypt) {
      if (!comparisons.length) fail('NO_COMPARISON_SAMPLES');
      const { createInstance, SepoliaConfig } = chainRequire('@zama-fhe/relayer-sdk/node');
      const started = performance.now();
      const instance = await createInstance({ ...SepoliaConfig, network: configured.RPC_URL });
      const sdkBootstrapSeconds = (performance.now() - started) / 1000;
      for (const comparison of comparisons) {
        const step = requestSteps.find(step => same(step.requestId, comparison.requestId));
        const handles = [...comparison.fields, comparison.allMatchHandle];
        // This ephemeral FHE transport keypair is not an Ethereum wallet/account.
        // It and the authorization signature remain only in memory.
        const pair = instance.generateKeypair(); const startTimestamp = Math.floor(Date.now() / 1000) - 60;
        const typed = instance.createEIP712(pair.publicKey, [address], startTimestamp, 1);
        const types = Object.fromEntries(Object.entries(typed.types).filter(([name]) => name !== 'EIP712Domain')
          .map(([name, fields]) => [name, fields.map(field => ({ ...field }))]));
        const signature = await reader.signTypedData(typed.domain, types, typed.message);
        const measuredAtUtc = new Date().toISOString(); const timer = performance.now();
        const decrypted = await instance.userDecrypt(handles.map(handle => ({ handle, contractAddress: address })),
          pair.privateKey, pair.publicKey, signature, [address], reader.address, startTimestamp, 1,
          { timeout: 60_000, signal: AbortSignal.timeout(60_000) });
        const values = handles.map(handle => { if (typeof decrypted[handle] !== 'boolean') fail('NON_BOOLEAN_RESULT'); return decrypted[handle]; });
        if (values[4] !== values.slice(0, 4).every(Boolean)) fail('INCONSISTENT_AGGREGATE_RESULT');
        if (!Array.isArray(step.fields) || step.fields.length !== FIELD_KEYS.length || new Set(step.fields.map(field => field.key)).size !== FIELD_KEYS.length
          || FIELD_KEYS.some((key, index) => !['MATCH', 'MISMATCH'].includes(step.fields.find(field => field.key === key)?.status)
            || (step.fields.find(field => field.key === key).status === 'MATCH') !== values[index])
          || !['MATCH', 'MISMATCH'].includes(step.decision) || (step.decision === 'MATCH') !== values[4]) fail('UI_RESULT_DIFFERS');
        samples.push({ scenario: comparison.scenario, requestId: comparison.requestId, credentialId: comparison.credentialId,
          txHash: comparison.txHash, readerAddress: reader.address, receiptBlock: comparison.receiptBlock, measuredAtUtc,
          completedAtUtc: new Date().toISOString(), sdkBootstrapSeconds, userDecryptSeconds: (performance.now() - timer) / 1000,
          fields: Object.fromEntries(FIELD_KEYS.map((key, index) => [key, values[index]])), allMatch: values[4],
          bindingVerified: true, originalUiFieldsAgree: true });
        await write('fhe-decryption-confirmation.json', { ...provenance,
          method: 'New read-only authorized Zama userDecrypt using the existing root .env reader; matched receipt, event, commitment and state; no broadcast or exported transport keys/signature.', samples });
        emit({ stage: 'decryption-confirmed', requestId: comparison.requestId, allMatch: values[4], originalUiFieldsAgree: true });
      }
    }
    await write('collector-context.json', { ...provenance, startedAtUtc, finishedAtUtc: new Date().toISOString(), readOnly: true,
      submittedTransactions: 0, walletKeysCreated: false, readerFromRootEnvironmentOnly: true, runtimeDatabaseLocal: true,
      transactionCount: receipts.length, credentialStateCount: state.length, jobCount: jobs.length, comparisonCount: comparisons.length,
      rejectedRequestCount: rejectedCases.length, followupDecryptionSamples: samples.length, exitCode: 0 });
    emit({ stage: 'collection-completed', transactionCount: receipts.length, jobCount: jobs.length, decryptionSamples: samples.length });
  } catch (error) {
    const category = error.collectorCode || (/^[A-Z][A-Z0-9_]{0,80}$/.test(error.code || '') ? error.code : 'COLLECTION_UNAVAILABLE');
    if (!options.plan) await write('collector-failure.json', { atUtc: new Date().toISOString(), stage, category, readOnly: true, submittedTransactions: 0 });
    emit({ stage: 'collection-failed', category }); process.exitCode = 1;
  } finally {
    if (client) { try { await client.query('ROLLBACK'); } catch { /* Connection failure already categorized. */ } client.release(); }
    if (pool) await pool.end();
    if (provider) provider.destroy();
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch(() => { process.stderr.write('UAS_EVIDENCE_COLLECTOR_FAILED: inspect sanitized stage evidence.\n'); process.exitCode = 1; });
}
