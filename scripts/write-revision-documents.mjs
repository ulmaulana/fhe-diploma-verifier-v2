import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
const out=path.join(root,'docs/uas/evidence/revisi-laporan/2026-10-04T22-03-10Z');
const latest='evidence/sepolia/latest';
const read=async name=>JSON.parse((await fs.readFile(path.join(out,name),'utf8')).replace(/^\uFEFF/,''));
const write=async(name,value)=>fs.writeFile(path.join(out,name),typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');
const identity=await read('source-identity.json');const local=await read('local-runtime-context.json');const commands=await read('local-command-results.json');
const run=await read(`${latest}/execution-context.json`);const evidence=await read(`${latest}/sepolia-e2e-evidence.json`);
const receipts=await read(`${latest}/receipts-events.json`);const jobs=await read(`${latest}/job-ocr-policy.json`);
const decryptions=await read(`${latest}/fhe-decryption-confirmation.json`);const scan=await read(`${latest}/no-comparison-event-scan.json`);
const preflight=await read('evidence/sepolia/preflight-bytecode.json');const media=await read(`${latest}/video-ffprobe.json`);
const wib=utc=>new Date(new Date(utc).getTime()+7*3600000).toISOString().replace('Z','+07:00');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'});
const steps=Object.fromEntries(evidence.steps.map(step=>[step.step,step]));
const receiptMap=new Map(receipts.receipts.map(item=>[item.transactionHash,item]));
const shots=[];
for(const file of (await fs.readdir(path.join(out,latest))).filter(name=>name.endsWith('.png'))){
  let step=file.startsWith('upload-')?steps[file.replace('.png','')]:file.startsWith('review-')?steps[file.replace('.png','')]:
    file.startsWith('04-issued-')?steps['issue-'+file.match(/04-issued-(.)/)[1]]:file==='05-qr-record-A.png'?steps['qr-record-A']:
    /06-revoked|07-qr-record/.test(file)?steps['revoke-C']:file==='08-history.png'?steps['history-report']:steps['wallet-network'];
  const descriptions={
    '01-admin-signed-in.png':'Portal setelah login dedicated signer. Filename diwarisi harness asal; tidak menggambarkan login admin atau penggunaan kunci admin.',
    'upload-A-original.png':'MATCH empat atribut PDF sintetis A, OCR backend dan FHE nyata; lihat job/request/receipt/dekripsi.',
    'upload-A-name-changed.png':'MISMATCH nama ANDRI PRATAMA terhadap ANDI PRATAMA; tiga field lain cocok.',
    'upload-QR-B-attributes-A.png':'MISMATCH seluruh atribut A terhadap rekaman B yang ditentukan QR sah.',
    'upload-B-on-expected-A.png':'INCONCLUSIVE karena QR B berbeda dari target A yang dipilih; tidak mengirim comparison.',
    'upload-foreign-fixture.png':'INCONCLUSIVE karena origin QR asing; tidak mengirim comparison.',
    'upload-blank-document.png':'INCONCLUSIVE: PDF kosong tidak memiliki QR yang layak; tidak mengirim comparison.',
    'upload-C-after-revocation.png':'REVOKED pada unggahan C setelah pencabutan; tidak mengirim comparison.',
    '05-qr-record-A.png':'Rekaman A terverifikasi, scope RECORD_ONLY; tanpa tanggal lulus, unggahan atau comparison baru.',
    '06-revoked-in-portal.png':'Transaksi pencabutan C oleh signer melalui portal.',
    '07-qr-record-C-revoked.png':'QR C menampilkan status dicabut dan jejak transaksi pencabutan.',
    '08-history.png':'Riwayat sesi pemilik; tes report HTTP200 dan sesi asing401 direkam terpisah.',
    'video-frame-280s.png':'Frame asli MP4 pada 280 detik, hasil MATCH A; ekstraksi tanpa modifikasi visual.'};
  if(file==='video-frame-280s.png')step=steps['upload-A-original'];
  shots.push({path:`${latest}/${file}`,description:descriptions[file]||(file.startsWith('review-')?'Review snapshot sebelum EIP-712.':'UI sintetis dari run terbaru.'),
    observed:descriptions[file]||(file.startsWith('review-')?'Peninjauan snapshot data sintetis dan referensi terenkripsi sebelum EIP-712/penerbitan.':file.startsWith('04-issued-')?'Portal penerbitan berhasil dan PDF tersedia.':'UI run Sepolia terbaru.'),
    sourceCommit:identity.sourceCommit,sourceFingerprint:identity.applicationSourceFingerprint,runId:identity.runId,
    atUtc:step?.atUtc||run.startedAtUtc,policyHash:run.ocrPolicyHash,scenario:step?.step||null,
    requestId:step?.requestId||null,credentialId:step?.credentialId||null,comparisonTxHash:step?.comparisonTxHash||null,issuanceTxHash:step?.issuanceTx||null,
    sha256:hash(await fs.readFile(path.join(out,latest,file)))});
}
await write(`${latest}/screenshot-index.json`,shots);
const sourceDiff=git('diff','--name-only','1413ebd','HEAD','--','apps','packages','contracts','scripts','package.json','pnpm-lock.yaml','.env.example','netlify.toml').trim();
const status=git('status','--short');await write('evidence/version/final-working-tree-status.txt',status);
const supplemental=await read('ocr-missing-confidence-result.json');
const metadata={schemaVersion:1,runId:identity.runId,startedAtUtc:'2026-10-04T22:03:10Z',startedAtWib:'2026-10-05T05:03:10+07:00',
  packageRecordedAtUtc:new Date().toISOString(),packageRecordedAtWib:wib(new Date().toISOString()),
  application:{sourceCommit:identity.sourceCommit,branch:identity.branch,sourceFingerprint:identity.applicationSourceFingerprint,
    sourceHashManifest:'source-identity.json',baselineCommit:identity.baselineCommit,trackedBehaviorPathsChangedSinceBaseline:sourceDiff?sourceDiff.split('\n'):[],
    initialWorktree:identity.initialStatus,initialTrackedDiff:'empty',finalWorktreeFile:'evidence/version/final-working-tree-status.txt',
    note:'Only documentation/evidence differs from baseline. Untracked prompt preserved; instructor template observed untracked later and read/copied only. Evidence helpers are new tooling, not application behavior changes.',
    executedSnapshotIdentity:'local-source-identity.json',generatedChanges:'Next/Workflow generated files only in temporary snapshot; hashes and category in local runtime context'},
  build:local.build,dependencies:local.dependencies,runtime:{local:local,sepolia:run.environment},
  contract:{chainId:11155111,address:run.environment.CREDENTIAL_CONTRACT_ADDRESS,deploymentBlock:11841227,eip712Name:'VerifikasiIjazah',eip712Version:'2',
    soliditySha256:preflight.soliditySourceSha256,abiSha256:preflight.abiSha256,bytecodeComparison:preflight.bytecodeComparison,preflightEvidence:'evidence/sepolia/preflight-bytecode.json',
    sourceVerification:'evidence/sepolia/sourcify-current.json',deployment:'Existing v2 deployment, no new deployment in this task'},
  ocr:{normalizer:'academic-normalizer-v1',schema:'academic-diploma-v1',encoding:'sha256-euint256-v1',version:run.ocrPolicyVersion,policyHash:run.ocrPolicyHash,
    gate:'Reject LOW_CONFIDENCE only when all four valid scores are strictly below 0.70; other eligibility and proof checks remain mandatory.',
    currentRunJobEvidence:`${latest}/job-ocr-policy.json`},
  commands:{local:commands,sepolia:{...run,startedAtWib:wib(run.startedAtUtc),finishedAtWib:wib(run.finishedAtUtc)},
    migration:await read('evidence/sepolia/db-migration.json'),preflight:[await read('evidence/sepolia/preflight-rpc.json'),preflight],
    collectorLatest:await read(`${latest}/collector-context.json`),collectorFirst:{command:'node scripts/collect-revision-sepolia-results.mjs <private local DB env file> --decrypt',exitCode:0,
      operation:'Seven receipt/event/state lookups; seven job OCR snapshots; three read-only authorized result decryptions',decryptionSamples:3,
      startedAtUtc:null,finishedAtUtc:null,timingLimitation:'First collector summary was reused by the second read-only public-proof collection. Exact first command start/end were not retained; decryption samples and all their monotonic timers remain available. No test/transaction count is added for collection repetition.'},
    media:{conversion:'ffmpeg -hide_banner -loglevel warning -n -i Video_Demo_Sepolia.webm -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -movflags +faststart -an Video_Demo_Sepolia.mp4',exitCode:0,
      fullDecode:await read(`${latest}/video-full-decode.json`),metadata:`${latest}/video-ffprobe.json`}},
  results:{unitContracts:{pass:515,fail:0,skip:0},postgres:{pass:9,fail:0,skip:0},localBrowser:{pass:25,fail:0,skipSepolia:12},
    supplementalMissingConfidence:{pass:1,countedIn515:false,evidence:'ocr-missing-confidence-result.json'},auditProof:{pass:1,countedIn515:false,evidence:'audit/S-16-zero-admin-reproduction.json',meaning:'Reproduces an open bug; a passing PoC is not a mitigation'},
    sepolia:{pass:12,fail:0,skip:1,legacySkipped:true,adminMutation:'BLOCKED_NO_DEDICATED_TEST_ADMIN_KEY',realTransactions:7,receiptsStatus1:7,
      authorizedFollowupDecryptions:3,rejectionsWithoutComparison:4,provider:run.provider}},
  hosting:{originalConfiguredOrigin:identity.originalConfiguration.origin,originalContract:identity.originalConfiguration.contractAddress,
    sourceAlignment:'NOT_PROVEN',deploymentChanged:false,demoOrigin:run.environment.APP_ORIGIN},
  privacy:{primaryDeployerKeyUsed:false,providedTestWalletsUsed:true,userDatabaseTouched:false,privateEnvironmentIncluded:false,logsSanitized:true},
  identity:identity.identity,requiredUserData:['Nama/NPM/kelas/kelompok','Identitas anggota','Kontribusi kode dan nonkode yang nyata','Pembagian presentasi serta bukti pemahaman anggota','Persetujuan use case bila tersedia','Laporan DOCX/PDF lama jika ingin kutipan dan halaman tepat'],
  evidence:{main:'BAHAN_REVISI_LAPORAN_UAS_TERBARU.md',tests:'TEST_RESULTS_TERBARU.md',deployment:'DEPLOYMENT_DAN_DEMO_TERBARU.md',audit:'AUDIT_DAN_RETEST_TERBARU.md',
    privacy:'EVALUASI_PRIVASI_DAN_NONFUNGSIONAL_TERBARU.md',revision:'PETA_REVISI_DOCX.md',requirements:'MATRIX_KETENTUAN_DOSEN.md',index:'INDEKS_BUKTI.csv',manifest:'MANIFEST_SHA256.json'}};
await write('METADATA_RUN.json',metadata);
const transactionRows=receipts.receipts.map(item=>`| ${item.events.map(event=>event.decoded?.name).filter(Boolean).join(', ')} | \`${item.transactionHash}\` | ${item.blockNumber} | ${item.status} | ${item.gasUsed} | ${item.blockTimestampUtc} |`).join('\n');
const caseRows=jobs.jobs.map(item=>`| ${item.scenario} | \`${item.job.id}\` | \`${item.job.credentialId||'tidak ditetapkan'}\` | ${item.job.decision} | ${item.job.ocrConfigVersion} | ${item.job.txHash?'receipt status 1':'tidak ada tx dan event comparison'} |`).join('\n');
const booleanRows=decryptions.samples.map(item=>`| ${item.scenario} | ${Object.values(item.fields).join(', ')} | ${item.allMatch} | ${item.agreementWithUI} | ${item.userDecryptSeconds.toFixed(3)} |`).join('\n');
const screenshotRows=shots.map(item=>`| [${path.basename(item.path)}](${item.path}) | ${item.observed} | ${item.scenario||'lihat konteks run'} | ${item.atUtc} |`).join('\n');
await write('DEPLOYMENT_DAN_DEMO_TERBARU.md',`# Deployment dan demo versi terbaru

Run \`${identity.runId}\` menjalankan aplikasi source \`${identity.sourceCommit}\` pada localhost dengan Ethereum Sepolia dan layanan Zama nyata. **12 skenario lulus, 0 gagal, 1 legacy v1 dilewati**; tujuh transaksi baru terdiri dari tiga penerbitan, tiga comparison dan satu pencabutan, seluruh receipt status 1. Ini demo provider otomatis EIP-6963 melalui bridge Node, bukan pengujian manual ekstensi wallet. [Log run](${latest}/playwright.log), [konteks eksekusi](${latest}/execution-context.json), dan [langkah/data UI](${latest}/sepolia-e2e-evidence.json) menjadi dasar klaim.

## Source, build, kontrak, dan lingkungan

Source fingerprint \`${identity.applicationSourceFingerprint}\`; Solidity SHA-256 \`${preflight.soliditySourceSha256}\`. Build Next.js ID \`${local.build.build_id}\` berasal dari snapshot tracked HEAD dengan mode build demo; server start untuk integrasi ini menerima APP_MODE=testnet dan konfigurasi testnet runtime terpisah. Config server membaca environment runtime; berhasilnya issuance/OCR/comparison nyata memberi bukti jalur testnet yang berjalan. Generated route Workflow/next-env hanya berubah pada snapshot TEMP. Source, build, runtime, kontrak dan hosting tidak disamakan; identitas/hash ada dalam [metadata](METADATA_RUN.json) serta [snapshot](local-source-identity.json).

Kontrak existing v2 \`0x65b1C8C7B59D9651F8619F287Bc1c309FaE094e0\`, chain ID **11155111**, event start **11841227**, domain **VerifikasiIjazah / 2**. [Preflight] (evidence/sepolia/preflight-bytecode.json) memeriksa chain, bytecode, domain, role, signer dan saldo tanpa mutasi. Bytecode compiled source sekarang cocok dengan runtime on-chain setelah masking hanya lokasi immutable yang dinyatakan compiler; metadata bytecode tetap dibandingkan. [Sourcify baru](evidence/sepolia/sourcify-current.json) memberi HTTP 200 dan exact_match creation/runtime; waktu pemeriksaan baru dibedakan dari verifiedAt 4 Oktober 2026. Deployment v2 sendiri tetap deployment historis, bukan deployment ulang pada tugas ini. [Record aslinya](source/contracts/deployments/sepolia/0x65b1C8C7B59D9651F8619F287Bc1c309FaE094e0.json).

Signer uji \`0x399a8A182631de9389B3fB3488537c9461d3a43e\` aktif pada institusi sintetis existing authorizationId 1. Attestor, relayer dan result reader memakai tiga alamat berbeda dan hanya role masing-masing; tidak menjadi admin atau signer. Saldo preflight signer **0.093173785722048222 SepETH**, relayer **0.243632477952008542 SepETH**; attestor/reader nol karena menandatangani pesan/mendekripsi tanpa membayar tx. Angka saldo adalah snapshot preflight, bukan saldo akhir.

Kunci admin uji khusus tidak ada dalam berkas wallet uji. **Mutasi admin/registry BLOCKED_NO_DEDICATED_TEST_ADMIN_KEY**; primary DEPLOYER_PRIVATE_KEY tidak digunakan. Registry dan role existing diperiksa read-only. Harness turunan mengganti dua kasus admin menjadi login signer/network dan pemeriksaan registry read-only, menambah PDF kosong serta screenshot review. Test legacy skip karena tidak ada seed signed proof v1 pada DB baru. Karena metode dan jumlah kasus berbeda, 12 pass terbaru tidak disebut retest identik terhadap 12 kasus historis. [Harness yang dijalankan](${latest}/revision-sepolia.spec.ts) dan [config browser](${latest}/playwright.revision.config.ts) disertakan; source aplikasi/spec asli dipertahankan.

Database demo terpisah **uas_revision_sepolia_20261005**, PostgreSQL 17.11 loopback 127.0.0.1:45439, storage filesystem privat di TEMP, origin **http://localhost:3026**, TRUST_PROXY=false, MAX_COMPARISONS_PER_HOUR=30, minimum dua konfirmasi. [Migrasi DB](evidence/sepolia/db-migration.json) exit 0; database pengguna tidak disentuh. Origin QR berasal dari runtime lokal yang sama. Profil/nama/tanggal dalam fixture adalah sintetis; job synthetic=false bermakna jalur pemrosesan nyata, bukan pernyataan bahwa identitas fixture adalah manusia nyata.

## Hasil per skenario

Login wallet signer berhasil; beralih ke jaringan lain menghapus sesi, kembali Sepolia lalu login berhasil. Registry institusi/signer existing valid, tanpa perubahan admin. Tiga snapshot data/encrypted handle ditinjau, lalu wallet signer menandatangani EIP-712 dan mengirim penerbitan; tiga PDF QR baru diunduh. QR A dapat dibaca anonim dan menghasilkan VERIFIED_RECORD, RECORD_ONLY, documentDecision=null; tanggal lulus tidak ada pada respons publik. QR membaca status/proof dan tidak membandingkan seluruh dokumen.

| Kasus unggahan | Job/request ID | Target credential ID | Keputusan | Versi OCR aktual job | Comparison |
| --- | --- | --- | --- | --- | --- |
${caseRows}

Setiap job aktual menyimpan policy hash \`${run.ocrPolicyHash}\`. Nilai teks OCR, confidence tiap field, halaman, template, kandidat QR, hash unggahan, status/timestamp dan binding tx terdapat pada [job/OCR](${latest}/job-ocr-policy.json), tanpa session/CSRF/lease/workflow token. PDF A sesuai menghasilkan MATCH; nama ANDRI PRATAMA menggantikan ANDI PRATAMA menghasilkan MISMATCH hanya nama. QR sah B pada atribut A membandingkan terhadap B dan menghasilkan empat false; kasus itu terpisah dari QR B yang berbeda target A (ditolak).

Target berbeda QR, origin foreign.invalid, PDF kosong tanpa QR, dan C setelah revoke tidak mengirim comparison. [Scan event](${latest}/no-comparison-event-scan.json) memakai interval inklusif **${scan.fromBlock}–${scan.toBlock}**, tepat **${scan.fullContractEventCount} ComparisonRequested** semuanya terikat pada tiga job comparison; keempat request ID yang ditolak tidak ditemukan. Status/job txHash null dan event scan digabung; ketiadaan popup wallet bukan bukti utama. PDF kosong ditolak karena tidak ada QR layak, bukan bukti gate confidence 70% tertentu.

Pencabutan C oleh signer memancarkan CredentialRevoked, state C revoked, QR REVOKED, unggahan REVOKED tanpa comparison, dan unduh PDF HTTP409. Riwayat milik sesi tersedia; PDF hasil MATCH HTTP200, sesi asing HTTP401. Legacy v1 tidak dijalankan baru dan tetap historis.

## Transaksi penuh, event dan state

| Event | Hash transaksi penuh | Blok | Receipt status | Gas terpakai | Waktu blok UTC |
| --- | --- | --- | --- | --- | --- |
${transactionRows}

[Receipt/event asli dan decoding](${latest}/receipts-events.json), [state credential akhir](${latest}/credential-state.json), serta [signed public proof sintetis](${latest}/signed-credential-proofs.json) disertakan. State akhir A/B aktif dan C revoked. Receipt membuktikan transaksi sukses, event mengikat credential/request, job mengikat berkas/policy, dan hasil dekripsi mengikat hasil UI; masing-masing mempunyai peran bukti berbeda.

| Comparison | Boolean nama, nomor, prodi, tanggal | Agregat | Sama dengan UI | Follow-up userDecrypt detik |
| --- | --- | --- | --- | --- |
${booleanRows}

[Dekripsi ulang](${latest}/fhe-decryption-confirmation.json) memakai SDK Zama nyata dan reader berizin, read-only tanpa transaksi. Timer bootstrap dan userDecrypt adalah koleksi lanjutan, bukan dekomposisi waktu pipeline UI sebelumnya. Sampel hanya tiga, sequential; tidak dihitung sebagai TPS/kapasitas atau akurasi populasi. Konteks koleksi pertama start/end tidak dipertahankan ketika summary reused oleh koleksi proof kedua; metadata menandai null, tanpa mengarang waktu. Semua timer monotonic dekripsi dan binding ID/hasil tetap disimpan.

## Screenshot dan video aktual

| Berkas baru | Observasi/caption | Kasus | Waktu UTC |
| --- | --- | --- | --- |
${screenshotRows}

[Indeks screenshot](${latest}/screenshot-index.json) mengikat source/run/policy, job/credential/tx dan SHA-256. Screenshot asli tidak mengubah keputusan; nama 01-admin-signed-in.png diwarisi harness lama tetapi halaman run ini memakai signer uji, sesuai caption. [MP4 demo terbaru](${latest}/Video_Demo_Sepolia.mp4) merekam run yang sama, **${Number(media.format.duration).toFixed(1)} detik**, 1280×900, H.264, 25fps, tanpa audio; [WebM asli](${latest}/Video_Demo_Sepolia.webm) dipertahankan. Konversi tidak memotong/mengganti keputusan. [ffprobe](${latest}/video-ffprobe.json) dan [decode penuh](${latest}/video-full-decode.json) exit0; frame280s diperiksa visual cocok MATCH A. [Provenance tool](evidence/sepolia/video-tool-provenance.json) mencatat checksum. Durasi video merupakan hasil rekaman, bukan ketentuan dosen.

## Hosting, reproduksi dan batas

Original .env masih menunjuk v1 \`0x39de125002edA28c886d9125AE5d61BB5BE04903\` dan origin https://sage-daifuku-cef5a6.netlify.app. Konfigurasi itu tidak digunakan untuk demo ini; runtime isolated mengarahkan v2. Commit/build/header/storage situs Netlify belum dibuktikan selaras; tidak redeploy hosting. [Header localhost baru](evidence/sepolia/runtime-http.json) menunjukkan HTTP200, nosniff, DENY, same-origin dan private no-store; CSP/Permissions-Policy/HSTS tidak hadir pada HTTP lokal. Bukti itu tidak digeneralisasi ke hosting.

Reproduksi: install frozen lockfile di salinan source monorepo, jalankan lint/typecheck/build, siapkan PostgreSQL loopback terpisah dan migrasikan schema; berikan konfigurasi privat testnet v2 plus tiga service key dan signer uji existing; APP_ORIGIN localhost3026, storage privat baru dan budget30; jalankan harness dengan config yang disertakan. Helper [run-revision-sepolia.mjs](tooling/run-revision-sepolia.mjs) menunjukkan allowlist environment dan penjagaan target DB; lokasi privat jangan dimasukkan paket. Helper hardcoded run/DB/origin ditujukan reproduksi konteks QA ini dan harus memakai directory run baru bila dijalankan ulang. Pengiriman transaksi fixture baru memerlukan saldo testnet dan role yang benar; tidak perlu redeploy bila bytecode/source masih cocok. Source contoh konfigurasi aman [env](source/.env.example) dan [README](source/README.md).

Batas yang tetap ada: tidak ada pengujian admin mutation baru/legacy seed, wallet manual extension belum diuji run ini, hosting belum selaras, dan S-16 zero-admin terbuka. Bukti historis 4 Oktober2026 disimpan terpisah dalam source/docs/uas/evidence/sepolia; video historis tidak diduplikasi. Seluruh keputusan terbaru di atas berasal run source/OCR v6 sekarang.
`);
await write('BAHAN_REVISI_LAPORAN_UAS_TERBARU.md',`# Bahan teknis revisi laporan UAS terbaru

Paket ini memeriksa aplikasi penerbitan dan verifikasi ijazah yang benar-benar ada pada HEAD **${identity.sourceCommit}**, branch main, run **${identity.runId}**, mulai **4 Oktober2026 22:03:10 UTC / 5 Oktober2026 05:03:10 WIB**. Hasil baru: **515 unit/kontrak, 9 PostgreSQL, 25 E2E lokal lulus**, serta demo **12 skenario Sepolia lulus dan 1 legacy skip**. Tujuh transaksi fixture baru sukses dan tiga hasil FHE didekripsi ulang cocok UI. **S-16 zero-admin ditemukan valid dan masih terbuka.** Ini bahan teknis untuk ChatGPT; laporan akademik, PDF audit/evaluasi dan slide tidak dibuat atau diedit.

## Cara membaca bahan dan versi

Mulai dari dokumen ini, kemudian [pengujian](TEST_RESULTS_TERBARU.md), [deployment/demo](DEPLOYMENT_DAN_DEMO_TERBARU.md), [audit](AUDIT_DAN_RETEST_TERBARU.md), [privasi/nonfungsional](EVALUASI_PRIVASI_DAN_NONFUNGSIONAL_TERBARU.md), dan [peta revisi DOCX](PETA_REVISI_DOCX.md). [Metadata run](METADATA_RUN.json), INDEKS_BUKTI.csv dan MANIFEST_SHA256.json mengikat konteks serta hash berkas. Diagram editable dan PNG/PDF ada di [arsitektur](diagrams/architecture.drawio) dan [alur transaksi](diagrams/transaction-flow.drawio); dokumen diagram PDF bukan laporan akademik PDF.

Source fingerprint scope236berkas **${identity.applicationSourceFingerprint}**, dengan manifest hash pada [source identity](source-identity.json). Snapshot eksekusi membandingkan222berkas source/test/fixture/config byte-identical terhadap workspace, dengan scope/kategori generated dijelaskan [identity lokal](local-source-identity.json). Initial tracked diff kosong; prompt pengguna untracked dipertahankan. Template dosen kemudian tampak untracked dan hanya dibaca/disalin, bukan diubah. Status final dan diff aman tersedia pada [status](evidence/version/final-working-tree-status.txt) serta [diff aplikasi](evidence/version/application-working-tree.diff).

Perbandingan terhadap baseline1413ebd menggunakan commit Git asli: **kontrak, OCR, chain adapter, autentikasi, API, UI, persistence, konfigurasi dan test tidak berubah**; PRD/README/dokumen UAS dan bukti run/handoff berubah. [Daftar path](evidence/version/changes-from-baseline.txt), [diff dokumentasi](evidence/version/baseline-documentation.diff), [riwayat commit](evidence/version/commits-since-baseline.txt). HEAD baru terutama memperbarui dokumentasi/evidence, sehingga bukan alasan mengklaim fitur baru. Helper QA/diagram/packaging pada tugas ini adalah tooling, tidak mengubah perilaku aplikasi.

Build ID **${local.build.build_id}**, Node24.21.0, pnpm10.19.0, Next16.3.6/React19.3.0, TypeScript5.9.3, ethers6.16.0, solc0.8.28/Hardhat2.28.6, @fhevm/solidity0.11.1, Zama SDK0.4.1; versi resolved lain dari lockfile pada metadata, bukan rentang package.json. Build mode demo, runtime integrasi testnet memakai environment isolated. Kontrak v2 existing **0x65b1C8C7B59D9651F8619F287Bc1c309FaE094e0**, Sepolia11155111, domain VerifikasiIjazah/version2, event start11841227. Source Solidity hash **${preflight.soliditySourceSha256}** cocok baseline dan bytecode on-chain setelah compiler immutable ranges dimask. Sourcify current exact_match. Situs hosting merupakan objek lain yang belum dibuktikan selaras.

## Project1: desain yang diperiksa

[Fakta desain](DESIGN_FACTS.md) memetakan aktor, aset, model data, peran, aturan bisnis, fungsi Solidity dan trade-off sampai source. Pemeriksa anonim membuka QR dan dapat mengunggah dokumen; signer institusi mengesahkan data EIP-712 dan menerbitkan/cabut; admin mengelola registry; attestor menjamin hasil/gate OCR; relayer membayar comparison; reader mendekripsi hasil. Backend/database/storage/RPC/Zama merupakan trust boundary yang dijelaskan diagram, bukan aktor tanpa trust.

On-chain menyimpan registry/status, ID/nonce/domain/binding, hash profil publik, empat referensi euint256 terenkripsi dan handle boolean hasil; file ijazah, proof/profile, tanggal lulus plaintext, OCR/job/outbox dan PDF tetap off-chain. Public profile nama/nomor/prodi/institusi sengaja terbuka; tanggal lulus tidak pada QR publik. E-sign mengesahkan payload data yang terikat chain/kontrak/profile/encrypted input, bukan PKI/PAdES atau seluruh kertas. FHE.eq membandingkan digest256bit yang dienkripsi; tidak membandingkan byte ciphertext atau handle.

QR sah membuktikan VERIFIED_RECORD/RECORD_ONLY dengan documentDecision=null, tanpa OCR/comparison. MATCH hanya setelah unggah, rekaman valid, empat field layak, semua boolean cocok dan status dibaca ulang. Kebijakan OCR **tesseract-js-ind-eng-v6**, hash **${run.ocrPolicyHash}**, menolak LOW_CONFIDENCE hanya jika empat skor valid semuanya<0.70. Tepat satu0.70 cukup gate confidence; kelengkapan/validitas/kandidat/page/QR/proof tetap wajib. Source tidak menerapkan rata-rata atau semua field minimal70%. ACL referensi hanya kontrak, ACL hasil untuk reader; backend OCR tetap membaca plaintext.

## Project2: pengujian dan debugging terbaru

Instalasi sesuai frozen lockfile, lint, typecheck, compile/build, unit/kontrak, PostgreSQL nyata, E2E lokal dan coverage selesai. Empat percobaan awal gagal karena store/spawn sandbox, lalu retry berhasil. Coverage kontrak attempt1 custom-error decoding gagal pada instrumentasi (12pass22fail), bounded retry34pass berhasil; keduanya dipertahankan. Kegagalan tersebut dibedakan dari assertion produk yang gagal. Kasus debugging historis dengan red/green tetap berlabel historis. Perintah asli, cwd, parameter/environment aman, waktu UTC/WIB, durasi dan exit pada TEST_RESULTS dan local-command-results.

| Level bukti | Hasil terbaru | Makna dan batas |
| --- | --- | --- |
| Kontrak Hardhat/FHEVM mock | 34pass | Solidity/ACL/role/signature/ID/no-op/last-admin guard yang tercakup; bukan layanan Zama nyata atau jaminan tidak ada S16 |
| Unit domain/credentials/OCR/chain/web | 79+14+95+71+222=481pass | Total bersama kontrak515; OCR mencakup komponen lokal nyata dan parity fixtures, chain/service memakai mock sesuai suite |
| PostgreSQL disposable nyata | 9pass | Migrasi/RLS/row lock/atomic concurrency/lease; dua schema acak dibersihkan, DB pengguna tidak disentuh |
| Browser lokal mode demo | 25pass,12Sepolia skipped | UI/mobile/record/upload OCR lokal; skipped bukan pass |
| QA properti confidence hilang | 1pass terpisah | INVALID_CONFIDENCE, tidak diam-diam diubah0; bukan penambahan ke515 |
| Audit S16 PoC mock | 1pass terpisah | Membuktikan bug terbuka, bukan bukti mitigasi |
| Browser localhost+Sepolia/Zama nyata | 12pass,1legacy skip | Harness signer-only; admin registry read-only; tujuh tx baru,3dekripsi follow-up; tidak digabung25lokal |

Coverage baseline asli berasal **source/docs/uas/evidence/ocr-policy-70/final/coverage/** dan salinan baseline di coverage/baseline-ocr-policy-70; hasil baru berada **coverage/new/**. Enam workspace JSON asli, covered/total, provider/include/exclude/source denominator/hash terdapat pada TEST_RESULTS dan coverage-analysis. Kontrak100/100/100/100%; domain94.37/96.77/75.86/94.37%; credentials97.90/89.33/100/97.90%; OCR97.31/89.67/90.62/97.31%; chain80.07/84.11/79.54/80.07%; web **63.81/80.83/78.29/63.81%** (urut statements/branches/functions/lines). Web branch1194/1477 dibanding baseline1195/1478 pada source identik; perbedaan denominator V8 run tercatat, sebab branch itu tidak diisolasi. DB/browser/Sepolia tidak masuk instrumen coverage unit tersebut. Coverage dan confidence bukan akurasi OCR atau skor dosen.

Regresi OCR mencakup empat skor valid<0.70; tepat satu=0.70; lebih dari satu>=0.70; missing/NaN/out-of-range; field missing/invalid/ambigu/lintas halaman/QR/rekaman; recovery stale policy. Hasil/tanpa skenario tambahan diuraikan berdasarkan suite yang benar-benar dijalankan. Demo terbaru memakai policy v6 aktual pada job, bukan mengaitkan ulang transaksi historis dengan hash baru.

## Project3: audit, retest dan tindak lanjut

Audit lengkap mencakup reentrancy, access control, front-running/ordering, oracle risk, DoS, validasi input dan error handling; S01–S15 ditelusuri ke historical parent/commit diff, reproduksi lama dan retest source kini. Perbaikan lama role conflict, bindingID/issuerNameHash, ACL, signature, no-op, budget, IP/header, revoke RPC failure, recovery/outbox/lease, session dan DB row lock tetap teruji. Catatan residual/informational/unproven dipisahkan dari vulnerability valid.

**S16 baru terbuka:** _grantRole menerima zero address sebagai admin; adminCount menjadi2, lalu admin riil renounce sehingga tersisa adminCount1 milik alamat nol. Admin yang bisa melakukan operasi menjadi nol dan registry terkunci. [PoC source/state](audit/S-16-zero-admin-reproduction.json) dibuktikan pada mock lokal; tidak dilakukan di kontrak Sepolia publik. Prasyarat tindakan admin salah/sengaja; risiko sedang dengan likelihood rendah dan dampak tinggi governance availability. Usulan reject address(0) pada grant role dan regresi semua role nol/kontinuitas usable admin. Tugas ini tidak mengubah kode, sehingga status tetap terbuka dan S02 guard numerik hanya mitigasi parsial.

Risiko residual mencakup backend/attestor sebagai oracle tepercaya, inferensi dari hasil berulang, satu RPC/Zama/KMS, custody operator, ACL hasil permanen, storage I/O sambil state row lock, dan backup/retensi provider. Lulus test tidak membuktikan bebas kerentanan. Prioritas tindak lanjut: S16, prosedur key/role/admin, kebijakan arsip/backup, retest hosting dan workload riil sebelum klaim kapasitas.

## Project4: privasi dan nonfungsional

Tabel10kategori data pada evaluasi menjelaskan upload, arsip, signed proof, profil QR, tanggal lulus, OCR, comparison, workflow, log dan backup. Akses artefak job min(created+24jam,terminal+1jam), history24jam; akses expired/tombstone/revoke tidak berarti seluruh bytes terhapus. Tes storage namespace lokal read-after-delete membuktikan artefak uji tidak dapat dibaca setelah delete; tidak membuktikan purge provider/media/backup. Arsip penerbitan/proof/date tidak punya autopurge source; chain/ACL metadata permanen. FHE tidak menyembunyikan plaintext dari backend/signer/storage dan tidak merahasiakan profil yang sengaja publik.

Header runtime localhost, source IP/TRUST_PROXY=false, kuota30comparison/jam dan saldo preflight dicatat; tidak disamakan header/cleanup hosting. Workload Sepolia ini sequential,3comparison; durasi UI gabungan dan3follow-up dekripsi tersedia tanpa klaim TPS atau pemecahan antrean/OCR/enkripsi/RPC/persistence yang tidak diinstrumentasi. Ground truth fixture ditentukan data sintetis dan perubahan eksplisit; ketiga comparison sesuai expected, bukan estimasi akurasi populasi atau false-match rate. Benchmark mutasi PostgreSQL lama tetap historis dan bukan TPSchain.

Matriks Ethereum/public versus Fabric/permissioned membandingkan identitas, permissioning, konsensus, privasi, throughput, governance dan biaya dengan URL resmi/judul/tanggalakses. Tidak ada deployment/benchmark Fabric. Sepolia cocok pembuktian prototipe publik; konsorsium Fabric menjadi opsi saat organisasi menghendaki membership/governance bersama; database+signature cocok bila trust satu lembaga dan privasi/biaya lebih dominan. Otoritas/prosedur nyata dipisahkan dari rancangan rotasi/sengketa/retensi yang belum diberikan; tidak ada klaim kepatuhan hukum yang diuji.

## Project5: demo dan kesiapan paket

Alur terbaru menunjukkan peninjauan/pengesahan/penerbitanPDFQR, QR anonim, MATCH, nameMISMATCH, QRB+atributA MISMATCH, target/foreignQR/blank penolakan, revoke QR/unggah/PDF409, history/report owner200foreign401. Source/run/policy/fixture/hash/job/credential/tx/receipt/event/state/dekripsi/screenshot tertaut pada deployment doc dan raw JSON. Video MP4 terbaru473.4detik direkam dari run ini; durasi bukan ketentuan dosen. Admin mutation belum diuji baru karena dedicated test admin key absent; legacy1skip tanpa seed; primary key tidak dipakai. Situs Netlify belum terbukti selaras source/config, tidak dideploy ulang.

Bukti awal bahwa OCRv6 hanya diuji lokal dapat diperbarui untuk kasus yang terbukti pada demo baru ini. Bukti historis tetap berlabel historis, termasuk admin/registry/legacy dari versi lama, dan tidak dijadikan retest otomatis. Kontribusi manusia, persetujuan use case, defense/pemahaman semua anggota serta slide akademik belum terbukti; kontribusi agent tidak dianggap kontribusi mahasiswa.

## Pedoman dosen dan peta revisi

PDF asli6halaman dan template dibaca read-only, salinan/hash/ekstraksi ada di references. Laporan akademik sebelumnya tidak tersedia; peta revisi memakai baseline prompt dan kolom kutipan/halaman null. [Matriks61butir](MATRIX_KETENTUAN_DOSEN.md) mencantumkan setiap A, B1–B6, C1–C6, D1–D6, E1–E5, F1–F6, G1–G10, H/I/J/K, luaran/OBE/rubrik dan halaman asli, dengan implementasi/bukti/status/gap/tindak lanjut. Status perbutir tidak menghasilkan nilai dosen; bobot Project1–5 **20/20/25/15/20**. Local/testnet diperbolehkan, hosting Netlify bukan kewajiban otomatis; tidak ditambah kewajiban migrasiFabric/multisig/timelock/pause/proxy/kuorumRPC/minimumcoverage/durasivideo.

Inventaris G1–G10 memisahkan bahan teknis yang tersedia dari laporanPDF/Security_AuditPDF/evaluasi akademik2–3halaman/presentasi maksimal10slide/identitas yang belum dibuat. BagianK pengesahan soal adalah administrasi dosen; tidak dibuat tanda tangan atau persetujuan. Peta revisi menghubungkan Ringkasan,1,2,3,5.1–5.5,Kesimpulan,LampiranA–C dan menampilkan fakta pengganti beserta source/run/bukti.

Perubahan penting DOCX: objek source/run terbaru; hasil/coverage JSON baru; bukti OCRv6 kini mencakup Sepolia aktual; tujuh tx/screenshot/video baru; metode wallet bridge dan admin/legacy gaps; S16 terbuka serta kontinuitasadmin parsial; privasiTTL berbeda dari physicalpurge; hosting v1/origin lama berbeda runtime v2 lokal; pembandingan platform dan governance tanpa benchmark rekaan. Detail perbagian pada PETA_REVISI_DOCX.

## DATA_YANG_DIPERLUKAN_DARI_PENGGUNA

1. Nama, NPM, kelas dan identitas kelompok/anggota yang benar.
2. Kontribusi kode dan nonkode nyata setiap anggota serta bukti pendukung; nama authorGit tidak cukup.
3. Pembagian presentasi dan kesiapan tiap anggota menjelaskan sistem.
4. Bukti persetujuan use case dosen jika ada.
5. DOCX/PDF laporan lama jika revisi memerlukan kutipan persis dan nomor halaman.
6. Bila akan mengklaim kebijakan operasional: keputusan retensi arsip/backup, custody/rotasi key, sengketa/koreksi dan pemilik hosting. Item ini data konteks, bukan fitur baru yang dikerjakan agent.

Metadata identitas tetap null. Seluruh bahan teknis yang dapat dijalankan sudah diselesaikan tanpa mengarang identitas, kontribusi atau persetujuan. Paket mempertahankan perbedaan local/mock/Sepolia baru/Sepolia historis; manifest dan secret scan memeriksa berkas yang benar-benar dikirim.
`);
// Normalize accidental dense phrases in these generated coordinator documents only.
const replacements=[['4 Oktober2026','4 Oktober 2026'],['5 Oktober2026','5 Oktober 2026'],['scope236berkas','scope 236 berkas'],['membandingkan222berkas','membandingkan 222 berkas'],['baseline1413ebd','baseline 1413ebd'],['Node24.21.0','Node 24.21.0'],['pnpm10.19.0','pnpm 10.19.0'],['Next16.3.6','Next 16.3.6'],['React19.3.0','React 19.3.0'],['TypeScript5.9.3','TypeScript 5.9.3'],['ethers6.16.0','ethers 6.16.0'],['solc0.8.28','solc 0.8.28'],['Hardhat2.28.6','Hardhat 2.28.6'],['SDK0.4.1','SDK 0.4.1'],['Sepolia11155111','Sepolia 11155111'],['version2','version 2'],['start11841227','start 11841227'],['Kontrak100/','Kontrak 100/'],['domain94.37','domain 94.37'],['credentials97.90','credentials 97.90'],['OCR97.31','OCR 97.31'],['chain80.07','chain 80.07'],['Web branch1194','Web branch 1194'],['baseline1195','baseline 1195'],['3comparison','3 comparison'],['3dekripsi','3 dekripsi'],['PDF409','PDF 409'],['owner200foreign401','owner 200 / foreign 401'],['terbaru473.4detik','terbaru 473.4 detik'],['asli6halaman','asli 6 halaman'],['Matriks61butir','Matriks 61 butir'],['Project1–5','Project 1–5'],['2–3halaman','2–3 halaman'],['maksimal10slide','maksimal 10 slide'],['[Preflight] (','[Preflight](']];
for(const name of ['BAHAN_REVISI_LAPORAN_UAS_TERBARU.md','DEPLOYMENT_DAN_DEMO_TERBARU.md']){let text=await fs.readFile(path.join(out,name),'utf8');for(const [from,to]of replacements)text=text.replaceAll(from,to);await write(name,text);}
await fs.copyFile(path.join(root,'docs/Lanjutan Upgrade UAS/Prompt_Bahan_Revisi_Laporan_UAS.md'),path.join(out,'references/REQUEST_EXECUTED.md'));
console.log(JSON.stringify({written:['METADATA_RUN.json','BAHAN_REVISI_LAPORAN_UAS_TERBARU.md','DEPLOYMENT_DAN_DEMO_TERBARU.md',`${latest}/screenshot-index.json`],transactions:receipts.receipts.length,jobs:jobs.jobs.length,decryptions:decryptions.samples.length}));
