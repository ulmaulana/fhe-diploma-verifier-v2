import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parseEnv} from 'node:util';
import {execFileSync} from 'node:child_process';

const root=path.resolve(import.meta.dirname,'..');
const out=path.join(root,'docs/uas/evidence/revisi-laporan/2026-10-04T22-03-10Z');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const normalize=value=>value.replaceAll('\\','/');
const envFiles=[path.join(root,'.env'),path.join(process.env.USERPROFILE,'.uas-verifikasi/sepolia-test-wallets.env')];
const secrets=[];
for(const file of envFiles){try{const env=parseEnv(await fs.readFile(file,'utf8'));for(const [key,value]of Object.entries(env))if(/KEY|SECRET|TOKEN|PASSWORD|DATABASE|RPC_URL|MNEMONIC/.test(key)&&value.length>=8){secrets.push({key,value});if(value.startsWith('0x'))secrets.push({key,value:value.slice(2)});}}catch{}}
function sanitize(text){for(const {value}of secrets)text=text.split(value).join('[REDACTED_CONFIGURED_SECRET]');return text;}
async function walk(dir){const files=[];for(const item of await fs.readdir(dir,{withFileTypes:true})){const full=path.join(dir,item.name);if(item.isDirectory())files.push(...await walk(full));else if(item.isFile())files.push(full);}return files;}
async function copy(from,to){await fs.mkdir(path.dirname(to),{recursive:true});const bytes=await fs.readFile(from);const textExtensions=/\.(md|json|txt|log|patch|diff|csv|ya?ml|toml|[cm]?[jt]sx?|sol|cjs|mjs|info|example)$/i;
  if(textExtensions.test(from))await fs.writeFile(to,sanitize(bytes.toString('utf8')));else await fs.writeFile(to,bytes);}

async function sources(){
  const tracked=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024}).split('\0').filter(Boolean);
  const excluded=[];let count=0;
  for(const file of tracked){
    const application=/^(apps\/web\/|packages\/|contracts\/|scripts\/|\.github\/|package\.json$|pnpm-|eslint\.config|netlify\.toml$|\.env\.example$|README\.md$|CLAUDE\.md$|PRD\.MD$)/.test(file);
    const uas=/^docs\/uas\//.test(file)&&!/^docs\/uas\/evidence\/revisi-laporan\//.test(file);
    const design=/^docs\/(superpowers|testnet|deployment|architecture|pdf-ijazah)/.test(file);
    if(!application&&!uas&&!design)continue;
    if(/(^|\/)(node_modules|\.next|cache|coverage|\.private-data)(\/|$)/.test(file)&&!/^docs\//.test(file)){excluded.push({path:file,reason:'generated build/dependency/cache'});continue;}
    if(/\.(mp4|webm|zip)$/.test(file)){excluded.push({path:file,reason:'historical video/archive deliberately not duplicated'});continue;}
    if(/^docs\/uas\/evidence\/ocr-policy-70\/prior-handoff\//.test(file)){excluded.push({path:file,reason:'historical wrapper manifest, superseded; current historical baseline JSON retained'});continue;}
    await copy(path.join(root,file),path.join(out,'source',file));count++;
  }
  for(const file of ['collect-revision-evidence.mjs','run-revision-sepolia.mjs','collect-revision-sepolia-results.mjs','package-revision-evidence.mjs','write-revision-documents.mjs','prepare-revision-video.ps1','qa-revision-design.mjs']){const from=path.join(root,'scripts',file);try{await copy(from,path.join(out,'tooling',file));}catch(error){if(error.code!=='ENOENT')throw error;}}
  await fs.mkdir(path.join(out,'evidence/version'),{recursive:true});
  await fs.writeFile(path.join(out,'evidence/version/package-source-selection.json'),JSON.stringify({trackedSourceCount:count,excluded,
    selection:'Current tracked monorepo application/test/config/fixtures, UAS history excluding old video/archive, technical specs; private environment and installed dependencies excluded.',
    currentSourceFingerprintScope:'source-identity.json applicationSourceHashes. Newly created evidence-only helpers are in tooling, excluded from baseline application fingerprint.',
    privacy:'Copies sanitized only for configured secret value matches; every delivered file has manifest hash. Synthetic fixture data and public testnet identifiers may remain.'},null,2)+'\n');
  console.log(JSON.stringify({copied:count,excluded:excluded.length}));
}

async function finalize(){
  const files=(await walk(out)).filter(file=>!['MANIFEST_SHA256.json','INDEKS_BUKTI.csv','PACKAGE_VALIDATION.json','SECRET_SCAN.json'].includes(path.basename(file))&&!file.endsWith('.zip')).sort();
  const matches=[];const sanitizations=[];
  for(const file of files){const bytes=await fs.readFile(file);const text=bytes.toString('utf8');const found=secrets.filter(item=>text.includes(item.value));
    if(found.length){if(/\.(png|pdf|docx|mp4|webm|ttf|woff2|jpg|jpeg)$/i.test(file)){matches.push({path:normalize(path.relative(out,file)),categories:[...new Set(found.map(v=>v.key))]});}
      else{await fs.writeFile(file,sanitize(text));sanitizations.push({path:normalize(path.relative(out,file)),categories:[...new Set(found.map(v=>v.key))]});}}
    if(/(^|[\\/])\.env$|[\\/]node_modules[\\/]|[\\/]\.git[\\/]/.test(file))matches.push({path:normalize(path.relative(out,file)),categories:['forbidden-file']});
  }
  const scan={scannedAtUtc:new Date().toISOString(),method:'Exact configured private key/token/API/RPC/database/secret/password values from root and dedicated test wallet environment, including bare hex key variants; forbidden private env/dependency/Git paths.',
    configuredSecretValueVariantsChecked:secrets.length,matches,sanitizations,remainingConfiguredSecretMatches:matches.length,
    caveat:'Exact-match scan does not independently prove absence of arbitrary unknown PII. Fixtures and identity are separately reviewed; human metadata remains null.',
    syntheticExamples:'Tracked tests and .env.example may contain documented dummy connection placeholders, public development keys or mock fixtures; no real configured connection string is included.'};
  await fs.writeFile(path.join(out,'SECRET_SCAN.json'),JSON.stringify(scan,null,2)+'\n');
  const mdChecks=[];
  for(const file of files.filter(file=>file.endsWith('.md')&&!normalize(path.relative(out,file)).startsWith('source/'))){const text=await fs.readFile(file,'utf8');
    for(const match of text.matchAll(/\]\(<?([^\n)>]+)>?\)/g)){const target=match[1];if(/^(https?:|app:|#|mailto:)/.test(target))continue;
      const clean=target.split('#')[0].replace(/:\d+$/,'');if(!clean)continue;
      let resolved;try{resolved=path.resolve(path.dirname(file),decodeURIComponent(clean));}catch{continue;}
      try{await fs.access(resolved);}catch{mdChecks.push({document:normalize(path.relative(out,file)),target});}}
  }
  const required=['BAHAN_REVISI_LAPORAN_UAS_TERBARU.md','TEST_RESULTS_TERBARU.md','DEPLOYMENT_DAN_DEMO_TERBARU.md','AUDIT_DAN_RETEST_TERBARU.md','EVALUASI_PRIVASI_DAN_NONFUNGSIONAL_TERBARU.md','PETA_REVISI_DOCX.md','METADATA_RUN.json'];
  const missing=[];for(const file of required)try{await fs.access(path.join(out,file));}catch{missing.push(file);}
  const validation={checkedAtUtc:new Date().toISOString(),requiredDocumentsMissing:missing,brokenLinksInNewMarkdown:mdChecks,
    historicalSourceDocs:'source/docs/uas contains historical snapshots whose external-to-package older video references are contextual only; deliverable six documents must resolve all local evidence links.',
    sourcePreservation:'No tracked application source modified by this task; user prompt untracked preserved.',secretScan:'SECRET_SCAN.json'};
  await fs.writeFile(path.join(out,'PACKAGE_VALIDATION.json'),JSON.stringify(validation,null,2)+'\n');
  if(missing.length||mdChecks.length||matches.length){console.log(JSON.stringify(validation));process.exitCode=1;return;}
  const all=(await walk(out)).filter(file=>!['MANIFEST_SHA256.json','INDEKS_BUKTI.csv'].includes(path.basename(file))&&!file.endsWith('.zip')).sort();
  const sourceIdentity=JSON.parse(await fs.readFile(path.join(out,'source-identity.json'),'utf8'));
  let shots=[],commands=[],demo=null;
  try{shots=JSON.parse(await fs.readFile(path.join(out,'evidence/sepolia/latest/screenshot-index.json'),'utf8'));}catch{}
  try{commands=JSON.parse(await fs.readFile(path.join(out,'local-command-results.json'),'utf8'));}catch{}
  try{demo=JSON.parse(await fs.readFile(path.join(out,'evidence/sepolia/latest/execution-context.json'),'utf8'));}catch{}
  const entries=[];const rows=[];
  const csv=value=>'"'+String(value??'').replaceAll('"','""')+'"';
  for(const file of all){const bytes=await fs.readFile(file);const rel=normalize(path.relative(out,file));const historical=/^source\/docs\/uas\/evidence\//.test(rel)||rel.includes('historical')||rel.includes('baseline');
    const level=historical?'HISTORIS':rel.startsWith('evidence/sepolia/latest')?'SEPOLIA_BARU':rel.startsWith('evidence/audit')?'MOCK_AUDIT_BARU':rel.includes('coverage')?'CAKUPAN_UNIT_MOCK_BARU':rel.startsWith('source/')?'SOURCE':'LOKAL_DAN_DOKUMENTASI_BARU';
    const entry={path:rel,bytes:bytes.length,sha256:hash(bytes)};entries.push(entry);
    const shot=shots.find(item=>item.path===rel);const command=commands.find(item=>item.log===rel);
    let observation=historical?'Bukti historis; versi/waktu asli dan batas klaim dipertahankan pada berkas':rel.startsWith('source/')?'Salinan source/test/fixture/config current HEAD; bukan hasil eksekusi tersendiri':'Bahan teknis run revisi; konteks rinci pada dokumen terkait';
    let at=historical?'lihat timestamp/provenance asli':sourceIdentity.recordedAtUtc;
    let cases=rel.includes('S-16')?'S-16':rel.includes('sepolia')?'Project 2/5':rel.includes('audit')?'Project 3':rel.includes('coverage')?'Project 2':'lihat dokumen';
    if(shot){observation=shot.observed;at=shot.atUtc;cases=[shot.scenario,shot.requestId,shot.credentialId,shot.comparisonTxHash].filter(Boolean).join(' | ');}
    else if(command){observation=`${command.command}; original exit ${command.original_exit_code}; ${command.status}; ${command.duration_seconds}s`;at=command.started_utc;cases=command.id;}
    else if(rel.includes('receipts-events'))observation='Tujuh receipt status1 transaksi fixture baru; raw public logs dan event decoded mengikat credential/request pada blok tercatat';
    else if(rel.includes('job-ocr-policy'))observation='Tujuh job aktual dari PostgreSQL disposable; OCR text/field confidence/page/template/policy v6, status keputusan dan tx tanpa session/workflow secrets';
    else if(rel.includes('fhe-decryption-confirmation')&&!historical)observation='Tiga authorized userDecrypt Zama nyata hasil comparison baru: TTTT/true, FTTT/false, FFFF/false; sama UI';
    else if(rel.includes('no-comparison-event-scan')&&!historical)observation='Scan event ComparisonRequested inklusif dari blok preflight ke blok post-demo: tepat3event;4request penolakan tidak muncul';
    else if(rel.endsWith('Video_Demo_Sepolia.mp4')&&!historical){observation='MP4 H264 1280x900 25fps 473.4s, rekaman kontinu demo signer-only terbaru; decode penuh exit0';at=demo?.startedAtUtc||at;}
    else if(rel.endsWith('Video_Demo_Sepolia.webm')&&!historical){observation='Rekaman browser WebM asli dari run Sepolia terbaru; sumber MP4 tanpa pemotongan keputusan';at=demo?.startedAtUtc||at;}
    else if(rel.startsWith('screenshots/local/'))observation='Screenshot E2E lokal pada snapshot source yang dibandingkan hash; konteks scenario/mode demo dan hash pada local-screenshot-changes.json';
    else if(rel.startsWith('diagrams/'))observation=rel.includes('architecture')?'Diagram arsitektur source dan batas trust browser/backend/chain/Zama/storage':'Diagram transaksi issuance/QR/upload/revoke dari source; bukan receipt runtime';
    else if(rel.startsWith('coverage/new/'))observation='JSON/LCOV coverage run baru unit/mock; provider/include/exclude/denominator dan covered/total pada coverage-analysis.json';
    rows.push([rel,observation,level,
      historical?'lihat provenance berkas':sourceIdentity.sourceCommit,historical?'lihat konteks run historis':sourceIdentity.runId,
      at,/ocr|sepolia\/latest/i.test(rel)&&!historical?'0x84703946bb83afe03a55ab481950ea151af627e85615ad98ead4872d4a99a51d':'',
      cases,entry.sha256,entry.bytes,sourceIdentity.applicationSourceFingerprint].map(csv).join(','));
  }
  const header=['path_relatif','deskripsi_observasi','level_bukti','commit_source','run_id','waktu_utc','policy_hash','kasus_temuan','sha256','bytes','source_fingerprint'].map(csv).join(',');
  const index=header+'\n'+rows.join('\n')+'\n';await fs.writeFile(path.join(out,'INDEKS_BUKTI.csv'),index);
  entries.push({path:'INDEKS_BUKTI.csv',bytes:Buffer.byteLength(index),sha256:hash(index)});
  await fs.writeFile(path.join(out,'MANIFEST_SHA256.json'),JSON.stringify({createdAtUtc:new Date().toISOString(),algorithm:'SHA-256',excludes:['MANIFEST_SHA256.json','wrapper ZIP'],fileCount:entries.length,entries},null,2)+'\n');
  console.log(JSON.stringify({files:entries.length,MiB:entries.reduce((n,v)=>n+v.bytes,0)/1024/1024,validation:'PASS',configuredSecretMatches:0}));
}

if(process.argv[2]==='sources')await sources();else if(process.argv[2]==='finalize')await finalize();else throw new Error('Use sources or finalize');
