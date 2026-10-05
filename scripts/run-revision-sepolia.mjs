import fs from 'node:fs/promises';
import path from 'node:path';
import {parseEnv} from 'node:util';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';

// Evidence-only fixture harness. No application source or existing spec is changed.
const root=path.resolve(import.meta.dirname,'..');
const out=path.join(root,'docs/uas/evidence/revisi-laporan/2026-10-04T22-03-10Z');
const snapshot=path.resolve(process.argv[2]);
const databaseEnv=parseEnv(await fs.readFile(process.argv[3],'utf8'));
const configured=parseEnv(await fs.readFile(path.join(root,'.env'),'utf8'));
const wallets=parseEnv(await fs.readFile(path.join(process.env.USERPROFILE,'.uas-verifikasi/sepolia-test-wallets.env'),'utf8'));
if(!wallets.INSTITUTION_SIGNER_PRIVATE_KEY)throw new Error('DEDICATED_SIGNER_MISSING');
const db=new URL(databaseEnv.DATABASE_URL);
if(db.hostname!=='127.0.0.1'||db.pathname!=='/uas_revision_sepolia_20261005')throw new Error('ISOLATED_DATABASE_REQUIRED');
if(process.argv[4]==='--migrate') {
  const start=new Date();let logs='';
  const child=spawn('pnpm.cmd',['--filter','@verifikasi/web','db:migrate'],{cwd:snapshot,env:{...process.env,...databaseEnv},shell:true,stdio:['ignore','pipe','pipe']});
  for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{logs+=data.toString();});
  const exit=await new Promise(resolve=>child.on('exit',code=>resolve(code??1)));
  for(const value of Object.values(databaseEnv))if(value.length>7)logs=logs.split(value).join('[REDACTED_LOCAL_CONFIGURATION]');
  await fs.mkdir(path.join(out,'evidence/sepolia'),{recursive:true});
  await fs.writeFile(path.join(out,'evidence/sepolia/db-migration.log'),logs);
  await fs.writeFile(path.join(out,'evidence/sepolia/db-migration.json'),JSON.stringify({command:'pnpm --filter @verifikasi/web db:migrate',cwd:snapshot,
    startedAtUtc:start.toISOString(),finishedAtUtc:new Date().toISOString(),exitCode:exit,database:{host:db.hostname,port:db.port,name:db.pathname.slice(1)}},null,2));
  console.log(JSON.stringify({stage:'isolated-db-migration',exitCode:exit}));process.exit(exit);
}
const evidence=path.join(out,'evidence/sepolia/latest');await fs.mkdir(evidence,{recursive:true});
const original=await fs.readFile(path.join(snapshot,'apps/web/tests/e2e/sepolia.spec.ts'),'utf8');
let spec=original;
// The supplied key file has no dedicated admin. The primary deployer key is excluded.
spec=spec.replace("const admin = enabled ? new Wallet(process.env.SEPOLIA_E2E_ADMIN_KEY!, rpc) : null;", "const admin = enabled ? new Wallet(process.env.SEPOLIA_E2E_SIGNER_KEY!, rpc) : null;");
spec=spec.replace("evidence.admin = admin!.address; evidence.signer = signer!.address;", "evidence.admin = undefined; evidence.signer = signer!.address;");
spec=spec.replace("test('wallet on Sepolia signs in; switching to another network invalidates the session'", "test('dedicated institution wallet on Sepolia signs in; switching network invalidates its session'");
const start=spec.indexOf("test('administrator registers or reuses");
const end=spec.indexOf("async function issue",start);
if(start<0||end<0)throw new Error('HARNESS_ANCHOR_MISSING');
spec=spec.slice(0,start)+`test('existing synthetic issuer and signer registry are verified read-only; no admin key is used', async () => {
  const state=await registryState();
  expect(state.issuer).toEqual({name:issuerName,active:true,exists:true});
  expect(state.signer.issuerId).toBe(issuerId.toLowerCase());
  expect(state.signer.active).toBe(true);
  record('registry-read-only', {state, adminDemo:'BLOCKED_NO_DEDICATED_TEST_ADMIN_KEY', registryMutation:false});
});

`+spec.slice(end);
const switchStart=spec.indexOf("  await page.evaluate(address =>",spec.indexOf("test('institution signer issues"));
const switchEnd=spec.indexOf("  for (const key",switchStart);
if(switchStart<0||switchEnd<0)throw new Error('HARNESS_SIGNER_ANCHOR_MISSING');
spec=spec.slice(0,switchStart)+"  await page.goto('/penerbit');\n  await expect.poll(sessionWallet).toBe(signer!.address);\n"+spec.slice(switchEnd);
spec=spec.replace("  await page.getByRole('button', { name: 'Lanjut ke pengesahan', exact: true }).click();", "  await shot(`review-${key}`);\n  record(`review-${key}`, {syntheticProfile:person, encryptedSnapshotReviewed:true});\n  await page.getByRole('button', { name: 'Lanjut ke pengesahan', exact: true }).click();");
spec=spec.replace("test('revoking credential C through", `test('a blank synthetic PDF is rejected without any comparison transaction', async () => {
  test.setTimeout(10*60_000);
  const {PDFDocument}=await import('pdf-lib');const pdf=await PDFDocument.create();pdf.addPage([595,842]);
  const file=path.join(evidenceDir,'blank-document.pdf');writeFileSync(file,await pdf.save());
  const job=await upload('blank-document',file,'Belum dapat diverifikasi');
  expect(job.decision).toBe('INCONCLUSIVE');expect(job.txHash??null).toBeNull();
});

test('revoking credential C through`);
await fs.writeFile(path.join(evidence,'revision-sepolia.spec.ts'),spec);
const specTarget=path.join(snapshot,'apps/web/tests/e2e/revision-sepolia.spec.ts');await fs.writeFile(specTarget,spec);
const config=`import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests/e2e',testMatch:'revision-sepolia.spec.ts',workers:1,fullyParallel:false,timeout:60000,
  use:{baseURL:'http://localhost:3026',trace:'off',screenshot:'off'},reporter:'list',
  webServer:{command:'pnpm start',url:'http://localhost:3026/verifikasi',env:{PORT:'3026',APP_ORIGIN:'http://localhost:3026'},reuseExistingServer:false,timeout:120000}});
`;
await fs.writeFile(path.join(snapshot,'apps/web/playwright.revision.config.ts'),config);
await fs.writeFile(path.join(evidence,'playwright.revision.config.ts'),config);
const env={...process.env,...databaseEnv,
  APP_MODE:'testnet',APP_ORIGIN:'http://localhost:3026',PORT:'3026',RPC_URL:configured.RPC_URL,CHAIN_ID:'11155111',CHAIN_CONFIRMATIONS:'2',
  CREDENTIAL_CONTRACT_ADDRESS:'0x65b1C8C7B59D9651F8619F287Bc1c309FaE094e0',CONTRACT_DEPLOYMENT_BLOCK:'11841227',
  RELAYER_PRIVATE_KEY:wallets.RELAYER_PRIVATE_KEY,ATTESTOR_PRIVATE_KEY:wallets.ATTESTOR_PRIVATE_KEY,RESULT_READER_PRIVATE_KEY:wallets.RESULT_READER_PRIVATE_KEY,
  STORAGE_PROVIDER:'',TRUST_PROXY:'false',MAX_COMPARISONS_PER_HOUR:'30',
  SEPOLIA_E2E:'1',SEPOLIA_E2E_SIGNER_KEY:wallets.INSTITUTION_SIGNER_PRIVATE_KEY,
  SEPOLIA_E2E_ISSUER_ID:'0xd4aadc1f7b58512ea3b4974d82df569c4cb734aa8049aed5377cb95e8caf62ab',
  SEPOLIA_E2E_ISSUER_NAME:'Universitas Sintetis UAS (Uji)',SEPOLIA_E2E_EVIDENCE_DIR:evidence,SEPOLIA_E2E_VIDEO:'1',CI:'1'};
for(const key of ['DEPLOYER_PRIVATE_KEY','SEPOLIA_E2E_ADMIN_KEY','SEPOLIA_E2E_LEGACY_ID','LEGACY_CREDENTIAL_CONTRACTS','NETLIFY_AUTH_TOKEN','NETLIFY_SITE_ID','NETLIFY','SITE_ID','URL','BLOB_READ_WRITE_TOKEN','BLOB_STORE_HOSTNAME','S3_BUCKET','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY'])delete env[key];
const secrets=Object.entries({...configured,...wallets,...databaseEnv}).filter(([key,value])=>/KEY|SECRET|TOKEN|PASSWORD|DATABASE|RPC/.test(key)&&value.length>=8).flatMap(([,v])=>[v,...(v.startsWith('0x')?[v.slice(2)]:[])]);
const sanitize=value=>secrets.reduce((text,secret)=>text.split(secret).join('[REDACTED_CONFIGURED_SECRET]'),value)
  .replace(/postgres(?:ql)?:\/\/[^\s"']+/g,'[REDACTED_DATABASE_CONNECTION]');
const command='pnpm --filter @verifikasi/web exec playwright test --config playwright.revision.config.ts';
const started=new Date();let stdout='';
const run=spawn('pnpm.cmd',['--filter','@verifikasi/web','exec','playwright','test','--config','playwright.revision.config.ts'],{cwd:snapshot,env,shell:true,stdio:['ignore','pipe','pipe']});
for(const stream of [run.stdout,run.stderr])stream.on('data',data=>{stdout+=data.toString();process.stdout.write(sanitize(data.toString()));});
const exitCode=await new Promise(resolve=>{run.on('error',()=>resolve(127));run.on('exit',code=>resolve(code??1));});
await fs.writeFile(path.join(evidence,'playwright.log'),sanitize(stdout));
await fs.writeFile(path.join(evidence,'execution-context.json'),JSON.stringify({sourceCommit:'5e69fc81cc59f2b97df34f6bf2a6a6c12e259f03',runId:path.basename(out),
  applicationSourceFingerprint:'4768b19524f79adb75583f31710f9b0c10e4aa1c7aeb35b753271858f0180c6d',command,cwd:snapshot,
  startedAtUtc:started.toISOString(),finishedAtUtc:new Date().toISOString(),durationSeconds:(Date.now()-started)/1000,exitCode,
  originalSpecSha256:createHash('sha256').update(original).digest('hex'),fixtureHarnessSha256:createHash('sha256').update(spec).digest('hex'),
  harnessChanges:'Dedicated signer-only network login; admin mutation replaced by read-only registry check because primary admin key is prohibited; extra blank PDF rejection; review screenshots; legacy not seeded.',
  provider:'Automated EIP-6963 bridge: signatures and real Sepolia tx in Node; no manual browser extension wallet',primaryKeyUsed:false,
  environment:{APP_MODE:env.APP_MODE,APP_ORIGIN:env.APP_ORIGIN,CHAIN_ID:env.CHAIN_ID,CREDENTIAL_CONTRACT_ADDRESS:env.CREDENTIAL_CONTRACT_ADDRESS,
    CONTRACT_DEPLOYMENT_BLOCK:env.CONTRACT_DEPLOYMENT_BLOCK,CHAIN_CONFIRMATIONS:env.CHAIN_CONFIRMATIONS,STORAGE_PROVIDER:'local filesystem',TRUST_PROXY:env.TRUST_PROXY,
    MAX_COMPARISONS_PER_HOUR:env.MAX_COMPARISONS_PER_HOUR,database:{host:db.hostname,port:db.port,name:db.pathname.slice(1)},credentialSource:'provided dedicated test-wallet file, values excluded'},
  ocrPolicyVersion:'tesseract-js-ind-eng-v6',ocrPolicyHash:'0x84703946bb83afe03a55ab481950ea151af627e85615ad98ead4872d4a99a51d'},null,2)+'\n');
process.exitCode=exitCode;
