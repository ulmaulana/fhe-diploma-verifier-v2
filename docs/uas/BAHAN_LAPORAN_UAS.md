# Inventaris bahan UAS Blockchain — Verifikasi Ijazah

Bahan faktual untuk dibawa ke ChatGPT. Implementasi yang diuji bersih: 8a13faaaac696700c8018cc6c947682028393afc, branch main; source UI Sepolia: f32afe67b39af7b38e524e263bc63b5a0973c5a6. Revisi berikutnya melengkapi dokumentasi, renderer, dan handoff; [status](STATUS_INSTRUKSI_UAS.md) dan Git mencatat versi dokumen terakhir.

Semua ijazah evidence adalah fixture sintetis. Unit/kontrak mock, OCR/PDF/PostgreSQL nyata lokal, dan transaksi/dekripsi Sepolia memiliki tingkat bukti berbeda. Pengujian tidak memakai Supabase atau mainnet; Netlify tidak diubah. Bahan ini belum menjadi paket UAS lengkap. Laporan, audit formal PDF, desain singkat, rekomendasi enterprise, evaluasi tertulis, dan slide disusun ChatGPT setelah diminta pengguna.

## Sumber kanonis

| Data | Sumber |
| --- | --- |
| Kewajiban A–J dan tahap agent/ChatGPT | [instruksi utama](../Lanjutan%20Upgrade%20UAS/INSTRUKSI_IMPLEMENTASI_UAS_BLOCKCHAIN.md), [kepatuhan](KEPATUHAN_UAS.md) |
| Reproduksi, versi, konfigurasi | [README](../../README.md), [.env.example](../../.env.example), [demo](DEMO.md) |
| Aktor, data, Solidity, privasi, governance, E.1 | [fakta arsitektur dan pengukuran](FAKTA_ARSITEKTUR_DAN_PENGUKURAN.md) |
| Audit S-01–S-15, remediasi dan risiko residual | [catatan temuan dan retest](CATATAN_TEMUAN_DAN_RETEST.md) |
| Tes, coverage, debugging, kegagalan, CI | [hasil tes](TEST_RESULTS.md), [hasil mesin](evidence/final/verification-results.json) |
| Kontrak, roles, receipt, source match | [deployment](DEPLOYMENT_RECORD.md), [record mesin](../../contracts/deployments/sepolia/0x65b1C8C7B59D9651F8619F287Bc1c309FaE094e0.json) |

Template dosen memakai identitas UAS kelompok, ringkasan, bagian 1–3, bagian 5.1–5.5, dan bagian 6. Bagian 4 khusus UTS tidak digunakan. Anjuran 10–15 halaman UTS bukan batas laporan UAS. Maksimal 10 slide dan evaluasi 2–3 halaman tetap kewajiban ChatGPT. Jangan menyimpulkan hasil uji Fabric atau kepatuhan hukum dari repo.

## Indeks bukti B-01 dan seterusnya

Lokasi relatif terhadap dokumen ini. WIB = UTC+07:00; UTC mentah dipertahankan dalam log/JSON. Waktu adalah observasi/log/blok, bukan waktu file disalin. Log remediasi mencatat HEAD sebelum commit dan dirty state; commit perbaikan menunjuk perubahan yang kemudian disimpan.

| Kode | Judul observasi | Sumber/lokasi relatif | Waktu dan zona | Versi | Metode | Tingkat bukti | Hasil | Interpretasi/batas | Tugas/template | Caption |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| B-01 | Baseline dasar | [lint](evidence/baseline/pnpm-lint.log), [types](evidence/baseline/pnpm-typecheck.log), [unit](evidence/baseline/pnpm-test.log) | 4 Okt 2026 03:13–03:15 WIB; UTC di header | 96b4a08 | pnpm lint/typecheck/test | mock + lokal | Perintah baseline lulus | Belum mencakup tes serangan baru | C.1; 2, 3, 5.2 | Baseline sebelum remediasi. |
| B-02 | Regresi PDF portal | [E2E baseline](evidence/baseline/clean-pnpm-test-e2e.log), [gambar](evidence/baseline/e2e-failures/) | mulai 4 Okt 03:19:22 WIB | 96b4a08; next-env hasil build | E2E viewport 1280/800/390 | mock UI | 19 lulus, 3 gagal | Timeout menunggu input tanggal lulus yang berubah; assertion OCR juga usang | C.2; 5.2 | Kegagalan asli dipertahankan. |
| B-03 | Role/admin | [merah](evidence/remediation/S-01-red.log), [hijau](evidence/remediation/S-01-green.log) | 4 Okt 03:31:59–03:32 WIB | fix 43c3c37; HEAD/diff di log | Constructor/grant/signer/admin terakhir | FHEVM mock | Konflik dan pelepasan admin terakhir ditolak | Backend belum tiga operator independen | B.3, D.2; 5.3 | Eksklusivitas role dan adminCount. |
| B-04 | ID penerbit | [merah](evidence/remediation/S-03-red.log), [hijau](evidence/remediation/S-03-green.log) | 4 Okt 03:33:52–03:34 WIB | cfd6514 | Signer B memakai ID A | FHEVM mock | Baseline menerima, v2 menolak | Binding chain/kontrak/issuer/signer/nonce | B.4, D.2; 5.3 | Remediasi perebutan ID. |
| B-05 | Nama issuer | [reproduksi](evidence/remediation/S-04-baseline-repro.log), [hijau](evidence/remediation/S-04-green.log) | 4 Okt 03:35:21–03:39 WIB | 131dcbb, 8d7bbcc | Nama registry berubah saat otorisasi pending | FHEVM mock | Payload lama ditolak | Bukan uji mempool Sepolia | B.4, D.2; 5.3 | issuerNameHash dan domain v2. |
| B-06 | ACL privat | [merah](evidence/remediation/S-05-red.log), [hijau](evidence/remediation/S-05-green.log) | 4 Okt 03:21:02–03:24 WIB | 8bb71ce | Cek ACL referensi/hasil | FHEVM mock | Referensi allowThis saja | ACL v1/hasil lama tidak dicabut retroaktif | D.2, E.1; 5.3–5.4 | Izin referensi terpisah dari hasil. |
| B-07 | Signature/registry | [S-09 merah](evidence/remediation/S-09-red.log), [hijau](evidence/remediation/S-09-green.log), [S-10 merah](evidence/remediation/S-10-red.log), [hijau](evidence/remediation/S-10-green.log) | 4 Okt 03:25–03:30 WIB | 07f627a, a5c3589 | Invalid/high-s, UTF-8, no-op | FHEVM mock | Error konsisten, no-op ditolak | S-09 konsistensi error, bukan penerimaan signature palsu | C.1, D.2; 5.3 | Validasi batas dan hasil operasi. |
| B-08 | Debugging C.2 | [selector](evidence/debugging/C2-02-decode-selectors.log), [compile](evidence/debugging/C2-03-repro-old-script-run1-compiles.log), [cache](evidence/debugging/C2-03-repro-old-script-run2-cached.log), [fix](evidence/debugging/C2-04-fixed-script-first-run.log) | 4 Okt 03:28:03–03:28 WIB | 3a8c1c4; HEAD/diff di log | Reproduksi provider/build-info | tooling/mock | 0xb41ba2d6 = UnauthorizedIssuer; build terpisah lulus | Instrumentasi coverage masih perlu retry cache | C.2; 5.2 | Gejala, akar masalah, dan verifikasi. |
| B-09 | DB atomik | [DB final](evidence/final/05-test-db.log) | 4 Okt 22:17:20–22:17:24 WIB | 8a13faa | Docker verifikasi-uas-pg/verifikasi_test | PostgreSQL nyata lokal | 9/9 | Bukan Supabase/kapasitas hosting | C.1, E.2; 5.2–5.4 | Migrasi, persistensi, row lock, budget, rollback, lease/fencing, cleanup. |
| B-10 | Bottleneck JSONB | [benchmark](evidence/measurements/S-12-state-row-benchmark.log), [skrip](evidence/measurements/S-12-bench-state.ts.txt) | 4 Okt 16:40:43 WIB | e680d5e | 500 sesi/200 job, 200 operasi × 4 konkurensi | DB nyata lokal | 800/800, 78,7–108,7 op/s, 0 lost update | Satu eksperimen laptop; bukan throughput chain | E.1–E.2; 5.4 | Throughput mendatar dan antrean tumbuh. |
| B-11 | Checkout bersih | [konteks](evidence/final/verification-context.json), [install](evidence/final/01-install.log), [lint](evidence/final/02-lint.log), [types](evidence/final/03-typecheck.log), [build](evidence/final/06-build.log) | 4 Okt 22:14:33–22:18:48 WIB | 8a13faa | Worktree awal bersih, frozen lockfile, demo | lokal nyata | Seluruh exit 0, compile/trace OCR+SDK lulus | Belum packaging/deploy Netlify final | C.3–C.4, G.1; 2, 5.2 | Reproduksi tanpa env produksi. |
| B-12 | Unit final | [log](evidence/final/04-test.log), [hasil mesin](evidence/final/verification-results.json) | 4 Okt 22:15:49–22:17:20 WIB | 8a13faa | pnpm test | mock + PDF/OCR nyata lokal | 417 = 34+52+14+45+71+201 | Unit chain memakai mock | C.1, G.4; 5.2 | Jumlah per suite final. |
| B-13 | E2E lokal | [log](evidence/final/07-test-e2e.log) | 4 Okt 22:18:48–22:19:34 WIB | 8a13faa | CI=1, demo, localhost:3000 | mock UI/browser nyata | 25 lulus, 12 Sepolia skip | Sepolia nyata terpisah B-18 | C.4, F.1; 5.2 | Portal, sesi, PDF, tiga viewport. |
| B-14 | Coverage final | [log](evidence/final/08-coverage.log), [raw JSON](evidence/final/coverage/), [cakupan](TEST_RESULTS.md) | 4 Okt 22:19:34–22:22:52 WIB | 8a13faa | Istanbul Solidity/V 8 src/** | mock/unit | Kontrak 100% empat metrik; web statement 58,89% | Awal 12 lulus/22 gagal decode, retry 34 lulus; DB/E2E di luar V 8; tanpa threshold | C.1–C.2, G.4; 5.2 | Coverage beserta batasnya. |
| B-15 | Deployment v2 | [record](DEPLOYMENT_RECORD.md), [receipt](evidence/sepolia/receipts-deploy-and-registry.json), [JSON](../../contracts/deployments/sepolia/0x65b1C8C7B59D9651F8619F287Bc1c309FaE094e0.json) | blok 4 Okt 15:58:48 WIB /08:58:48 UTC | v2 0x65b1…94 e 0, 11841227 | uas:deploy, role terpisah | Sepolia | tx 0x4340…0258; 3.041.734 gas; status 1 | SepETH; dua konfirmasi aplikasi bukan finalitas | C.3, G.5; 5.2 | Identitas kontrak dan build. |
| B-16 | Source match | [log](evidence/sepolia/verify-source-sourcify-v2.log), [record](DEPLOYMENT_RECORD.md) | 4 Okt 16:02:47–16:03:01 WIB | 6673e51, v2 | Sourcify API v2 setelah plugin 404 | verifikasi testnet | Creation/runtime exact_match | Etherscan tidak dicoba | C.3, D.2, G.5; 5.2 | Source cocok dengan bytecode. |
| B-17 | Registry reuse | [receipt](evidence/sepolia/receipts-deploy-and-registry.json), [state/no-op](evidence/sepolia/e2e-run-2026-10-04T14-53-27-678Z/sepolia-e2e-evidence.json) | tx 4 Okt 16:40:24/16:41:00 WIB; cek 21:53:45 | 018614f, f32afe6; issuer d 4 aadc…62 ab | Registry UI awal, confirmed read saat ulang | Sepolia | 399 a…a 43 e aktif auth 1; no-op tanpa tx | Tidak mengaktifkan signer pada dua institusi | B.3, C.4; 5.1–5.2 | Fixture registry dapat dipakai ulang. |
| B-18 | UI Sepolia penuh | [log](evidence/sepolia/e2e-run-2026-10-04T14-53-27-678Z/playwright.log), [JSON](evidence/sepolia/e2e-run-2026-10-04T14-53-27-678Z/sepolia-e2e-evidence.json), [konteks](evidence/sepolia/e2e-run-2026-10-04T14-53-27-678Z/execution-context.json) | 4 Okt 21:53:27–22:02:49 WIB | f32afe6, v2 | UI+bridge EIP-6963, signing Node, DB lokal | Sepolia/browser/OCR nyata | 12/12; 3 issue+3 verify+1 revoke | Bukan uji ekstensi MetaMask pengguna | C.4, F.1, G.3; 5.2, 5.5 | Run penuh dengan data sintetis. |
| B-19 | Penerbitan/QR | [PDF A](evidence/sepolia/e2e-run-2026-10-04T14-53-27-678Z/ijazah-A.pdf), [portal](evidence/sepolia/e2e-run-2026-10-04T14-53-27-678Z/04-issued-A.png), [QR](evidence/sepolia/e2e-run-2026-10-04T14-53-27-678Z/05-qr-record-A.png) | 4 Okt 21:55:14–21:58:05 WIB | f32afe6; A d8209586…f 56362 | EIP-712 issue, arsip PDF langsung, GET QR | Sepolia | A/B/C terbit; VERIFIED_RECORD/RECORD_ONLY, decision null, tanggal privat | QR hanya mengesahkan rekaman | B.4, C.4, F.1; 5.1–5.2 | Profil signer dan QR tanpa tx. |
| B-20 | FHE MATCH | [UI](evidence/sepolia/e2e-run-2026-10-04T14-53-27-678Z/upload-A-original.png), [dekripsi](evidence/sepolia/fhe-decryption-confirmation.json), [receipt](evidence/sepolia/receipts-e2e.json) | UI 4 Okt 21:59:22; ulang 22:07 WIB | f32afe6; tx0x2a57…1 a 84 | Upload PDF A, userDecrypt | Sepolia/Zama nyata | T/T/T/T, agregat T; 1.002.250 gas | Backend tetap melihat OCR plaintext | C.4, E.1, F.1; 5.2 | Empat atribut cocok pada record aktif. |
| B-21 | Nama berubah | [UI](evidence/sepolia/e2e-run-2026-10-04T14-53-27-678Z/upload-A-name-changed.png), [fixture](evidence/sepolia/e2e-run-2026-10-04T14-53-27-678Z/ijazah-A-name-changed.pdf), [dekripsi](evidence/sepolia/fhe-decryption-confirmation.json) | UI 4 Okt 22:00:33; ulang 22:07 WIB | f32afe6; tx0x62e1…1 ec 5 | Nama berbeda, QR A tetap | Sepolia/Zama nyata | F/T/T/T, agregat F, MISMATCH | Hanya empat atribut diperiksa | C.4, F.1; 5.2 | Perubahan satu atribut ditemukan. |
| B-22 | QR B/atribut A | [UI](evidence/sepolia/e2e-run-2026-10-04T14-53-27-678Z/upload-QR-B-attributes-A.png), [fixture](evidence/sepolia/e2e-run-2026-10-04T14-53-27-678Z/ijazah-QR-B-attributes-A.pdf), [dekripsi](evidence/sepolia/fhe-decryption-confirmation.json) | UI 4 Okt 22:01:56; ulang 22:07 WIB | f32afe6; tx0x3878…3 a 92 | Compare terhadap record B | Sepolia/Zama nyata | F/F/F/F, agregat F, MISMATCH | QR sah tidak menjamin isi sesuai | C.4, F.1; 5.2 | Rekaman rujukan QR menjadi target. |
| B-23 | Penolakan tanpa tx | [event scan](evidence/sepolia/no-transaction-rejection-confirmation.json), [target](evidence/sepolia/e2e-run-2026-10-04T14-53-27-678Z/upload-B-on-expected-A.png), [QR asing](evidence/sepolia/e2e-run-2026-10-04T14-53-27-678Z/upload-foreign-fixture.png) | UI 4 Okt 22:00–22:02; scan 22:08 WIB | f32afe6; blok 11842837–11842905 | Hash job null+event set interval | Sepolia/pipeline nyata | Tepat 3 valid compare; target/asing/revoked tanpa compare | Saldo/kuota diuji terkontrol lokal | C.1, D.2, F.1; 5.2–5.3 | Penolakan sebelum broadcast. |
| B-24 | Pencabutan C | [portal](evidence/sepolia/e2e-run-2026-10-04T14-53-27-678Z/06-revoked-in-portal.png), [QR](evidence/sepolia/e2e-run-2026-10-04T14-53-27-678Z/07-qr-record-C-revoked.png), [upload](evidence/sepolia/e2e-run-2026-10-04T14-53-27-678Z/upload-C-after-revocation.png), [receipt](evidence/sepolia/receipts-e2e.json) | 4 Okt 22:02:36–22:02:41 WIB | f32afe6; tx0x48da…d 501, blok 11842877 | Revoke UI, QR/PDF/upload | Sepolia | CredentialRevoked; REVOKED; PDF 409; tanpa compare | Bukti penerbitan historis tetap ada | B.4, C.4, D.2; 5.2–5.3 | Akibat pencabutan konsisten. |
| B-25 | Sesi/hasil PDF | [history](evidence/sepolia/e2e-run-2026-10-04T14-53-27-678Z/08-history.png), [PDF aplikasi](evidence/sepolia/e2e-run-2026-10-04T14-53-27-678Z/laporan-hasil-MATCH.pdf), [JSON](evidence/sepolia/e2e-run-2026-10-04T14-53-27-678Z/sepolia-e2e-evidence.json) | 4 Okt 22:02:42 WIB | f32afe6 | Sesi pemilik vs browser lain | API/browser nyata | 6 job; report 200 application/pdf; asing 401 | Report aplikasi, bukan laporan akademik | C.4, E.1, F.1; 5.2 | Hasil milik sesi pemilik. |
| B-26 | Legacy v1 | [QR lama](evidence/sepolia/e2e-run-2026-10-04T14-53-27-678Z/09-legacy-v1-record.png), [config](DEPLOYMENT_RECORD.md) | 4 Okt 22:02:48 WIB | f32afe6; v1 0x39de…4903, cutoff 11841226 | Signed proof lama seed DB lokal+baca v1 | Sepolia read-only | VERIFIED_RECORD/RECORD_ONLY, legacy true | Tanpa FHE baru; setelah cutoff tidak dipercaya | C.4, G.5; 5.2 | Bukti/domain historis tetap terbaca. |
| B-27 | Durasi tahap | [raw whitelist](evidence/measurements/sepolia-ui-stage-timings.json), [receipt](evidence/sepolia/receipts-e2e.json) | run 4 Okt 21:25–21:32/21:53–22:02 WIB | 018614f, f32afe6 | Job/step/event timestamp, dua run | workflow/OCR nyata+Sepolia | 11 observasi, 6 compare, n=2/fixture, retries 0 | checkedAt timestamp blok; tahap komposit bukan CPU/FHE murni | E.2; 2, 5.4 | Batas timer dan sampel kecil. |
| B-28 | Dekripsi ulang | [JSON](evidence/sepolia/fhe-decryption-confirmation.json), [collector](../../scripts/collect-sepolia-decryption.mjs) | 4 Okt 22:07:02–22:07:40 WIB | collector SHA di JSON | Binding receipt/reader role, SDK userDecrypt | Zama/Sepolia nyata | 6 sampel 3,125–5,047 s; bool sesuai UI | Follow-up/cache; bukan durasi dekripsi UI asli | C.4, E.2; 5.2–5.4 | Read-only tanpa tx baru. |
| B-29 | Diagnosis gagal | [awal](evidence/sepolia/e2e-run-2026-10-04T09-30-14-561Z/playwright.log), [bucket](evidence/sepolia/e2e-run-2026-10-04T09-40-02-443Z/playwright.log), [env](evidence/sepolia/e2e-run-2026-10-04T14-23-59-473Z/playwright.log), [parsial](evidence/sepolia/e2e-run-2026-10-04T14-25-01-445Z/playwright.log), [RPC](evidence/sepolia/e2e-run-2026-10-04T14-37-04-887Z/playwright.log) | 4 Okt 16:30/16:40/21:23/21:25/21:37 WIB | lihat TEST_RESULTS/konteks | Env, fixture, allowlist, transport bounded | layanan nyata/tooling | Lima run gagal/terhenti dipertahankan; final 12/12 | Parsial tidak dianggap penerimaan penuh | C.2; 3, 5.2 | Jejak diagnosis sebelum final. |
| B-30 | Video nyata | [MP4](evidence/sepolia/e2e-run-2026-10-04T14-53-27-678Z/Video_Demo_Sepolia.mp4), [WebM](evidence/sepolia/e2e-run-2026-10-04T14-53-27-678Z/Video_Demo_Sepolia.webm), [QA](evidence/sepolia/e2e-run-2026-10-04T14-53-27-678Z/video-metadata.json) | capture 4 Okt 21:53–22:02 WIB; konversi metadata | f32afe6 | Playwright recording+FFmpeg verified, full decode | UI Sepolia nyata | 555,88 s; 1280×900; H.264; 13.897 frame | Tidak dipotong/dipercepat; wallet uji | F.1, G.9; 5.5 | Demo run yang menghasilkan receipt. |
| B-31 | Dependensi/struktur | [guard](evidence/final/dependency-guard.json), [lockfile](../../pnpm-lock.yaml), [struktur](../../scripts/check-structure.mjs) | 4 Okt 22:17:58 WIB; UTC JSON | 8a13faa | 25 aturan denylist, diffmanifest/protectedconfig | kode/lockfile | 0 hit; 0 paket baru; 7 workspace | Bukan supply-chain audit menyeluruh | H–J; 2, 5.5 | Versi terkunci dan monorepo. |
| B-32 | Diagram editable | [arsitektur](diagrams/architecture.mmd), [alur](diagrams/transaction-flow.mmd) | review 4 Okt, T5 | implementasi 8a13faa | Cocokkan flow/role/ACL | kode | Sumber Mermaid; render T6 di status | Bukan bukti hosting | B.2, G.7; 5.1 | Sumber arsitektur dan transaksi. |

## Data identitas dan kontribusi untuk template

| Identitas | Isian |
| --- | --- |
| Jenis/judul | UAS kelompok / Verifikasi Ijazah — Degree E-Sign and Verifier dengan Zama FHE |
| Mata kuliah/kode | Blockchain / KP70067008 (instruksi utama) |
| Semester/dosen | 7 / Dr. Ir. Nur Widiyasono, M.Kom. (instruksi utama) |
| Tanggal bukti | 4 Oktober 2026 WIB; sebagian UTC mentah 3 Oktober karena zona |
| Nama/NPM/kelas/anggota | Belum diberikan; jangan diturunkan dari author Git atau nama folder |
| Riwayat | Mulai 96b4a08 salinan ZIP; efa663b hulu tidak tersedia. Snapshot 8a13faa: git shortlog -sn HEAD =33 commit author “Maul”, bukan identitas anggota terverifikasi |

| Anggota | Tugas/kontribusi | Commit/bukti | Bagian yang dipresentasikan |
| --- | --- | --- | --- |
| Author Git “Maul”; belum dipetakan ke identitas anggota | Kode, tes, remediasi/evidence yang tercatat | Git nyata sejak 96 b 4 a 08; B-01–B-31 | Belum diberikan |
| Anggota lain | Data belum ada; kontribusi luar Git tidak disimpulkan tidak ada | Memerlukan bukti pengguna | Belum diberikan |

## Data alat dan kegiatan untuk tabel 2 dan 3

| Komponen | Keterangan/rujukan |
| --- | --- |
| Lingkungan | Windows 11, Node 24.21.0, pnpm 10.19.0, Playwright Chromium, Docker PostgreSQL 16-alpine; engine repo≥22.12 |
| Stack | Versi README/FAKTA/lockfile; solc 0.8.28 optimizer 200 viaIR cancun, Hardhat 2.28.6, ethers 6.16.0, SDK 0.4.1 |
| Chain | Sepolia 11155111; v2 0x65b1C8C7B59D9651F8619F287Bc1c309FaE094e0; v1 read-only cutoff 11841226 |
| Fixture | A ANDI PRATAMA, B BUDI SANTOSO, C CITRA LESTARI; UAS/2026/A001, B002, C003; PDF asli/nama berbeda/QR ditukar/QR asing; tanggal sintetis privat di PDF, tidak pada profil publik |
| Reproduksi | README/DEMO; B-11–B-14 bersih, B-18 nyata. Kunci luar repo, DB hanya lokal, legacy memakai signed-proof seed lokal |

| Tanggal/tahap | Kegiatan yang dilakukan | Hasil dan rujukan bukti |
| --- | --- | --- |
| 4 Okt 03:13–03:39 WIB | Baseline, debugging, reproduksi/remediasi | B-01–B-08; HEAD/diff aktual di log |
| 4 Okt 15:58–16:41 WIB | Deploy/source/registry; benchmark S-12 | B-10, B-15–B-17 |
| 4 Okt 16:30–21:49 WIB | Diagnosis E2E env/fixture/transport | B-29; 018614f, 5ab6f09, f32afe6 |
| 4 Okt 21:53–22:13 WIB | UI penuh, receipt/dekripsi/timing/video | B-18–B-30; 8a13faa |
| 4 Okt 22:14–22:22 WIB | Verifikasi bersih dan coverage | B-09, B-11–B-14; 8/8 exit 0 |
| Setelah verifikasi | T5 dokumentasi, T6 render, T7 scan/arsip, T8 cleanup | Waktu/commit di status dan metadata |

## Data untuk tabel teknis 5.1–5.5

| Data/fungsi | On-chain atau off-chain | Aktor/hak akses | Alasan teknis |
| --- | --- | --- | --- |
| Registry, role, signer history, ID, status | On-chain | Admin registry/role; signer aktif issue/revoke; metadata dapat dibaca umum | Otoritas, jejak, status bersama |
| Empat hash atribut euint256 | On-chain terenkripsi | ACL v2 kontrak saja | SHA-256 penuh domain per field, FHE.eq |
| Empat ebool dan agregat | On-chain terenkripsi | Kontrak+reader yang diberi ACL saat verify | Backend mengembalikan boolean, ACL historis tetap |
| E-sign/profile/proof; PDF arsip | Off-chain | Profil dan bundle signed yang tervalidasi publik; row lengkap backend privat; PDF untuk signer aktif institusi + record aktif | Payload immutable, arsip langsung tanpa OCR |
| Upload, OCR, sesi/job, outbox, report | Off-chain privat | Backend tepercaya; sesi pemilik hasil | CSRF/Origin, TTL/tombstone/lease; backend melihat plaintext |

| ID tes | Skenario positif/negatif/batas/akses | Ekspektasi | Hasil | Bukti |
| --- | --- | --- | --- | --- |
| SC-S-01/S-02 | Konflik role/signer, admin terakhir, rotasi | Ditolak/pengganti berfungsi | Lulus mock | B-03, TEST_RESULTS |
| SC-S-03/S-04/S-05 | ID, nama issuer, ACL | Binding dan izin sesuai | Lulus mock | B-04–B-06 |
| SC-T02 | Signature, deadline tepat/±1 s, nol/versi/UTF-8, paginasi, status/event | Batas diterapkan | 29 kontrak+5 tooling lulus | B-07, B-12 |
| DB-FINAL | Row lock, budget, lease/fencing, cleanup | Atomik lintas pool | 9 lulus | B-09 |
| UI-LOCAL | Portal, sesi, PDF, QR, viewport | UI sesuai mode mock | 25 lulus+12 Sepolia skip | B-13 |
| UI-SEPOLIA | Issue/QR/FHE/reject/revoke/history/legacy | Hasil nyata sesuai scope | 12 lulus | B-18–B-26 |

Tabel 5.3 menggunakan seluruh S-01–S-15 dari CATATAN: ID temuan←ID; Bukti/dampak←Bukti reproduksi+Dampak; Kemungkinan/risiko←Kemungkinan+Tingkat+Risiko residual; Perbaikan/commit←Mitigasi/perubahan; Retest/status←Retest+Keputusan. A-01–A-08 tetap informasi debugging/operasional, bukan otomatis celah keamanan.

Tabel 5.4 menggunakan fakta tujuh aspek E.1 dalam FAKTA dan B-10, B-15, B-20–B-28. Ethereum yang diuji adalah Sepolia. Fabric adalah alternatif dokumentasi yang belum diimplementasi/diukur. Pilihan aktual repo EVM+Zama dengan satu backend tepercaya; keputusan rekomendasi akhir disusun ChatGPT. Data anggota/presentasi 5.5 tersedia pada tabel kontribusi, dengan isian belum diberikan dinyatakan jelas.

Data dokumentasi untuk tabel 5.4 di bawah dibaca 4 Oktober 2026, 22:43–22:44 WIB (15:43–15:44 UTC), dari Fabric Docs main/latest. Tidak ada Fabric terpasang atau diuji. Kolom keputusan menyatakan pilihan kode yang sudah ada; rekomendasi akhir tetap tahap ChatGPT.

| Aspek | Public/Ethereum yang dipakai | Permissioned/Fabric — fakta dokumentasi | Keputusan aktual untuk kasus |
| --- | --- | --- | --- |
| Identitas dan izin | Wallet EOA, registry issuer, role aplikasi; publik membaca QR. Validator Sepolia berizin, berbeda dari permissioning aplikasi; [jaringan Ethereum](https://ethereum.org/developers/docs/networks/). | CA/certificate dan MSP mengikat identitas pada organisasi/role; akses node/channel ditentukan policy; [MSP](https://hyperledger-fabric.readthedocs.io/en/latest/membership/membership.html). | EOA, AccessControl, dan signer history diterapkan. Identitas institusi tetap onboarding operator. |
| Konsensus dan throughput | Jaringan Sepolia dan minimal dua konfirmasi aplikasi; tidak menjalankan validator atau mengukur TPS jaringan. Benchmark B-10 hanya DB lokal. | Ordering terpisah dari endorsement/validasi peer; tersedia Raft dan BFT berbasis SmartBFT. Throughput bergantung konfigurasi, tanpa angka yang diuji repo; [ordering](https://hyperledger-fabric.readthedocs.io/en/latest/orderer/ordering_service.html). | Konfirmasi bounded, retry/outbox/lease relayer; tidak mengganti konsensus jaringan. |
| Privasi dan biaya | Referensi/hasil FHE ber-ACL; metadata/profil publik, backend melihat plaintext. Gas/fee SepETH dalam receipt, tanpa harga rupiah/produksi. | Private-data collections membagikan nilai kepada peer berwenang; hash masuk ledger channel; [private data](https://hyperledger-fabric.readthedocs.io/en/latest/private-data/private-data.html). Biaya infrastruktur tidak diukur. | Tanggal privat, proof/profil publik terpisah, retensi unggahan terbatas; risiko operator/publikasi tetap dicatat. |
| Governance dan upgrade | Admin registry/role, last-admin guard, kontrak immutable; protokol baru redeploy dan allowlist v1/cutoff. Sengketa institusi belum ditetapkan. | Organisasi approve definisi chaincode dan commit sesuai LifecycleEndorsement policy, default majority; update melalui lifecycle; [lifecycle](https://hyperledger-fabric.readthedocs.io/en/latest/chaincode_lifecycle.html). | Tooling grant→verify→renounce dan pembacaan historis; tanpa proxy/governance konsorsium. |

## Luaran tertunda

| Pihak | Kebutuhan |
| --- | --- |
| Pengguna | Nama/NPM/kelas/anggota/kontribusi; penyelarasan Netlify serta validasi header/storage namespace uji menurut DEMO |
| ChatGPT | Laporan UAS sesuai template, audit formal PDF, desain singkat, matriks/rekomendasi enterprise, evaluasi 2–3 halaman, slide≤10 |
| CI remote | Belum ada bukti run jarak jauh diperiksa; keberadaan workflow bukan bukti lulus |

Handoff ini dapat dipakai tanpa menganggap produksi sudah dimigrasi. PDF hasil aplikasi dan video adalah evidence demonstrasi, bukan pengganti luaran akademik.
