import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parseEnv} from 'node:util';
import {execFileSync} from 'node:child_process';

// Build a portable DOCX-revision handoff from the tested application snapshot
// and current public evidence. Private configuration is never copied.
const root = path.resolve(import.meta.dirname, '..');
const evidenceRel = 'docs/uas/evidence/pemenuhan-komponen/2026-10-05';
const historicalRel = 'docs/uas/evidence/revisi-laporan/2026-10-04T22-03-10Z';
const evidence = path.join(root, evidenceRel);
const stateFile = path.join(evidence, 'report-package-state.json');
const zipFile = path.join(root, 'docs/uas/BAHAN_REVISI_LAPORAN_UAS_TERBARU.zip');
const reportNames = ['BAHAN_REVISI_LAPORAN_UAS_TERBARU.md', 'PETA_REVISI_DOCX_TERBARU.md',
  'TEST_RESULTS_TERBARU.md', 'DEPLOYMENT_DAN_DEMO_TERBARU.md',
  'AUDIT_DAN_RETEST_TERBARU.md', 'EVALUASI_PRIVASI_DAN_NONFUNGSIONAL_TERBARU.md'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const slash = value => value.replaceAll('\\', '/');
const excludedNames = new Set(['node_modules', '.git', '.next', '.private-data', '.data',
  '.workflow-data', 'artifacts', 'cache', 'fhevmTemp', 'coverage', 'test-results',
  'playwright-report', 'dist', '.swc']);

function assertInside(base, file) {
  const rel = path.relative(base, file);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('PATH_OUTSIDE_PACKAGE');
}
async function walk(dir, skip = () => false) {
  const found = [];
  for (const item of await fs.readdir(dir, {withFileTypes: true})) {
    const file = path.join(dir, item.name);
    if (skip(file)) continue;
    if (item.isSymbolicLink()) throw new Error('SYMLINK_IN_SELECTED_SOURCE');
    if (item.isDirectory()) found.push(...await walk(file, skip));
    else if (item.isFile()) found.push(file);
  }
  return found;
}
function allowed(rel, publicEvidence = false, currentEvidence = false) {
  const parts = slash(rel).split('/');
  if (slash(rel) === 'docs/redesign ui v2' || slash(rel).startsWith('docs/redesign ui v2/')) return false;
  if (/\.zip\.validation\.json$/i.test(rel)) return false;
  if (parts.some(name => name.startsWith('.env') && name !== '.env.example')) return false;
  if (parts.some(name => ['.git', 'node_modules', '.private-data', '.data', '.workflow-data',
    '.next', 'artifacts', 'cache', 'fhevmTemp', 'test-results', 'playwright-report', 'dist', '.swc'].includes(name))) return false;
  if (!publicEvidence && parts.some(name => excludedNames.has(name))) return false;
  if (!publicEvidence && (/\.tsbuildinfo$/i.test(rel) || /(^|\/)coverage\.json$/i.test(rel))) return false;
  if (rel.includes('src/app/.well-known/workflow/')) return false;
  if (/\.zip$/i.test(rel)) return false;
  if (!currentEvidence && /\.(mp4|webm)$/i.test(rel)) return false;
  return true;
}
async function copyTree(from, to, publicEvidence = false, currentEvidence = false) {
  for (const file of await walk(from, file => !allowed(slash(path.relative(from, file)), publicEvidence, currentEvidence))) {
    const rel = slash(path.relative(from, file));
    if (!allowed(rel, publicEvidence, currentEvidence)) continue;
    const dest = path.join(to, rel);
    await fs.mkdir(path.dirname(dest), {recursive: true});
    await fs.copyFile(file, dest);
  }
}
async function copyOne(from, to) {
  await fs.mkdir(path.dirname(to), {recursive: true});
  await fs.copyFile(from, to);
}
async function refreshPublicDocs(stage) {
  for (const file of await walk(path.join(root, 'docs'), file => slash(path.relative(root, file)).startsWith('docs/uas/evidence'))) {
    const rel = slash(path.relative(root, file));
    if (rel.startsWith('docs/uas/evidence/')) continue;
    if (!allowed(rel)) continue;
    await copyOne(file, path.join(stage, rel));
  }
  await copyOne(path.join(root, 'README.md'), path.join(stage, 'README.md'));
}
async function prepare() {
  const identity = JSON.parse(await fs.readFile(path.join(evidence, 'source-snapshot.json'), 'utf8'));
  const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  const stage = path.join(root, 'docs/uas/evidence/paket-revisi', runId);
  assertInside(root, stage);
  await fs.mkdir(path.dirname(stage), {recursive: true});
  await fs.mkdir(stage, {recursive: false});
  for (const directory of ['apps', 'packages', 'contracts', 'scripts', 'assets']) {
    await copyTree(path.join(identity.snapshot, directory), path.join(stage, directory));
  }
  for (const name of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.gitignore',
    '.env.example', 'eslint.config.mjs', 'PRD.MD', 'CLAUDE.md', 'netlify.toml']) {
    await copyOne(path.join(identity.snapshot, name), path.join(stage, name));
  }
  // Runner bytes and completed deployment records are newer than the frozen
  // application. Their individual hashes are recorded in execution provenance.
  await copyTree(path.join(root, 'scripts'), path.join(stage, 'scripts'));
  await copyTree(path.join(root, 'contracts/deployments'), path.join(stage, 'contracts/deployments'));
  await refreshPublicDocs(stage);
  await copyTree(path.join(root, historicalRel), path.join(stage, historicalRel), true);
  await copyTree(path.join(root, 'docs/uas/evidence/ocr-policy-70'),
    path.join(stage, 'docs/uas/evidence/ocr-policy-70'), true);
  const state = {preparedAtUtc: new Date().toISOString(), runId, stage,
    sourceSnapshot: identity.snapshot, sourceManifest: `${evidenceRel}/source-snapshot.json`, zipFile};
  await fs.writeFile(stateFile, JSON.stringify(state, null, 2) + '\n');
  console.log(JSON.stringify({stage, runId, prepared: true}));
}
async function configuredSecrets() {
  const values = new Set();
  const files = (await fs.readdir(root)).filter(name => name.startsWith('.env') && name !== '.env.example')
    .map(name => path.join(root, name));
  files.push(path.join(process.env.USERPROFILE, '.uas-verifikasi/sepolia-test-wallets.env'));
  for (const file of files) {
    let env;
    try { env = parseEnv(await fs.readFile(file, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    for (const [name, value] of Object.entries(env)) {
      if (!/KEY|SECRET|TOKEN|PASSWORD|DATABASE.*URL|RPC_URL|MNEMONIC/i.test(name) || value.length < 8) continue;
      values.add(value);
      if (/^(0x)?[a-f\d]{64}$/i.test(value)) {
        values.add(value.replace(/^0x/i, '')); values.add('0x' + value.replace(/^0x/i, ''));
      }
      try {
        const url = new URL(value);
        if (url.password.length >= 8) values.add(decodeURIComponent(url.password));
        for (const token of url.searchParams.values()) if (token.length >= 16) values.add(token);
        if (/RPC_URL/i.test(name)) for (const part of url.pathname.split('/')) if (part.length >= 16) values.add(part);
      } catch { /* Plain key/token rather than URL. */ }
    }
  }
  return [...values];
}
async function finalize() {
  // Rebuilding this task's own previously validated archive is reversible. An
  // unrelated pre-existing archive is never overwritten.
  try {
    const previous = JSON.parse(await fs.readFile(zipFile + '.validation.json', 'utf8'));
    if (sha(await fs.readFile(zipFile)) !== previous.sha256) throw new Error('EXISTING_ARCHIVE_NOT_OWN_VALIDATED_OUTPUT');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    try { await fs.access(zipFile); throw new Error('EXISTING_ARCHIVE_WITHOUT_VALIDATION'); }
    catch (accessError) { if (accessError.code !== 'ENOENT') throw accessError; }
  }
  const state = JSON.parse(await fs.readFile(stateFile, 'utf8'));
  const stage = path.resolve(state.stage);
  assertInside(path.join(root, 'docs/uas/evidence/paket-revisi'), stage);
  await refreshPublicDocs(stage);
  await copyTree(path.join(root, 'scripts'), path.join(stage, 'scripts'));
  await copyTree(evidence, path.join(stage, evidenceRel), true, true);
  // Remove only excluded staged files from earlier preparation. Resolve and
  // check every target; never delete or change the user's source workspace.
  for (const file of await walk(stage)) {
    const rel = slash(path.relative(stage, file));
    if (!allowed(rel, rel.startsWith('docs/uas/evidence/'), true)) {
      assertInside(stage, file); await fs.unlink(file);
    }
  }
  const summary = JSON.parse(await fs.readFile(path.join(evidence, 'verification-summary.json'), 'utf8'));
  const live = JSON.parse(await fs.readFile(path.join(evidence, 'qa/sepolia-run/execution-context.json'), 'utf8'));
  const metadata = {createdAtUtc: new Date().toISOString(), packageRunId: state.runId,
    purpose: 'Bahan teknis revisi laporan DOCX; bukan laporan akademik DOCX/PDF atau audit menyeluruh baru.',
    sourceSelection: {application: 'Tested current-working-tree snapshot, including user UI edits through the HomeHero overlay.',
      scripts: 'Actual current root runners; executed helper hashes remain separately bound by each executing-helper-provenance.json.',
      documentationAndDeployment: 'Current public docs and completed deployment records.',
      historical: 'Previous revision materials retained under their dated paths; historical videos/ZIP omitted.',
      omitted: 'All private env/config, wallets, PostgreSQL contents, dependency/build/cache/private runtime directories, unrelated duplicate UI-design source images and wrapper archive sidecars.'},
    currentSourceCaveat: 'HistoryPage.module.css changed in the user workspace after browser checks; tested application snapshot is preserved. Latest parity record reports this difference explicitly.',
    references: {sourceManifest: state.sourceManifest, initialParity: `${evidenceRel}/runtime-source-parity-before-home-update.json`,
      latestParity: `${evidenceRel}/runtime-source-parity.json`, liveRun: `${evidenceRel}/qa/sepolia-run/execution-context.json`},
    packageApplicationParity: JSON.parse(await fs.readFile(path.join(evidence, 'package-source-parity.json'), 'utf8')),
    liveRun: live, verification: summary,
    academicIdentity: {names: null, npm: null, class: null, contributionEvidence: null,
      reason: 'Belum diberikan; isi berdasarkan data nyata sebelum finalisasi DOCX.'}};
  await fs.writeFile(path.join(stage, 'METADATA_RUN.json'), JSON.stringify(metadata, null, 2) + '\n');
  await fs.writeFile(path.join(stage, 'README_PAKET.md'), `# Paket revisi laporan UAS — 5 Oktober 2026\n\nMulai dari [bahan laporan terbaru](docs/uas/BAHAN_REVISI_LAPORAN_UAS_TERBARU.md), lalu [peta revisi DOCX](docs/uas/PETA_REVISI_DOCX_TERBARU.md). Empat dokumen pendukung tersedia di folder yang sama.\n\nPaket berisi source aplikasi yang diuji, bukti pengujian lokal/Sepolia, receipt/event/state, konfirmasi FHE, PDF sintetis, screenshot, dan video terbaru. Materi bertanggal sebelumnya dipertahankan sebagai historis. Link source dan bukti menggunakan struktur repository agar bisa dibuka setelah ZIP diekstrak.\n\nSource aplikasi memakai snapshot yang diuji. Perubahan CSS riwayat setelah pengujian dicatat terpisah; klaim hasil tes tidak diperluas ke perubahan tersebut. Coverage dan video Sepolia berasal dari snapshot sebelum pembaruan beranda. Perhatikan batas klaim pada setiap dokumen.\n\nLihat [metadata](METADATA_RUN.json), [indeks bukti](INDEKS_BUKTI.csv), [checksum](MANIFEST_SHA256.json), [pemindaian rahasia](SECRET_SCAN.json), dan [validasi paket](PACKAGE_VALIDATION.json). Konfigurasi privat dan private key tidak disertakan. Gunakan akun existing dan konfigurasi lokal milik Anda untuk menjalankan ulang; jangan membuat wallet baru.\n\nDOCX laporan lama tidak tersedia di repository. Identitas, NPM, kelas, dan bukti kontribusi perlu Anda isi. Dokumen ini merupakan bahan revisi, bukan pengganti laporan akademik final.\n`);
  const secrets = await configuredSecrets();
  const all = await walk(stage);
  const matches = [];
  for (const file of all) {
    const rel = slash(path.relative(stage, file));
    if (!allowed(rel, true, true)) matches.push({path: rel, reason: 'forbidden private/cache/archive path'});
    const text = (await fs.readFile(file)).toString('utf8').toLowerCase();
    if (secrets.some(secret => text.includes(secret.toLowerCase()))) matches.push({path: rel, reason: 'configured secret value match'});
  }
  const scan = {checkedAtUtc: new Date().toISOString(), scannedFiles: all.length,
    method: 'Exact configured secrets from root private environment and authorized existing test-wallet environment; hexadecimal key variants and URL credential/token components.',
    configuredValueVariants: secrets.length, matches, remainingMatches: matches.length,
    limitations: 'Exact-match scanning cannot prove absence of unknown secrets/PII. Synthetic fixtures and public testnet identifiers remain. .env.example contains placeholders only.'};
  await fs.writeFile(path.join(stage, 'SECRET_SCAN.json'), JSON.stringify(scan, null, 2) + '\n');
  const brokenLinks = []; const missing = [];
  for (const name of reportNames) {
    const file = path.join(stage, 'docs/uas', name);
    let body; try { body = await fs.readFile(file, 'utf8'); } catch { missing.push(name); continue; }
    for (const match of body.matchAll(/\]\((?:<([^>\n]+)>|([^\n)]+))\)/g)) {
      const href = match[1] || match[2]; if (/^(https?:|mailto:|app:|#)/.test(href)) continue;
      const clean = decodeURIComponent(href.split('#')[0].replace(/:\d+$/, '')); if (!clean) continue;
      const target = path.resolve(path.dirname(file), clean);
      assertInside(stage, target);
      try { await fs.access(target); } catch { brokenLinks.push({document: name, href}); }
    }
  }
  const validation = {checkedAtUtc: new Date().toISOString(), requiredReportFiles: reportNames,
    missing, brokenLinksInSixNewReports: brokenLinks, configuredSecretMatches: matches.length,
    passed: missing.length === 0 && brokenLinks.length === 0 && matches.length === 0,
    historicalLinks: 'Historical documents may reference deliberately omitted older videos/archives; they remain historical context. All links in six new reports are checked.',
    zipIntegrity: 'CRC and full SHA-256 manifest verification performed after ZIP creation; see sidecar archive validation.'};
  await fs.writeFile(path.join(stage, 'PACKAGE_VALIDATION.json'), JSON.stringify(validation, null, 2) + '\n');
  if (!validation.passed) { console.log(JSON.stringify(validation)); process.exitCode = 1; return; }
  const appIdentity = JSON.parse(await fs.readFile(path.join(evidence, 'qa/home-update-browser-isolated/source-identity.json'), 'utf8'));
  const historicalIdentity = JSON.parse(await fs.readFile(path.join(root, historicalRel, 'source-identity.json'), 'utf8'));
  const rows = [['path_relatif','level_bukti','observasi','commit_referensi','source_fingerprint','run_id','waktu_utc','policy_hash','kasus_temuan','sha256','bytes']];
  const entries = [];
  for (const file of (await walk(stage)).sort()) {
    const rel = slash(path.relative(stage, file));
    if (['MANIFEST_SHA256.json','INDEKS_BUKTI.csv'].includes(rel)) continue;
    const bytes = await fs.readFile(file);
    const entry = {path: rel, bytes: bytes.length, sha256: sha(bytes)}; entries.push(entry);
    const historical = rel.startsWith(historicalRel) || rel.startsWith('docs/uas/evidence/ocr-policy-70');
    const level = historical ? 'HISTORIS' : rel.startsWith(`${evidenceRel}/qa/sepolia-run`) ? 'SEPOLIA_AKTUAL' :
      rel.startsWith(evidenceRel) ? 'VERIFIKASI_LOKAL_DAN_TEKNIS' : rel.startsWith('docs/') ? 'DOKUMENTASI' : 'SOURCE';
    const observation = historical ? 'Gunakan timestamp/versi/provenance asli; bukan eksekusi 5 Oktober.' :
      level === 'SOURCE' ? 'Snapshot aplikasi diuji; runner/deployment tertentu diperbarui dan hash eksekusinya dicatat terpisah.' :
      level === 'SEPOLIA_AKTUAL' ? 'Run live pada kontrak baru; konteks, receipt/state/decrypt dan fixture terkait berada di folder yang sama.' :
      'Hasil atau bahan teknis; lihat timestamp, perintah, status dan batas klaim pada isi berkas.';
    let fingerprint = historical ? historicalIdentity.applicationSourceFingerprint : appIdentity.sourceFingerprint;
    let run = historical ? '2026-10-04T22-03-10Z atau baseline OCR; lihat isi asli' : state.runId;
    let at = metadata.createdAtUtc;
    let commit = historical ? historicalIdentity.sourceCommit : live.launcherCommitReference;
    if (rel.startsWith(`${evidenceRel}/qa/`)) {
      const runName = rel.slice(`${evidenceRel}/qa/`.length).split('/')[0];
      run = `${evidenceRel}/qa/${runName}`;
      try {
        const identity = JSON.parse(await fs.readFile(path.join(stage, run, 'source-identity.json'), 'utf8'));
        fingerprint = identity.sourceFingerprint; at = identity.capturedAtUtc;
      } catch { fingerprint = 'lihat provenance khusus berkas'; }
    }
    if (/\.(json|md|txt|log|csv|patch)$/i.test(rel) && /qa\//.test(rel)) {
      try {
        const record = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
        at = record.startedAtUtc || record.capturedAtUtc || record.checkedAtUtc || record.recordedAtUtc || at;
      } catch { /* Non-JSON evidence is timestamped through run identity. */ }
    }
    const policy = level === 'SEPOLIA_AKTUAL' ? '0x84703946bb83afe03a55ab481950ea151af627e85615ad98ead4872d4a99a51d' : '';
    const cases = /contract|S-16|deployment-validation/.test(rel) ? 'S-16; validasi kontrak' : level === 'SEPOLIA_AKTUAL' ? 'issuance/QR/MATCH/MISMATCH/reject/revoke/history; lihat ID di JSON' : historical ? 'lihat kasus historis asli' : 'lihat dokumen/konteks run';
    rows.push([rel,level,observation,commit || 'null; lihat provenance',fingerprint || 'lihat provenance',run,historical?'lihat waktu asli':at,policy,cases,entry.sha256,entry.bytes]);
  }
  const csv = rows.map(row => row.map(value => '"'+String(value).replaceAll('"','""')+'"').join(',')).join('\n')+'\n';
  await fs.writeFile(path.join(stage, 'INDEKS_BUKTI.csv'), csv);
  entries.push({path:'INDEKS_BUKTI.csv',bytes:Buffer.byteLength(csv),sha256:sha(csv)});
  await fs.writeFile(path.join(stage, 'MANIFEST_SHA256.json'), JSON.stringify({createdAtUtc:new Date().toISOString(),
    algorithm:'SHA-256', excludes:['MANIFEST_SHA256.json','wrapper ZIP'],fileCount:entries.length,entries},null,2)+'\n');
  const python = String.raw`import pathlib, zipfile, json, hashlib, sys
stage = pathlib.Path(sys.argv[1]); archive = pathlib.Path(sys.argv[2])
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for f in sorted(stage.rglob('*')):
        if f.is_file(): z.write(f, f.relative_to(stage).as_posix())
with zipfile.ZipFile(archive) as z:
    bad = z.testzip()
    manifest = json.loads(z.read('MANIFEST_SHA256.json'))
    mismatches = [e['path'] for e in manifest['entries'] if hashlib.sha256(z.read(e['path'])).hexdigest() != e['sha256'] or len(z.read(e['path'])) != e['bytes']]
    result = {'checkedAtUtc': __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(), 'archive': archive.name, 'zipEntries': len(z.namelist()), 'manifestEntries': manifest['fileCount'], 'crcFailure': bad, 'manifestMismatches': mismatches, 'bytes': archive.stat().st_size, 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(), 'passed': bad is None and not mismatches}
    print(json.dumps(result))
    if not result['passed']: sys.exit(1)
`;
  const archiveResult = JSON.parse(execFileSync('python', ['-c', python, stage, zipFile], {cwd:root,encoding:'utf8',maxBuffer:1024*1024}));
  await fs.writeFile(path.join(root, 'docs/uas/BAHAN_REVISI_LAPORAN_UAS_TERBARU.zip.validation.json'), JSON.stringify(archiveResult,null,2)+'\n');
  console.log(JSON.stringify({...archiveResult,stage,secretMatches:0,brokenLinks:0}));
}

if (process.argv[2] === 'prepare') await prepare();
else if (process.argv[2] === 'finalize') await finalize();
else throw new Error('Use prepare or finalize');
