# Hasil pengujian UAS Blockchain

## Revisi confidence OCR — 5 Oktober 2026

Source aplikasi **`1413ebd424a7a914967ad6301c648c5c58842a1d`**, worktree awal bersih, **00:46:25–00:55:30 WIB** (UTC mentah 4 Oktober pada log). Instalasi beku, lint, typecheck, test, test:db, build, test:e2e, dan coverage: **8/8 exit 0**. Node 24.21.0/pnpm 10.19.0; mode demo tanpa env produksi, PostgreSQL Docker lokal `verifikasi-uas-pg`/`verifikasi_test`. [Konteks/perintah/durasi](evidence/ocr-policy-70/final/verification-context.json), [hasil mesin dan hash coverage](evidence/ocr-policy-70/final/verification-results.json).

Kebijakan [OCR 70%](PERUBAHAN_KEBIJAKAN_OCR_70.md): confidence menolak hanya bila keempat skor valid semuanya <0,70. Satu skor ≥0,70 cukup untuk melewati gate confidence; tidak ada gate rata-rata. Empat teks dan syarat non-confidence tetap wajib. Data akademik, normalisasi, dan keputusan FHE tetap.

| Suite revisi | Lulus | Gagal | Skip | Tingkat bukti |
| --- | ---: | ---: | ---: | --- |
| Kontrak/tooling | 34 | 0 | 0 | FHEVM mock, 29 kontrak+5 tooling; kontrak tidak diubah |
| Domain | 79 | 0 | 0 | Unit terkontrol; semua-vs-satu, tepat70, invalid dan gate lainnya |
| Credentials | 14 | 0 | 0 | Unit signature/hash |
| OCR | 95 | 0 | 0 | Parser/reread terkontrol dan mesin OCR/QR nyata lokal |
| Chain | 71 | 0 | 0 | Unit adapter/mock, tanpa transaksi Sepolia baru |
| Web | 222 | 0 | 0 | Pipeline/workflow terkontrol; PDF/OCR nyata lokal; render UI static |
| Total unit/kontrak | **515** | **0** | **0** | [log unit](evidence/ocr-policy-70/final/04-test.log) |
| PostgreSQL lokal | 9 | 0 | 0 | [DB nyata lokal](evidence/ocr-policy-70/final/05-test-db.log), tidak memakai Supabase |
| Browser E2E lokal | 25 | 0 | 12 | [E2E](evidence/ocr-policy-70/final/07-test-e2e.log); 12 Sepolia opt-in dilewati |

Regresi membuktikan satu field rendah tetap dapat `MATCH`; tepat70 dengan rata-rata rendah tetap lanjut dan dapat `MISMATCH` menurut FHE. Semua skor <70 menghasilkan `INCONCLUSIVE` sebelum reservasi anggaran relayer/tx. Invalid/missing score tetap ditolak dan ditampilkan null, sedangkan skor valid0 dipertahankan. Crop invalid gagal teknis tanpa mengubah confidence asli. Pekerjaan hash lama tanpa transaksi memakai OCR ulang dari berkas asli; prepared/broadcast tx mempertahankan bukti untuk recovery. Penghapusan/digest/lease dan prioritas pencabutan tetap diuji.

Foto A1 sintetis dibaca mesin nyata: nama94,85%; nomor89,96%; prodi96,06%; tanggal96,54%, dengan teks dan QR tepat serta eligible=true. Benchmark minimum historis .899/.9 tetap dipertahankan sebagai regresi kualitas fixture; angka itu tidak menjadi gate produk. [Log OCR dalam run unit](evidence/ocr-policy-70/final/04-test.log) mencatat skor per field.

**Coverage di bawah mengukur cakupan kode oleh tes, bukan keberhasilan OCR, probabilitas dokumen asli, atau ambang confidence.** Metode, include `src/**`, defaults/exclusions dan batas unit-only identik dengan snapshot 4 Oktober pada bagian3 di bawah; konfigurasi diverifikasi lagi dalam hasil mesin. Tidak ada threshold coverage baru.

| Workspace | Statements | Branches | Functions | Lines | JSON |
| --- | --- | --- | --- | --- | --- |
| Kontrak | 100% (99/99) | 100% (132/132) | 100% (18/18) | 100% (132/132) | [contracts](evidence/ocr-policy-70/final/coverage/contracts-coverage-summary.json) |
| Web | 63,81% (2159/3383) | 80,85% (1195/1478) | 78,29% (184/235) | 63,81% (2159/3383) | [web](evidence/ocr-policy-70/final/coverage/web-coverage-summary.json) |
| Domain | 94,37% (319/338) | 96,77% (180/186) | 75,86% (22/29) | 94,37% (319/338) | [domain](evidence/ocr-policy-70/final/coverage/domain-coverage-summary.json) |
| Credentials | 97,90% (187/191) | 89,33% (67/75) | 100% (26/26) | 97,90% (187/191) | [credentials](evidence/ocr-policy-70/final/coverage/credentials-coverage-summary.json) |
| OCR | 97,31% (435/447) | 89,67% (191/213) | 90,62% (29/32) | 97,31% (435/447) | [ocr](evidence/ocr-policy-70/final/coverage/ocr-coverage-summary.json) |
| Chain | 80,07% (434/542) | 84,11% (233/277) | 79,54% (35/44) | 80,07% (434/542) | [chain](evidence/ocr-policy-70/final/coverage/chain-coverage-summary.json) |

Coverage kontrak percobaan pertama **12 lulus/22 gagal** akibat dekode custom error saat instrumentasi; retry cache terbatas menghasilkan **34 lulus/0 gagal**. Dua percobaan tersimpan di [log coverage](evidence/ocr-policy-70/final/08-coverage.log); exit final0 tidak berarti percobaan pertama lulus. Build/trace OCR dan SDK lulus. Worktree akhir memiliki artefak generated next-env dan screenshot, tercatat dalam konteks.

Kebijakan baru belum diuji melalui transaksi Sepolia baru atau deployment Netlify. FHE `MATCH`/`MISMATCH` revisi ini dibuktikan dengan mock terkontrol; OCR, PDF, browser dan PostgreSQL lokal memakai komponen nyata. Bukti 12 UI Sepolia/video/gas di bawah tetap snapshot **4 Oktober**, memakai kebijakan lama. Run CI remote tetap belum diamati.

## Snapshot historis — 4 Oktober 2026

Tanggal: **4 Oktober 2026**, zona WIB (UTC+07:00). Verifikasi lokal saat itu memakai `8a13faaaac696700c8018cc6c947682028393afc`; skenario Sepolia lengkap memakai `f32afe67b39af7b38e524e263bc63b5a0973c5a6`. Hingga `d4415d3` perubahan sesudah run berupa dokumen/evidence. Perubahan perilaku 70% pada `1413ebd` beserta retestnya tercatat terpisah di atas; angka historis berikut dipertahankan.

## 1. Lingkungan dan hasil final

Worktree final terpisah dimulai bersih, memakai Node **24.21.0**, pnpm **10.19.0**, dan instalasi lockfile beku. Mode aplikasi `demo`; tes database memakai PostgreSQL 16 Docker `verifikasi-uas-pg`, host loopback port **54329**, database **verifikasi_test**. Tes tidak memakai Supabase. Hasil mentah dan exit code proses asli ada di [verification-context.json](evidence/final/verification-context.json); hasil per suite, konfigurasi coverage, dan hash artefak ada di [verification-results.json](evidence/final/verification-results.json).

| Perintah di root worktree | Mulai–selesai WIB | Durasi proses | Exit asli | Hasil |
| --- | --- | ---: | ---: | --- |
| `pnpm install --frozen-lockfile` | 22:14:33–22:15:15 | 41,806 detik | 0 | Lockfile dipakai tanpa pembaruan; [log](evidence/final/01-install.log) |
| `pnpm lint` | 22:15:15–22:15:19 | 4,407 detik | 0 | Pemeriksaan struktur dan ESLint; [log](evidence/final/02-lint.log) |
| `pnpm typecheck` | 22:15:19–22:15:49 | 30,296 detik | 0 | TypeScript workspace dan build kontrak/ABI; [log](evidence/final/03-typecheck.log) |
| `pnpm test` | 22:15:49–22:17:20 | 90,757 detik | 0 | 417 lulus, 0 gagal, 0 skip; [log](evidence/final/04-test.log) |
| `pnpm test:db` | 22:17:20–22:17:24 | 3,553 detik | 0 | 9 lulus, 0 gagal, 0 skip; [log](evidence/final/05-test-db.log) |
| `pnpm build` | 22:17:24–22:18:48 | 84,807 detik | 0 | Build dan pemeriksaan trace deployment; [log](evidence/final/06-build.log) |
| `pnpm test:e2e` | 22:18:48–22:19:34 | 45,126 detik | 0 | 25 lokal lulus, 12 Sepolia opt-in skip; [log](evidence/final/07-test-e2e.log) |
| `pnpm coverage` | 22:19:34–22:22:52 | 198,091 detik | 0 | Semua workspace selesai; kontrak membutuhkan retry yang dijelaskan di bagian 3; [log](evidence/final/08-coverage.log) |

Build juga berhasil memuat driver PostgreSQL, SDK Node Zama beserta WASM TFHE/TKMS, dan mesin OCR MuPDF/ZXing/Tesseract dengan data bahasa `ind+eng` dari salinan trace. Besar trace yang dilaporkan **161 MiB sebelum packaging platform**; angka ini bukan ukuran deployment Netlify. Worktree sesudah pengujian berisi perubahan `next-env.d.ts` yang dihasilkan Next.js dan screenshot hasil E2E; daftar lengkap dipertahankan dalam context. Artefak yang dihasilkan ini tidak menjadi perubahan source aplikasi final.

## 2. Matriks kategori dan suite

| Suite / tingkat bukti | Lulus | Gagal | Skip | Cakupan dan batas |
| --- | ---: | ---: | ---: | --- |
| Kontrak, Hardhat + FHEVM **mock lokal** | 34 | 0 | 0 | 29 tes kontrak + 5 tes tooling deployment/registry/rotasi. Digest 256 bit, pencocokan/dekripsi mock, event, akses role, replay, binding, batas deadline, pencabutan, rotasi, pemisahan peran, kontinuitas admin, dan pagination. Bukan transaksi Sepolia. |
| `packages/domain`, lokal | 52 | 0 | 0 | 4 berkas: normalisasi, parsing, keputusan dan validasi domain. |
| `packages/credentials`, lokal | 14 | 0 | 0 | 1 berkas: pengesahan EIP-712, profil publik, versi/domain, integritas dan identitas kredensial. |
| `packages/ocr`, **OCR nyata lokal** | 45 | 0 | 0 | 6 berkas: render, QR, parsing, confidence, scan/foto/PDF, variasi JPEG, perubahan empat atribut, dan lima halaman. Tidak melakukan FHE jaringan. |
| `packages/chain`, adapter lokal | 71 | 0 | 0 | 8 berkas: provider RPC, bounded retry, binding/policy layanan, pemulihan transaksi, pembacaan rekaman, dan browser wallet. Respons jaringan di tes adapter dikendalikan fixture/mock. |
| `apps/web`, unit lokal | 201 | 0 | 0 | 21 berkas: sesi/wallet, pipeline, storage, upload, kuota, workflow, PDF/OCR nyata dan API. Layanan eksternal yang diperlukan oleh unit test dimock. |
| PostgreSQL **nyata lokal**, integrasi | 9 | 0 | 0 | Persistensi Drizzle/migrasi, arsip kredensial, state atomik, lease bersamaan, expiry/fencing dan pelepasan setelah error. Schema acak dibuat/dihapus hanya di DB lokal; tidak fallback ke `DATABASE_URL`. |
| Browser E2E lokal | 25 | 0 | 12 | UI desktop/mobile, QR/status melalui API fixture, wallet EIP-6963 lokal, PDF/download, riwayat/penghapusan, dan unggahan OCR nyata yang berhenti aman tanpa testnet. 12 skip adalah seluruh suite Sepolia yang sengaja tidak diaktifkan. |
| Browser E2E **Sepolia nyata**, run terpisah | 12 | 0 | 0 | UI, wallet bridge dengan tanda tangan/transaksi nyata, OCR nyata, kontrak v2, FHE Zama nyata, dan rekaman v1. Database aplikasi tetap lokal. |

Kategori C.1 dapat ditelusuri sebagai berikut; satu tes dapat meliputi beberapa kategori sehingga baris ini tidak dijumlahkan menjadi jumlah tes baru.

| Kategori | Contoh yang benar-benar diuji | Rujukan |
| --- | --- | --- |
| Positif dan integrasi | Penerbitan yang sah, empat atribut cocok, PDF/QR, event dan hasil dekripsi | `contracts/test/VerifikasiIjazah.cjs`; `apps/web/tests/e2e/sepolia.spec.ts` |
| Negatif dan integritas | Signature rusak, perubahan payload/ciphertext, salah relayer/domain, nonce/request replay, perubahan tiap atribut termasuk bit digest tinggi | `contracts/test/VerifikasiIjazah.cjs`; `packages/credentials/tests`; `packages/chain/tests` |
| Batas | Tepat deadline diterima / satu detik lewat ditolak, zero/version invalid, byte-length input, pagination kosong/tepat/lebih/clamp, batas upload dan OCR | Tes T-02 kontrak; `packages/ocr/tests`; `apps/web/tests/unit/uploads.test.ts` |
| Kontrol akses | Admin terakhir, role/signer saling eksklusif, pembaca hasil, pergantian wallet/jaringan, sesi lain ditolak, PDF kredensial dicabut ditolak | Tes S-01/S-02 dan T-02 kontrak; tes sesi/API; E2E Sepolia |
| Concurrency dan retry | Satu lease dari request bersamaan, pemilik kedaluwarsa tidak menghapus lease pengganti, action di luar transaksi SQL, pemulihan broadcast tanpa pengiriman ganda | `apps/web/tests/integration/database.test.ts`; `packages/chain/tests/recovery.test.ts` |

## 3. Coverage final dan pengecualian

Angka di bawah berasal dari enam **coverage-summary JSON asli** yang disalin tanpa perubahan, bukan pembulatan dari tabel konsol. Persentase sesuai keluaran provider; format `covered/total`. Hash SHA-256 tersedia di `verification-results.json`.

| Workspace | Statements | Branches | Functions | Lines | JSON |
| --- | --- | --- | --- | --- | --- |
| Kontrak | 100% (99/99) | **100% (132/132)** | 100% (18/18) | 100% (132/132) | [contracts](evidence/final/coverage/contracts-coverage-summary.json) |
| Web | 58,89% (1983/3367) | 80,70% (1121/1389) | 77,82% (179/230) | 58,89% (1983/3367) | [web](evidence/final/coverage/web-coverage-summary.json) |
| Domain | 93,92% (309/329) | 94,21% (163/173) | 75,86% (22/29) | 93,92% (309/329) | [domain](evidence/final/coverage/domain-coverage-summary.json) |
| Credentials | 97,90% (187/191) | 89,33% (67/75) | 100% (26/26) | 97,90% (187/191) | [credentials](evidence/final/coverage/credentials-coverage-summary.json) |
| OCR | 91,41% (394/431) | 85,79% (145/169) | 86,66% (26/30) | 91,41% (394/431) | [ocr](evidence/final/coverage/ocr-coverage-summary.json) |
| Chain | 80,07% (434/542) | 84,11% (233/277) | 79,54% (35/44) | 80,07% (434/542) | [chain](evidence/final/coverage/chain-coverage-summary.json) |

Kontrak memakai `solidity-coverage 0.8.17`, [`solcover.config.cjs`](../../contracts/solcover.config.cjs), `configureYulOptimizer: true`, dan `skipFiles: []`. Source aplikasi yang diinstrumentasi adalah `contracts/src/VerifikasiIjazah.sol`; dependency OpenZeppelin/FHEVM dan script JavaScript tooling tidak menjadi denominator Solidity. [Coverage mentah](evidence/final/coverage/contracts-coverage.json) dan [LCOV](evidence/final/coverage/contracts-lcov.info) tersedia. Coverage FHEVM tetap mock lokal. Angka branches historis **131/132 (99,24%)** bukan hasil final ini.

Web/domain/credentials/OCR memakai Vitest **3.2.7**, chain **3.2.4**, provider **V8**, `--coverage.include=src/**`, `all: true`, dan `allowExternal: false`. Web hanya menjalankan `tests/unit/**/*.test.ts`; coverage tidak menggabungkan tes DB, E2E browser, atau Sepolia. File source yang tidak dieksekusi ikut dihitung. UI, beberapa route, workflow wrapper, dan jalur penyimpanan nyata yang tidak dieksekusi unit test berkontribusi pada coverage web yang lebih rendah; tes browser/DB terpisah tidak membuat denominator tersebut hilang.

Tidak ada pengecualian source tambahan untuk menaikkan angka dan tidak ada ambang coverage yang dikonfigurasi. Pengecualian bawaan Vitest kedua versi identik dan disimpan persis dalam `verification-results.json`:

```text
coverage/**
dist/**
**/node_modules/**
**/[.]**
packages/*/test?(s)/**
**/*.d.ts
**/virtual:*
**/__x00__*
**/\0* (karakter NUL; JSON menyimpan \u0000)
cypress/**
test?(s)/**
test?(-*).?(c|m)[jt]s?(x)
**/*{.,-}{test,spec,bench,benchmark}?(-d).?(c|m)[jt]s?(x)
**/__tests__/**
**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*
**/vitest.{workspace,projects}.[jt]s?(on)
**/.{eslint,mocha,prettier}rc.{?(c|m)js,yml}
```

Dengan include `src/**`, berkas di luar source tidak masuk cakupan. Pola dot-path mengecualikan route Workflow hasil generasi `src/app/.well-known/workflow`. Deklarasi `.d.ts` dikecualikan; berkas biasa `types.ts` tidak dikecualikan hanya karena namanya. Lulus perintah coverage berarti eksekusinya berhasil, bukan seluruh proyek mencapai 100%.

**Kegagalan coverage yang tetap dicatat:** run pertama final kontrak menghasilkan **12 lulus, 22 gagal**. Hardhat tidak mengenali nama custom error setelah kompilasi instrumentasi di proses yang sama, sehingga assertion nama revert gagal. Wrapper [`coverage.cjs`](../../contracts/scripts/coverage.cjs) yang sudah ada mencatat kegagalan lalu mengulang **sekali** memakai instrumented build dari cache. Retry menghasilkan **34 lulus, 0 gagal** dan exit asli final 0. Kedua percobaan tersimpan dalam [08-coverage.log](evidence/final/08-coverage.log); tidak dilaporkan sebagai keberhasilan percobaan pertama.

## 4. Debugging C.2 dan regresi baseline

Kasus C.2 yang direproduksi memakai input invalid berupa pemanggilan registry tanpa kewenangan. Log menampilkan `unrecognized custom error` dengan selector `0xb41ba2d6`; dekode ABI menghasilkan **`UnauthorizedIssuer()`**. Jadi kontrak menolak pemanggilan yang tidak berwenang, sedangkan alat uji gagal mengenali nama revert. Provider Hardhat/FHEVM terinisialisasi sebelum build-info kompilasi terbaru tersedia. Skrip lama yang mengompilasi di proses pengujian menghasilkan **5 lulus/9 gagal**, lalu run cache **14/14 lulus**. Perbaikan commit `3a8c1c4` memisahkan build ke proses tersendiri dan menjalankan `hardhat test --no-compile`; run pertama setelah perbaikan **14/14 lulus**. Coverage memiliki wrapper retry terpisah seperti bagian 3.

Bukti: [reproduksi lama pertama](evidence/debugging/C2-03-repro-old-script-run1-compiles.log), [run cache](evidence/debugging/C2-03-repro-old-script-run2-cached.log), [dekode selector](evidence/debugging/C2-02-decode-selectors.log), dan [run skrip baru pertama](evidence/debugging/C2-04-fixed-script-first-run.log). Gejala awal juga dipertahankan di `evidence/debugging/C2-01*`. Uraian temuan keamanan dan retest red/green per S-01–S-12 ada di [CATATAN_TEMUAN_DAN_RETEST.md](CATATAN_TEMUAN_DAN_RETEST.md); dokumen ini bukan audit formal.

| Pemeriksaan | Baseline historis | Final aktual | Interpretasi |
| --- | --- | --- | --- |
| Unit/kontrak | `96b4a08` bersih: 353 lulus (kontrak 12, domain 52, credentials 11, OCR 45, chain 55, web 178) | `8a13faa`: 417 lulus (34/52/14/45/71/201) | Cakupan tes bertambah 64; suite yang berubah tetap lulus. [Baseline](evidence/baseline/pnpm-test.log), [final](evidence/final/04-test.log). |
| E2E lokal | `96b4a08`, log menyebut `tracked-changes=1`: 19 lulus/3 gagal dari 22; wallet/private-document timeout pada lebar 1280/800/390 | `8a13faa`: 25 lulus/0 gagal; 12 Sepolia skip | Baseline E2E bukan checkout tanpa perubahan. Alur dan fixture tes PDF diselaraskan; kontrol/tanggal PDF diperluas; angka suite berbeda. [Gagal](evidence/baseline/clean-pnpm-test-e2e.log), [retest 714a2af:25 lulus](evidence/tests/clean-pnpm-test-e2e-714a2af.log), [final](evidence/final/07-test-e2e.log). |
| PostgreSQL integrasi | Tidak ada run baseline DB yang dinyatakan di tabel ini | 9 lulus, DB loopback | Bukti nyata lokal untuk migrasi/persistensi/lease, bukan Supabase. |
| Sepolia end-to-end | Dua run serah terima belum selesai seluruh skenario | 12 lulus pada `f32afe6` | Seluruh bagian 8 diuji pada jaringan nyata; riwayat kegagalan dipertahankan di bagian 5. |

## 5. Riwayat E2E Sepolia, termasuk kegagalan

Semua folder bertanggal UTC; waktu WIB = UTC+7, masih **4 Oktober 2026**. `did not run` berarti tes serial tidak dijalankan sesudah kegagalan, berbeda dari skip opt-in. Error penutup pnpm `Command "playwright" not found` pada run gagal bukan akar penyebab; Playwright sudah menjalankan tes dan mengembalikan exit nonzero.

| Folder run di `evidence/sepolia/` | Hasil aktual | Penyebab / tindakan |
| --- | --- | --- |
| [09-30-14-561Z](evidence/sepolia/e2e-run-2026-10-04T09-30-14-561Z/playwright.log) / 16:30 WIB | 0 lulus, 1 gagal, 11 tidak dijalankan | Sign-in menunggu tombol wallet selama 300 detik. Pemilihan cabang dilakukan sebelum state wallet selesai dipulihkan. Harness berikutnya menunggu tombol connect/reconnect siap sebelum memilih cabang. |
| [09-40-02-443Z](evidence/sepolia/e2e-run-2026-10-04T09-40-02-443Z/playwright.log) / 16:40 WIB | 2 lulus, 1 gagal, 9 tidak dijalankan | Penerbitan gagal menyiapkan review: SDK tidak dapat mengambil kunci publik. Browser allowlist memblokir bucket S3 kunci publik Zama; perbaikan `e5dba67` mengizinkan bucket tersebut. Registry institusi/signer sudah berhasil pada run ini dan dipakai ulang. |
| [14-23-59-473Z](evidence/sepolia/e2e-run-2026-10-04T14-23-59-473Z/playwright.log) / 21:23 WIB | 1 lulus, 1 gagal, 10 tidak dijalankan; exit 1 | `CREDENTIAL_CONTRACT_ADDRESS` tidak diteruskan ke proses Node test; target `Contract` undefined. Runner lokal diperbaiki agar mengirim konfigurasi chain publik, lalu diulang. |
| [14-25-01-445Z](evidence/sepolia/e2e-run-2026-10-04T14-25-01-445Z/playwright.log) / 21:25 WIB, source `018614f` | 8 tes tercatat lulus, **run diinterupsi**, exit 1; empat tes tersisa tidak selesai, tanpa summary/marker finished | Fixture “asing” lama sebenarnya memiliki QR origin localhost yang valid dengan ID tidak ditemukan, sehingga hasil aktual `NOT_FOUND`, sedangkan tes menunggu `INCONCLUSIVE`. Dihentikan setelah diagnosis. `5ab6f09` membuat PDF dengan QR origin `foreign.invalid`; assertion dan ambang OCR dipertahankan. Tiga transaksi FHE yang sudah berhasil pada run ini tetap menjadi sampel nyata parsial. |
| [14-37-04-887Z](evidence/sepolia/e2e-run-2026-10-04T14-37-04-887Z/playwright.log) / 21:37 WIB, source `5ab6f09` | 2 lulus, 1 gagal, 9 tidak dijalankan; exit 1 | Penerbitan C terkena rate limit RPC; UI tidak mencapai heading sukses sebelum timeout. Hook penutup juga timeout. `f32afe6` memakai transport RPC dengan timeout/retry terbatas di wallet bridge; tidak mengubah logika kontrak atau melonggarkan assertion. |
| [14-53-27-678Z](evidence/sepolia/e2e-run-2026-10-04T14-53-27-678Z/playwright.log) / 21:53–22:02 WIB, source `f32afe6` | **12 lulus, 0 gagal, 0 skip**, exit 0, 9,4 menit menurut Playwright | Semua skenario selesai, video nyata tersimpan. [Context](evidence/sepolia/e2e-run-2026-10-04T14-53-27-678Z/execution-context.json), [hasil langkah UI](evidence/sepolia/e2e-run-2026-10-04T14-53-27-678Z/sepolia-e2e-evidence.json). |

Sepolia memakai kontrak v2 **`0x65b1C8C7B59D9651F8619F287Bc1c309FaE094e0`**, chain **11155111**, kredensial sintetis, PostgreSQL lokal `verifikasi_local`, dan SDK Zama nyata. Wallet di browser adalah bridge EIP-6963 untuk otomasi; private key tetap di proses Node. Signature dan transaksi benar-benar dikirim ke Sepolia. Ini bukan simulasi FHEVM dan bukan bukti pengujian manual ekstensi MetaMask.

| Skenario selesai | Hasil dan bukti |
| --- | --- |
| Sign-in/jaringan, registry | Pesan wallet nyata; berpindah ke chain lain membatalkan sesi. Institusi/signer aktif dipakai ulang; no-op ditolak dengan nol request transaksi. |
| Penerbitan A/B/C | Tiga transaksi sukses, pengesahan EIP-712, PDF diunduh melalui UI; semua receipt status sukses. |
| QR A tanpa wallet/unggahan | `VERIFIED_RECORD`, `RECORD_ONLY`, `documentDecision: null`; tanggal privat tidak ada pada respons publik, nol transaksi baru. |
| PDF A asli | `MATCH`; dekripsi `[true,true,true,true]`, `allMatch=true`; tx `0x2a57f0ac259c2ee52aa5c948ce6f30e26c1ae533a7abdd95d3a6e180bc3c1a84`. |
| Nama A diubah | `MISMATCH`; dekripsi `[false,true,true,true]`, `allMatch=false`; tx `0x62e1d27dd1257c7b5ffaaf192e666da63a312a16870d11b24af860e8e71c1ec5`. |
| QR B + atribut A | `MISMATCH` terhadap B; dekripsi `[false,false,false,false]`, `allMatch=false`; tx `0x3878ea29e95e0093e86d4e5379ba69c010d290881869727f62fbe00595dc3a92`. |
| QR berbeda dari target / origin asing | `INCONCLUSIVE`, `comparisonTxHash: null`; penolakan sebelum FHE. |
| Pencabutan C | QR `REVOKED` dengan jejak pencabutan; unduh PDF HTTP 409; unggahan lama `REVOKED` tanpa transaksi comparison. Tx cabut `0x48daa72f6252339d3c768b4c8e04a1005752c901ccbadfb1ab485ea92dcad501`. |
| Riwayat/laporan | Enam job milik sesi, laporan PDF HTTP 200; sesi asing HTTP 401. |
| Kontrak v1 | Rekaman trusted v1 tampil `VERIFIED_RECORD`/`RECORD_ONLY`, keputusan dokumen null, `legacyContract=true`; FHE hanya kontrak aktif. |

Receipt/gas ada di [receipts-e2e.json](evidence/sepolia/receipts-e2e.json) dan [DEPLOYMENT_RECORD.md](DEPLOYMENT_RECORD.md). [fhe-decryption-confirmation.json](evidence/sepolia/fhe-decryption-confirmation.json) memvalidasi kembali enam hasil boolean (tiga run parsial + tiga run lengkap), binding event/record, role reader dan sekurangnya dua konfirmasi. Ini **re-dekripsi lanjutan**, bukan pengulangan pengiriman transaksi atau timer dekripsi run UI semula. [no-transaction-rejection-confirmation.json](evidence/sepolia/no-transaction-rejection-confirmation.json) mencocokkan tepat tiga event comparison dengan tiga pengajuan sah pada interval run final; job yang ditolak tidak memiliki transaksi comparison.

Timing tahap, batas makna timer, file-size dan retries ada di [sepolia-ui-stage-timings.json](evidence/measurements/sepolia-ui-stage-timings.json). `checkedAt` dapat berisi waktu blok, sehingga **tidak** dipakai menghitung durasi selesai server. Durasi OCR/submit/final-conclude yang tersedia adalah tahap komposit; timer konfirmasi murni dan dekripsi original UI tidak tersedia. Jumlah sampel kecil, dua pengulangan per tiga skenario dengan ID/PDF penerbitan berbeda; tidak ada klaim percentile atau benchmark representatif.

## 6. CI dan batas kesimpulan

Konfigurasi GitHub Actions tersedia di [ci.yml](../../.github/workflows/ci.yml), mencakup instalasi, lint, typecheck, unit, PostgreSQL lokal disposable, build dan E2E lokal. **Run CI jarak jauh belum diamati**; tidak ada klaim badge/check remote hijau. Coverage di sini berasal dari mesin lokal, bukan job CI.

Hasil ini membuktikan skenario dan revisi yang disebutkan. Konfigurasi/deploy produksi Netlify belum diselaraskan dan tidak diubah dalam pekerjaan ini. Tes lokal, Sepolia publik, dan satu run UI bukan pengujian produksi atau pembuktian semua skenario beban, keamanan, maupun kegagalan layanan eksternal. Langkah reproduksi, video dan tindakan pengguna yang masih tertunda ada di [DEMO.md](DEMO.md).
