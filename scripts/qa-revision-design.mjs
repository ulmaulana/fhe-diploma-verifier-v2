import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const out = path.resolve(process.argv[2] || 'docs/uas/evidence/revisi-laporan/2026-10-04T22-03-10Z');
function cleanText(input) {
  const replacements = {
    'Bagian4':'Bagian 4', 'arahan10':'arahan 10', 'halaman template':'halaman template', 'nonfungsional2':'nonfungsional 2', 'akademik2':'akademik 2',
    'dianggapTPS':'dianggap TPS', 'dibanding1413':'dibanding 1413', 'deploymentlama':'deployment lama', 'diagrambaru':'diagram baru', 'hanya4':'hanya 4',
    'tigaissue':'tiga issuance', 'tigacomparison':'tiga comparison', 'Audit15catatanS01–S15':'Audit 15 catatan S-01–S-15', 'tiapS01–S15':'tiap S-01–S-15',
    'Tabel10kategori':'Tabel 10 kategori', 'mutasi78':'mutasi 78', 'dataS-12':'data S-12', 'MutasiDB':'Mutasi DB', 'Gunakan7':'Gunakan 7',
    'tanggalakses':'tanggal akses', 'laporanakademik':'laporan akademik', 'pengujianutama':'pengujian utama', 'hard24':'hard 24 jam', 'terakhir1000':'terakhir 1000',
    'meliputi source':'meliputi source', 'UASkelompok':'UAS kelompok', 'produkDApp':'produk DApp', 'P1desain':'P1 desain', 'P2testing':'P2 testing',
    'P3security':'P3 security', 'P4enterprise':'P4 enterprise', 'P5showcase':'P5 showcase', 'kontrolakses':'kontrol akses', 'runID':'run ID',
    'Sourceidentity':'Source identity', 'fixturehash':'fixture hash', 'captionakademik':'caption akademik', 'Nomorhalaman':'Nomor halaman',
    'captionkonsisten':'caption konsisten', 'dokumenhasil':'dokumen hasil', 'evaluasiakademik':'evaluasi akademik', 'olehChatGPT':'oleh ChatGPT',
    'angkaTPSproyek':'angka TPS proyek', 'readerhasil':'reader hasil', 'sourceproject':'source project', 'crashfault':'crash fault',
    'dosenpengampu':'dosen pengampu', 'kaprodi,gugusmutu':'kaprodi, gugus mutu', 'pengesahanagent':'pengesahan agent',
    'B01dst':'B-01 dan seterusnya', 'TERBUKTI pada':'TERBUKTI pada', 'hasilfinal':'hasil final', 'runbaru':'run baru', 'hasilbaru':'hasil baru',
    'nul l':'null', 'null ?':'null -', 'sourcebaru':'source baru', 'kebijakanbaru':'kebijakan baru', 'S16open':'S-16 terbuka',
    'maksimal10':'maksimal 10', 'Maksimal10':'Maksimal 10', 'deadline issuance':'deadline issuance'
    ,'1.1?1.2':'1.1–1.2', 'S-01?S-16':'S-01–S-16', 'Lampiran A?C':'Lampiran A–C', 'Identitasnama':'Identitas nama',
    'tracekode':'trace kode', 'riwayatcommit':'riwayat commit', 'Semua§5':'Semua §5', 'butirA–K':'butir A–K',
    'matriksbaru':'matriks baru', 'PDFasli':'PDF asli', 'produkakhir':'produk akhir', 'LaporanakademikPDF':'Laporan akademik PDF',
    'evaluasi2':'evaluasi 2', 'slide≤10':'slide ≤10', 'kontrak100':'kontrak 100', 'domain94':'domain 94', 'credentials97':'credentials 97',
    'OCR97':'OCR 97', 'chain80':'chain 80', 'web63':'web 63', '9DB':'9 DB', '25E2E':'25 E2E', '12Sepolia':'12 Sepolia',
    '100/97.90':'100/97.90', 'domainv2':'domain v2', 'owner200/foreign401':'owner 200 / foreign 401', 'revoke409':'revoke 409'
    ,'chain11155111':'chain 11155111', 'konfirmasi2':'konfirmasi 2', 'originlocalhost3026':'origin localhost:3026', 'OCRv6':'OCR v6',
    'Attestor/reader0wei':'Attestor/reader 0 wei', 'error0':'error 0', 'dibulatkan0.1detik':'dibulatkan 0.1 detik', 'range1.0–1.4detik':'rentang 1.0–1.4 detik',
    '791109,791085,791085gas':'791109,791085,791085 gas', 'median791085':'median 791085',
    '1002286,1002250,1002270gas':'1002286,1002250,1002270 gas', 'median1002270':'median 1002270', '40277gas':'40277 gas',
    'blok118448':'blok 118448', 'count setelah cleanup0':'count setelah cleanup 0', '22:07:56UTC':'22:07:56 UTC', '05:07:56WIB':'05:07:56 WIB',
    'PostgreSQL17.11':'PostgreSQL 17.11', 'Kontrakv2':'Kontrak v2', 'scope RECORD':'scope RECORD'
  };
  let result = input;
  for (const [a,b] of Object.entries(replacements)) result = result.replaceAll(a,b);
  return result.replace(/,(?=[A-Za-z])/g, ', ').replace(/(\d)(poin|halaman|skenario|slide|job|sesi|Okt)/g, '$1 $2');
}
fs.mkdirSync(path.join(out, 'diagrams'), { recursive: true });
fs.mkdirSync(path.join(out, 'references'), { recursive: true });
const rows = [];
function row(id, requirement, page, current, evidence, status, gap, next) { rows.push([id, requirement, page, current, evidence, status, gap, next]); }
const test='[Hasil baru](TEST_RESULTS_TERBARU.md); source/contracts/test/ dan source/apps/web/tests/';
const deploy='[Deployment/demo baru](DEPLOYMENT_DAN_DEMO_TERBARU.md); source/docs/uas/DEPLOYMENT_RECORD.md dan evidence Sepolia historis';
const audit='[Audit/retest](AUDIT_DAN_RETEST_TERBARU.md); audit/; source/docs/uas/CATATAN_TEMUAN_DAN_RETEST.md';
const design='[Fakta desain](DESIGN_FACTS.md); source/contracts/src/VerifikasiIjazah.sol; source/apps/web/src/server/; source/packages/';
const nf='[Evaluasi](EVALUASI_PRIVASI_DAN_NONFUNGSIONAL_TERBARU.md); references/technical-references.json';
row('A','Tim menyelesaikan use case yang disetujui sebelum UTS atau pengganti dosen, sampai dapat diuji/audit/demo/reproduksi; local/testnet, tanpa aset nyata/key utama/jaringan produksi','1','Use case penerbitan dan verifikasi ijazah; local FHEVM mock dan Sepolia 11155111; data sintetis. Persetujuan dosen belum tersedia',design+'; '+deploy,'SEBAGIAN','Persetujuan use case dan identitas kelompok belum ada; bukti terbaru mengikuti status run','Lampirkan persetujuan bila ada; pertahankan local/mock vs testnet nyata dan akun uji');
const b=[
['Aktor/stakeholder, aset/data, alur transaksi dan kebutuhan trust','Tabel aktor/aset/trust tersedia; signer, admin, pemeriksa, attestor/relayer/reader/backend/RPC/Zama','Kebenaran fakta akademik tetap trust penerbit; data manusia belum ada'],
['Diagram frontend, wallet/provider, contract, jaringan dan off-chain bila dipakai','Dua diagram native editable + SVG/PNG/PDF dari model source; trust boundary/browser/backend/chain/storage ditunjukkan','Diagram source bukan bukti semua adapter alternatif runtime'],
['Data on-chain/off-chain dan alasan teknis','Ciphertext+binding+metadata/status chain; profile/proof/date/PDF/OCR/job off-chain; alasan dan akses dipetakan','Retensi arsip/backup organisasi belum ditetapkan'],
['Kontrol akses/role dan aturan bisnis kontrak','Role conflict, signer per issuer, EIP-712/domain/ID/nama/inputproof/deadline/nonce/request/status; retest audit','S-16 baru: zero-admin dapat mengunci governance, masih terbuka'],
['Fitur Solidity relevan: function, visibility, koleksi, modifier, event, inheritance/interface/library, error/access control','Struct/mapping/array, function visibility, inherited onlyRole/EIP-712/AccessControl, ECDSA/FHE, custom errors. Enum/interface aplikasi tidak diperlukan bila tak relevan','Tidak ada kewajiban seluruh contoh fitur atau token/proxy'],
['Keputusan desain penting dan trade-off','QR record-only vs upload; e-sign data; FHE/ACL; backend OCR plaintext; immutable proof/arsip; atomik DB/lease; trust/biaya','Evaluasi akademik dan kebijakan organisasi tetap di luar tugas']
];
b.forEach((x,i)=>row('B.'+(i+1),x[0],'2',x[1],design+(i===1?'; diagrams/architecture.drawio; diagrams/transaction-flow.drawio':''),'TERBUKTI',x[2],'Masukkan fakta dan batas ke §5.1 template; untuk B.4 nyatakan S-16 terbuka'));
row('B luaran/OBE','Diagram arsitektur+alur, source dapat dikompilasi, desain model/akses/on-off-chain; Sub-CPMK 6–7','2','Source dan diagram/desain teknis tersedia; compile/run terbaru di dokumen hasil',design+'; '+test,'SEBAGIAN','Laporan akademik belum dibuat; hasil compile tidak diasumsikan','ChatGPT menyusun §5.1 berdasarkan hasil final');
const c=[
['Unit test positif/negatif/batas/kontrol akses','Run baru: 515 unit/kontrak pass (34/79/14/95/71/222 per workspace), 9 DB pass, 25 browser lokal pass, 12 Sepolia opt-in skip di suite lokal','Run ulang/skipped tidak boleh dijumlahkan; hasil Sepolia terpisah'],
['Compile dan debugging minimal satu kegagalan/kondisi tidak valid','Kegagalan historis C2-01 dan log diagnosis/compile/retest tersedia; S-16 PoC baru menegaskan invalid state','Kegagalan/retry baru harus tetap disimpan'],
['Deployment local atau test network yang diizinkan','v2 Sepolia telah dideploy historis; run baru memeriksa source/config; tidak redeploy otomatis','Bukti historis tidak disebut deployment baru'],
['Catat contract address, network, tx relevan, reproduksi deployment','Sepolia 11155111 v2 0x65b1C8C7B59D9651F8619F287Bc1c309FaE094e0; bytecode/source/role preflight cocok; tujuh receipt baru status1','Deployment kontrak tetap historis; transaksi baru terpisah'],
['Integrasikan client/antarmuka dengan wallet/provider dan kontrak','Next/ethers wallet-provider; challenge login dan EIP-712/tx; relayer backend; spec Sepolia opt-in','Bridge otomatis tidak disebut tanda tangan manual; hosting terpisah'],
['Demo minimal satu event/perubahan state yang terverifikasi dari tx','Run Sepolia terbaru: 12 pass/1 legacy skip, tiga issuance/tiga comparison/satu revoke receipt status1 + event/state; MATCH/MISMATCH/REVOKED','Admin mutation tidak dijalankan tanpa key admin uji khusus; legacy tidak digunakan']
];
c.forEach((x,i)=>row('C.'+(i+1),x[0],'2',x[1],i<2?test+'; source/docs/uas/evidence/debugging/; '+audit:deploy,'TERBUKTI',x[2],'Gunakan log/receipt/state/source aktual, pisahkan lokal/historis/Sepolia terbaru'));
row('C luaran/OBE','Folder test+hasil, deployment record+tx, client/script, README instalasi/reproduksi; Sub-CPMK 8 mencakup compile/debug/deploy/coverage/integrasi','2–3','Artefak source, tests, compile/debug, deployment/receipt dan README tersedia; hasil baru dibedakan dari baseline',test+'; '+deploy+'; source/README.md','TERBUKTI','Hosting tidak retest; admin mutasi blocked; bukan klaim semua layanan/cabang teruji','Isi §5.2 dan reproduksi dengan JSON/log terbaru');
const d=[
['Threat model ringkas: aset, aktor, trust boundary, penyalahgunaan','Peta chain/backend/browser/OCR/storage/RPC/service key/hasil tersedia','Ancaman backend/admin/RPC residual harus dijelaskan'],
['Minimal reentrancy, access-control flaw, ordering/front-running, oracle, DoS, validasi input, error handling sesuai relevansi','Tujuh aspek diperiksa pada audit internal source','Bukan jaminan bebas kerentanan; peer audit hanya bila ditetapkan'],
['Klasifikasi temuan menurut dampak dan kemungkinan secara argumentatif','S01–S15 dipisahkan bug/residual/informasi/tidak terbukti; S-16 valid baru terbuka','Skor risiko tidak merupakan nilai UAS'],
['Perbaiki temuan valid dan jelaskan perubahan kode','Remediasi lama dapat ditelusuri diff/commit; tugas ini tidak mengubah aplikasi. S-16 usulan terbuka','S-16 belum diperbaiki; jangan menutup status hanya karena PoC/test pass'],
['Tambah/perbarui unit test membuktikan perbaikan','Regresi perbaikan lama diperiksa ulang; PoC S-16 membuktikan defect','PoC bukan implementasi fix; retest fix belum ada'],
['Tabel audit menghubungkan temuan, bukti, risiko, mitigasi, status verifikasi','Tabel lengkap audit/retest terbaru beserta prasyarat/source/status','Batas source/history/runtime harus dipertahankan']
];
d.forEach((x,i)=>row('D.'+(i+1),x[0],'3',x[1],audit,i===3||i===4?'SEBAGIAN':'TERBUKTI',x[2],'Masukkan §5.3; tandai S-16 terbuka dan rekomendasi fix/regresi terpisah'));
row('D luaran/OBE','Audit, versi sebelum/sesudah/commit, unit test verifikasi; Sub-CPMK 9 dan CPMK033; peer audit bila dosen menetapkan','3','Bahan teknis audit internal tersedia; source/diff/bukti historis+retest ditautkan',audit,'SEBAGIAN','Security_Audit.pdf belum dibuat; target peer audit tidak diketahui','ChatGPT menyusun audit akademik; konfirmasi penugasan peer dari pengguna bila ada');
const e=[
['Bandingkan Ethereum/public vs Fabric/permissioned: identitas, permissioning, konsensus, privasi, throughput, governance, biaya','Matriks7 aspek source + dokumentasi resmi diakses5 Okt 2026','Tidak ada Fabric deploy/benchmark; angka komparatif tidak dikarang'],
['Evaluasi skalabilitas/interoperabilitas dan bottleneck','Rowlock JSONB, lease relayer, OCR/storage/RPC/Zama; ABI/EIP-712/QR/schema; pengukuran historis diberi konteks','Benchmark DB bukan TPS chain; tidak ada kapasitas produksi terbaru'],
['Evaluasi privasi dan data yang tidak semestinya terbuka on-chain','Tabel10kategori memisahkan akses/persistensi/cleanup/purge; date/PDF/OCR privat; profil/metadata publik','Backend membaca plaintext, backup/physical purge belum dibuktikan'],
['Governance perubahan kontrak,node,role,upgrade,sengketa','Admin/issuer/operator/network dipisah; nonupgradeable, role tooling, koreksi terbitbaru/revoke','S-16 open; governance organisasi/backup/sengketa belum ditetapkan'],
['Kondisi public/permissioned/database lebih tepat','Rekomendasi bersyarat trust publik/konsorsium/single institution dan biaya/privasi','Rekomendasi analisis bukan migrasi implementasi']
];
e.forEach((x,i)=>row('E.'+(i+1),x[0],'3',x[1],nf,'TERBUKTI',x[2],'Masukkan §5.4, pertahankan batas pengukuran dan sumber resmi'));
row('E luaran/OBE','Matriks arsitektur, evaluasi nonfungsional2–3halaman, rekomendasi; Sub-CPMK 10–11','3–4','Bahan matriks/evaluasi/rekomendasi teknis tersedia',nf,'SEBAGIAN','Evaluasi akademik2–3halaman/PDF ditunda sesuai instruksi','ChatGPT menyusun dengan data aktual, tanpa benchmark Fabric fiktif');
const f=[
['Masalah, stakeholder, alasan blockchain, kriteria keberhasilan','Penerbitan/QR/4 atribut/revoke/trust/kriteria tersedia',design,'Latar organisasi/persetujuan manusia belum diberikan'],
['Demo end-to-end wallet/client, kontrak, transaksi, event/state, hasil','Run v6 aktual: 12 pass/1 legacy skip; signer khusus uji, tiga issue/tiga comparison/revoke, QR, gates, history, hasil',deploy,'Bridge otomatis; role/registry read-only; admin mutasi blocked dan legacy tidak dijalankan'],
['Hasil unit test,deployment,audit,perbaikan,limit','Hasil baru dan temuan terbuka dicatat; S-16 belum fix',test+'; '+audit,'Residual/historis/hosting dipisahkan'],
['Etika,regulasi,risiko,keberlanjutan,dampak dunia nyata','Data sintetis; publikasi profil/trust/retensi/biaya/key/backup/sengketa',nf,'Tidak ada audit kepatuhan hukum atau angka energi'],
['Setiap anggota menjawab teknis dan kontribusi berdasar commit/dokumentasi','Riwayat commit asli tersedia; identitas/kontribusi manusia belum diberikan','source-identity.json; source/docs/uas/evidence/handoff/git-history.json','Nama/NPM/kelas/anggota/kontribusi/presentasi/pemahaman manusia belum tersedia'],
['Roadmap realistis','S-16 fix+regresi, backup/arsip/governance, hosting retest,instrumentasi/kapasitas bila perlu',nf+'; '+audit,'Usulan bukan fitur ditambahkan pada tugas ini']
];
f.forEach((x,i)=>row('F.'+(i+1),x[0],'4',x[1],x[2],i===4?'MEMERLUKAN DATA PENGGUNA':i===2?'SEBAGIAN':'TERBUKTI',x[3],i===4?'Pengguna mengisi kontribusi nyata dan latihan defense':'Gunakan §5.5 dan status hasil terbaru secara jujur'));
row('F luaran/OBE','Presentasi maksimal10 slide,demo langsung/video cadangan,laporan akhir,repo README/diagram/source/test/history; Sub-CPMK 11–12 CPMK071/CPMK072','4','Repo dan bahan teknis tersedia; demo/video terbaru sesuai status',deploy+'; '+test,'SEBAGIAN','Laporan/slide belum dibuat; defense belum dilakukan','ChatGPT menyusun akademik; pengguna melakukan presentasi/defense');
const g=[
['README_Final.pdf atau README.md: deskripsi, dependensi, konfigurasi,reproduksi','source/README.md dan perintah/test/deploy baru','source/README.md; '+test,'TERBUKTI','README.md diizinkan, PDF tambahan tidak perlu'],
['Laporan_UAS_Blockchain.pdf','Bahan teknis tersedia; laporan akademik tidak dibuat','BAHAN_REVISI_LAPORAN_UAS_TERBARU.md; PETA_REVISI_DOCX.md','BELUM TERBUKTI','ChatGPT akan menyusun/revisi akademik'],
['Source smart contract dan frontend/client','Snapshot source relevan dipaketkan dengan identity/hash',design+'; source-identity.json','TERBUKTI','Tidak mengganti stack/chain'],
['Folder test dan bukti unit testing','Tes source dan log/results/coverage run baru',test,'TERBUKTI','Hasil final mengikuti suite yang benar-benar selesai'],
['Deployment_Record.pdf atau ekuivalen: network/address/tx/deployment','Markdown/JSON lama dan verification/run baru',deploy,'TERBUKTI','Ekuivalen Markdown diizinkan; tidak ada deployment baru otomatis'],
['Security_Audit.pdf dan bukti perbaikan','Bahan audit/retest/commit/PoC; PDF tidak dibuat',audit,'SEBAGIAN','S-16 terbuka; Security_Audit.pdf olehChatGPT'],
['Architecture_Diagram.pdf/png','PNG/PDF dan sumber editable/XML tersedia','diagrams/architecture.drawio; diagrams/architecture.png; diagrams/architecture.pdf; diagrams/render-metadata.json','TERBUKTI','Renderer fallback lokal; bukan CLI draw.io; QAvisual dicatat'],
['Slide_Presentasi.pdf atau .pptx','Bahan hasil/demo/kontribusi tersedia; slide tidak dibuat','PETA_REVISI_DOCX.md','BELUM TERBUKTI','Maksimal10 slide; olehChatGPT/pengguna'],
['Video_Demo.mp4 atau link sesuai ketentuan sebagai cadangan','MP4 terbaru H264 473.4 detik dari run v6 aktual; full decode exit0',deploy+'; evidence/sepolia/latest/Video_Demo_Sepolia.mp4; evidence/sepolia/latest/video-full-decode.json','TERBUKTI','Bridge otomatis tanpa klaim narasi/defense manusia; metadata/hash video disertakan'],
['Riwayat kontribusi/commit dapat ditelusuri','Git history/source tersedia; manusia belum dimapping','source-identity.json; source/docs/uas/evidence/handoff/git-history.json','SEBAGIAN','Tidak mengarang kontribusi anggota dari commit agent']
];
g.forEach((x,i)=>row('G.'+(i+1),x[0],'4',x[1],x[2],x[3],x[4],'Lengkapi paket pengumpulan sesuai status; tugas ini hanya bahan teknis'));
row('H','Rubrik P1 desain 20%,P2 testing/deploy/integrasi 20%,P3 security/remediation 25%,P4 enterprise/nonfunctional 15%,P5 showcase/defense 20%; kualitas0–4 sesuai evidence/argumentasi/pemahaman','5','Bukti B–F dipetakan ke indikator, tanpa memberi nilai dosen','MATRIX_KETENTUAN_DOSEN.md; semua dokumen hasil run','TERBUKTI','Defense,pemahaman/presentasi manusia belum bisa dinilai otomatis','Dosen menilai; jangan mengubah status bukti menjadi persentase nilai');
[['P1','6–7','C4/A3/P4',20,'Arsitektur,model data,source,kontrolakses',design,'5'],['P2','8','C4/A3/P4',20,'Unit/debug/deployment/integrasi',test+'; '+deploy,'5'],['P3','9','C4–C5/A4/P4',25,'Threat model,audit,remediation,retest',audit,'6'],['P4','10–11','C4–C5/A4/P4',15,'Perbandingan arsitektur,evaluasi nonfungsional',nf,'6'],['P5','11–12','C5/A4/P5',20,'Demo,dokumentasi,presentasi,defense',deploy+'; PETA_REVISI_DOCX.md','6']].forEach(x=>row('I.'+x[0],`Sub-CPMK ${x[1]}, domain${x[2]}, ${x[4]}, bobot${x[3]}poin`,x[6],'Peta evidence teknis tersedia; penilaian bukan wewenang agent',x[5],'SEBAGIAN','Laporan/defense/anggota belum selesai; S-16 terbuka','Gabungkan narasi berbasis bukti tanpa nilai/skor otomatis'));
const j=[
['Seluruh demo local/testnet diizinkan; tanpa key utama/seed pribadi/aset nyata/produksi','Localmock dan Sepolia 11155111; dedicated layanan/signer; primary deployer tidak dipakai',deploy,'TERBUKTI','Tidak perlu mainnet/deploy host'],
['Key/seed tidak disimpan repo; akun uji/config aman','Environment tidak dimuat paket; secret scan dan sanitasi olehroot','source-identity.json; indeks/manifest/scanpaket','SEBAGIAN','Final scanner tidak membuktikan semua third party log tak menyimpan secret'],
['Setiap evidence trace source/commit/log/tx/artefak relevan','Sourceidentity,runID,log,fixturehash,receipt/job/screenshot metadata dipaketkan','source-identity.json; '+test+'; '+deploy,'SEBAGIAN','Kualitas hubungan lebih penting dari nama folder/waktu modifikasi'],
['Nilai bukan berdasar jumlah screenshot tetapi mutu implementasi/test/audit/argumentasi/reproduksi','Matriks memakai source/raw/hasil/interpretasi, bukan jumlah gambar','MATRIX_KETENTUAN_DOSEN.md','TERBUKTI','Tidak ada nilai otomatis'],
['Tanpa plagiarisme, salin kontrak tanpa atribusi,kontribusi/evidence palsu','Pustaka Zama/OpenZeppelin diatribusikan; evidence asli/historis dipisah; data manusia kosong','source/README.md; references/technical-references.json; PETA_REVISI_DOCX.md','SEBAGIAN','Data kontribusi nyata perlu pengguna; jangan atribusi karya agent sebagai karya anggota'],
['Setiap anggota memahami keseluruhan dan dapat menjelaskan bagian mana pun','Bahan desain/test/audit/roadmap mendukung latihan','DESIGN_FACTS.md; AUDIT_DAN_RETEST_TERBARU.md','MEMERLUKAN DATA PENGGUNA','Test otomatis tidak mengukur pemahaman manusia'],
['Demo gagal teknis dapat dinilai dari video cadangan/evidence reproduktif','Video MP4 terbaru run v6 tersedia dan full decode exit0',deploy+'; evidence/sepolia/latest/Video_Demo_Sepolia.mp4','TERBUKTI','Video otomatis belum menggantikan pemahaman/penjelasan anggota']
];
j.forEach((x,i)=>row('J.'+(i+1),x[0],'6',x[1],x[2],x[3],x[4],i===5?'Pengguna latihan defense dan memberi identitas/kontribusi nyata':'Pertahankan konteks/atribusi/akun uji dan bukti yang dapat diulang'));
row('Integritas pengantar','UASkelompok sesuai pembagian dosen; setiap anggota memahami keseluruhan; produkDApp+contract+test+audit+dokumentasi+presentasi/demo','1','Artefak teknis tersedia; manusia belum diberikan','references/soal-extracted.txt; PETA_REVISI_DOCX.md','MEMERLUKAN DATA PENGGUNA','Kelompok/anggota dan pemahaman belum dikonfirmasi','Isi data manusia null sampai diberikan');
row('Integritas template','Setiap bukti diberi B01dst,sumber,waktu,caption,observasi,interpretasi; tidak menampilkan key/seed/token/kredensial','Template: §3 (bukan halaman PDF soal)','Metadata/index raw dipaketkan untuk captionakademik','references/template-extracted.txt; indeks bukti run','SEBAGIAN','Nomorhalaman template mengikuti DOCX rendering yang belum dibuat','ChatGPT memberi captionkonsisten berdasarkan raw asli');
row('K','Pengesahan administratif dosenpengampu,kaprodi,gugusmutu','6','Bagian administratif asli tersedia tanpa perubahan','references/Soal_UAS_Blockchain_TA_2026_2027_Ganjil.pdf','TIDAK BERLAKU DENGAN ALASAN','Bukan tugas implementasi atau tanda tangan agent','Tidak membuat tanda tangan/stempel/persetujuan; manusia berwenang mengesahkan');
const intro='# Matriks seluruh ketentuan dosen dari PDF asli\n\nSumber primer: `references/Soal_UAS_Blockchain_TA_2026_2027_Ganjil.pdf` (6 halaman), dibaca langsung dengan pypdf; ekstraksi per halaman `references/soal-pages.json` dan `soal-extracted.txt`. Original template read-only disalin ke references/ beserta ekstraksi. HEAD `5e69fc81cc59f2b97df34f6bf2a6a6c12e259f03`, run `2026-10-04T22-03-10Z`, 5 Oktober 2026 WIB. Ketentuan dalam tabel diparafrasekan dari halaman asli; tidak menyalin matriks lama sebagai pedoman. Status TERBUKTI pada desain/evaluasi berarti bahan/source diperiksa, bukan laporan akademik atau seluruh runtime sudah selesai. Status pengujian/runtime mengikuti run aktual; SEBAGIAN berarti batas atau luaran yang belum lengkap dan dijelaskan pada row. Semua luaran tertunda/identitas dicatat, tanpa skor kepatuhan/nilai dosen.\n\n| butir | ketentuan | halaman PDF | implementasi saat ini | bukti | status | kekurangan | tindak lanjut |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n';
fs.writeFileSync(path.join(out,'MATRIX_KETENTUAN_DOSEN.md'),cleanText(intro+rows.map(r=>'| '+r.map(v=>String(v).replaceAll('|','/')).join(' | ')+' |').join('\n')+'\n\nPDF tidak mewajibkan Netlify, migrasi Fabric, multisig/timelock/pause/proxy, kuorum RPC, portal lulusan, minimum jumlah tes, threshold coverage atau durasi video tertentu. Semua itu pilihan implementasi/roadmap bila ada kebutuhan nyata. G2/G6/G8 dan evaluasiakademik belum dibuat sesuai batas pengguna; matriks ini bukan klaim paket pengumpulan lengkap.\n'));
for (const name of ['DESIGN_FACTS.md','EVALUASI_PRIVASI_DAN_NONFUNGSIONAL_TERBARU.md','PETA_REVISI_DOCX.md']) {
 const file=path.join(out,name); if(fs.existsSync(file)) fs.writeFileSync(file,cleanText(fs.readFileSync(file,'utf8')));
}
const sources=[
['Ethereum Networks','https://ethereum.org/en/developers/docs/networks/',['Sepolia testnet aplikasi; validator set berizin client/testing; testnet berbeda dari mainnet']],
['Proof-of-stake (PoS)','https://ethereum.org/en/developers/docs/consensus-mechanisms/pos/',['Ethereum konsensus PoS; dua konfirmasi kebijakan app bukan finalitas absolut']],
['Ethereum gas and fees: technical overview','https://ethereum.org/en/developers/docs/gas/',['Gas membayar komputasi/transaksi; fee bergantung gas dan price; belum mengukur harga produksi']],
['Identity — Hyperledger Fabric','https://hyperledger-fabric.readthedocs.io/en/latest/identity/identity.html',['X.509,PKI,MSP,principal menentukan identitas/hak organisasi']],
['Policies — Hyperledger Fabric','https://hyperledger-fabric.readthedocs.io/en/latest/policies/policies.html',['Policies menentukan hak/approval; channel config admin dan organisasi']],
['The Ordering Service — Hyperledger Fabric','https://hyperledger-fabric.readthedocs.io/en/latest/orderer/ordering_service.html',['Ordering terpisah; Raft crashfault; BFT SmartBFT tersedia sebagai pilihan']],
['Private data — Hyperledger Fabric','https://hyperledger-fabric.readthedocs.io/en/latest/private-data/private-data.html',['Channel dan PDC membatasi distribusi; data privat di peer berwenang; hash di ledger; orderer tak membaca plaintext privat']],
['Performance considerations — Hyperledger Fabric','https://hyperledger-fabric.readthedocs.io/en/latest/performance.html',['Hardware/network/endorsement/channel/batching/concurrency memengaruhi performa; biaya operator meliputi infrastructure; tidak ada angkaTPSproyek']],
['Access Control List — Zama','https://docs.zama.org/protocol/solidity-guides/smart-contract/acl',['allow permanent, allowThis contract, allowTransient tx, makePubliclyDecryptable global; sourceproject readerhasil dan reference contract only']]
];
fs.writeFileSync(path.join(out,'references/technical-references.json'),JSON.stringify({accessDateWIB:'2026-10-05',method:'web open/find, official documentation only',fabricDeployment:null,fabricBenchmark:null,sources:sources.map(([title,url,supportedClaims])=>({title,url,accessDate:'2026-10-05',supportedClaims}))},null,2));
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const colors=['#f5f5f5','#e8f4f8','#fff0e6','#e8f5e9'];
function diagram(name,title,lanes,nodes,edges,caption){
 const width=1200,height=lanes.length*150+100;
 const mx=['<mxGraphModel adaptiveColors="auto"><root><mxCell id="0"/><mxCell id="1" parent="0"/>'];
 let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#344554"/></marker></defs><rect width="${width}" height="${height}" fill="white"/><text x="20" y="28" font-family="Arial" font-size="20" fill="#172b4d">${esc(title)}</text>`;
 lanes.forEach((l,i)=>{const y=45+i*150;mx.push(`<mxCell id="lane${i}" value="${esc(l)}" style="swimlane;horizontal=0;startSize=110;fillColor=${colors[i]};strokeColor=#a9b5bd;html=1;" vertex="1" parent="1"><mxGeometry x="0" y="${y}" width="${width}" height="150" as="geometry"/></mxCell>`);svg+=`<rect x="0" y="${y}" width="${width}" height="150" fill="${colors[i]}" stroke="#a9b5bd"/><path d="M110 ${y} V${y+150}" stroke="#a9b5bd"/>`;l.split('\n').forEach((line,k)=>svg+=`<text x="10" y="${y+50+k*18}" font-family="Arial" font-size="12" fill="#172b4d">${esc(line)}</text>`);});
 const map=new Map(nodes.map(n=>[n.id,{...n,x:120+n.col*180,y:90+n.lane*150}]));
 edges.forEach((e,i)=>{let a=map.get(e.a),b=map.get(e.b);const same=a.lane===b.lane;mx.push(`<mxCell id="edge${i}" value="${esc(e.label||'')}" style="html=1;endArrow=classic;${e.dash?'dashed=1;':''}" edge="1" source="${a.id}" target="${b.id}" parent="${same?'lane'+a.lane:'1'}"><mxGeometry relative="1" as="geometry"/></mxCell>`);const dx=b.x-a.x,dy=b.y-a.y,t=Math.min(70/Math.abs(dx),30/Math.abs(dy));const x1=a.x+70+dx*t,y1=a.y+30+dy*t,x2=b.x+70-dx*t,y2=b.y+30-dy*t;svg+=`<path d="M${x1} ${y1} L${x2} ${y2}" stroke="#344554" stroke-width="1.4" ${e.dash?'stroke-dasharray="5 4"':''} fill="none"/>`; const norm=Math.hypot(dx,dy),ux=dx/norm,uy=dy/norm; svg+=`<polygon points="${x2},${y2} ${x2-7*ux+3*uy},${y2-7*uy-3*ux} ${x2-7*ux-3*uy},${y2-7*uy+3*ux}" fill="#344554"/>`;if(e.label)svg+=`<rect x="${(x1+x2)/2-Math.max(26,e.label.length*4.4+6)/2}" y="${(y1+y2)/2-9}" width="${Math.max(26,e.label.length*4.4+6)}" height="15" fill="white"/><text x="${(x1+x2)/2}" y="${(y1+y2)/2+2}" text-anchor="middle" font-family="Arial" font-size="8" fill="#172b4d">${esc(e.label)}</text>`;});
 nodes.forEach(n=>{const a=map.get(n.id);mx.push(`<mxCell id="${n.id}" value="${esc(n.text).replaceAll('\n','&#xa;')}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#426680;${n.db?'shape=cylinder3;':''}" vertex="1" parent="lane${n.lane}"><mxGeometry x="${a.x}" y="45" width="140" height="60" as="geometry"/></mxCell>`);svg+=n.db?`<path d="M${a.x} ${a.y+7} V${a.y+53} A70 7 0 0 0 ${a.x+140} ${a.y+53} V${a.y+7}" fill="white" stroke="#426680"/><ellipse cx="${a.x+70}" cy="${a.y+7}" rx="70" ry="7" fill="white" stroke="#426680"/>`:`<rect x="${a.x}" y="${a.y}" width="140" height="60" rx="8" fill="white" stroke="#426680"/>`;n.text.split('\n').forEach((line,k)=>svg+=`<text x="${a.x+70}" y="${a.y+(n.db?28:17)+k*14}" text-anchor="middle" font-family="Arial" font-size="11" fill="#172b4d">${esc(line)}</text>`);});
 mx.push('</root></mxGraphModel>');svg+=`<text x="20" y="${height-15}" font-family="Arial" font-size="11" fill="#344554">${esc(caption)}</text></svg>`;
 fs.writeFileSync(path.join(out,'diagrams',name+'.drawio'),mx.join(''));
 fs.writeFileSync(path.join(out,'diagrams',name+'.svg'),svg);
}
diagram('architecture','Arsitektur sumber: verifikasi ijazah / Sepolia / Zama',
['Browser\ntidak tepercaya','Backend\ntepercaya OCR','Jaringan\nRPC / Zama','Persistence\noperator'],[
{id:'check',lane:0,col:0,text:'Pemeriksa publik\nQR / unggah'},
{id:'web',lane:0,col:1,text:'Frontend Next.js\nPortal / QR / hasil'},
{id:'wallet',lane:0,col:2,text:'Wallet / provider\nEOA issue / revoke'},
{id:'api',lane:1,col:1,text:'API sesi / proof\nCSRF / ownership'},
{id:'runner',lane:1,col:2,text:'Workflow / runner\noutbox / lease'},
{id:'ocr',lane:1,col:3,text:'OCR rendered page\nMuPDF / QR / Tesseract'},
{id:'chain',lane:1,col:4,text:'Chain adapter\nattestor / relay / reader'},
{id:'rpc',lane:2,col:3,text:'Ethereum Sepolia RPC\nchain ID 11155111'},
{id:'contract',lane:2,col:2,text:'VerifikasiIjazah v2\nrole / record / equality'},
{id:'zama',lane:2,col:4,text:'Zama FHEVM / SDK\nciphertext / ACL / decrypt'},
{id:'db',lane:3,col:1,text:'PostgreSQL\nsesi / proof / metadata',db:true},
{id:'storage',lane:3,col:0,text:'Private storage\nupload / OCR / archive',db:true}
],[{a:'check',b:'web',label:'QR/file'},{a:'web',b:'wallet',label:'sign/tx'},{a:'web',b:'api',label:'HTTPS / sesi'},{a:'wallet',b:'api',label:'login / proof'},{a:'wallet',b:'rpc'},{a:'api',b:'runner',label:'job'},{a:'runner',b:'ocr',label:'plaintext'},{a:'ocr',b:'chain',label:'gate v6'},{a:'chain',b:'rpc',label:'tx / read'},{a:'rpc',b:'contract',label:'read/tx'},{a:'rpc',b:'zama',label:'FHE/ACL'},{a:'chain',b:'zama',label:'SDK decrypt'},{a:'api',b:'db',label:'proof / owner'},{a:'runner',b:'storage'}],
'Source HEAD 5e69fc8; local+testnet runtimes dibedakan. Adapter alternatif tersedia; diagram bukan bukti hosting.');
diagram('transaction-flow','Alur transaksi: issuance, QR record-only, upload comparison, revoke',
['Institusi\nwallet EOA','QR publik\nread-only','Backend\nOCR / FHE','Sepolia\nstate/event'],[
{id:'review',lane:0,col:0,text:'Review profil publik\n+ input terenkripsi'},
{id:'sign',lane:0,col:1,text:'Sign EIP-712 v2\nnonce / deadline'},
{id:'issue',lane:0,col:2,text:'issueCredential tx\nCredentialIssued'},
{id:'pdf',lane:0,col:3,text:'Arsip PDF + QR\nproof off-chain'},
{id:'revoke',lane:0,col:5,text:'revoke tx institusi\nstatus / PDF ditolak'},
{id:'qr',lane:1,col:0,text:'Buka QR resmi\n/c/{credentialId}'},
{id:'read',lane:1,col:1,text:'Baca proof + chain\nprofile / status'},
{id:'record',lane:1,col:2,text:'RECORD_ONLY\ndocumentDecision=null'},
{id:'upload',lane:2,col:0,text:'Unggah sesi pemilik\nfile / target / hash'},
{id:'gate',lane:2,col:1,text:'OCR + gate v6\nfield / QR / page'},
{id:'enc',lane:2,col:2,text:'Enkripsi + attestation\npolicy / request binding'},
{id:'decrypt',lane:2,col:3,text:'Reader decrypt bool\nrecheck record status'},
{id:'result',lane:2,col:4,text:'MATCH / MISMATCH\natau error / inconclusive'},
{id:'issued',lane:3,col:2,text:'State referensi FHE\n4 euint256 / ACL contract'},
{id:'compare',lane:3,col:3,text:'verify relayer tx\nComparisonRequested'},
{id:'revoked',lane:3,col:5,text:'CredentialRevoked\nrevokedAt / block'}
],[{a:'review',b:'sign'},{a:'sign',b:'issue'},{a:'issue',b:'pdf'},{a:'revoke',b:'revoked',label:'tx asli'},{a:'qr',b:'read',dash:true},{a:'read',b:'record',dash:true},{a:'upload',b:'gate'},{a:'gate',b:'enc',label:'layak'},{a:'enc',b:'compare',label:'relay / FHE'},{a:'issued',b:'compare',label:'equality'},{a:'compare',b:'decrypt',label:'confirm / ACL'},{a:'decrypt',b:'result'},{a:'revoked',b:'result',label:'status reread'}],
'Putus-putus = QR read-only tanpa comparison tx. Gate invalid berhenti sebelum tx; MATCH hanya empat atribut.');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
fs.writeFileSync(path.join(out,'references/documents-metadata.json'),JSON.stringify({method:'pypdf page extraction + DOCX ZIP/XML read-only; stdout template print encoding error does not invalidate written extraction',sourceHead:'5e69fc81cc59f2b97df34f6bf2a6a6c12e259f03',previousAcademicReportFound:false,pdfPages:6,documents:fs.readdirSync(path.join(out,'references')).filter(n=>/\.(pdf|docx)$/.test(n)).map(n=>({file:n,sha256:hash(path.join(out,'references',n))}))},null,2));
console.log(JSON.stringify({rows:rows.length,output:out,diagrams:['architecture','transaction-flow']}));
