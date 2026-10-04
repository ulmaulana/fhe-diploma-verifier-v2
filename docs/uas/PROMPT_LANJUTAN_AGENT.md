# Prompt lanjutan untuk AI agent berikutnya

Salin seluruh isi di bawah garis ini ke agent yang akan melanjutkan pekerjaan.

---

Kamu melanjutkan pekerjaan implementasi UAS Blockchain pada repositori **Verifikasi Ijazah** (pnpm monorepo: Next.js 16 + React 19 + TypeScript di `apps/web`, paket `packages/{domain,credentials,chain,ocr,config}`, kontrak Solidity + Zama FHEVM di `contracts`, jaringan Ethereum Sepolia chain ID 11155111). Kerjakan tanpa banyak bertanya; tanya pengguna hanya untuk keputusan yang memang miliknya.

## 1. Baca dulu (wajib, berurutan)

1. `CLAUDE.md` (aturan monorepo, privasi, commit) dan `apps/web/AGENTS.md`.
2. `docs/Lanjutan Upgrade UAS/INSTRUKSI_IMPLEMENTASI_UAS_BLOCKCHAIN.md` — dokumen tugas utama (bagian 6–15).
3. `docs/uas/STATUS_INSTRUKSI_UAS.md` — checklist ✅/❌ posisi terakhir. **Kerjakan semua butir ❌ yang menjadi tugas agent.** Butir yang ditandai "oleh ChatGPT" (laporan G.2, PDF audit G.6, slide G.8, evaluasi 2–3 halaman) **jangan** dikerjakan.
4. `docs/uas/CATATAN_TEMUAN_DAN_RETEST.md`, `docs/uas/DEPLOYMENT_RECORD.md`, `docs/testnet.md`.

## 2. Aturan yang tidak boleh dilanggar

- Jangan menulis laporan akademik, draf bab, `Security_Audit.pdf`, slide, atau evaluasi enterprise. Hanya fakta, data, bukti.
- Jangan menulis data uji ke **Supabase** (database produksi pengguna). Semua uji memakai PostgreSQL lokal sekali pakai (container Docker `verifikasi-uas-pg`).
- Jangan mengubah situs/konfigurasi **Netlify** dan jangan deploy produksi tanpa izin eksplisit pengguna; tuliskan langkah penyelarasan Netlify di `docs/uas/DEMO.md` sebagai tindakan pengguna yang tertunda.
- Tidak boleh mainnet. Gunakan hanya wallet uji. Jangan mencetak isi `.env`, private key, URL RPC bertoken, URL database, atau cookie ke log, evidence, commit, maupun chat. Kunci wallet uji ada di `%USERPROFILE%\.uas-verifikasi\sepolia-test-wallets.env` (di luar repo).
- Jangan memakai awalan `NEXT_PUBLIC_` untuk rahasia. Mode demo/mock harus berlabel jelas; jangan menyebut hasil mock sebagai hasil Sepolia.
- Keamanan dependensi: hindari menambah paket npm. Bila terpaksa, pakai versi eksak dan tolak versi berikut (langsung maupun transitif): `@cacheable/utils@2.5.1`, `@cacheable/memory@2.2.1`, `@cacheable/net@2.1.1`, `@cacheable/node-cache@3.1.2`, `cacheable@2.5.1`, `ecto@5.0.1`, `file-entry-cache@11.1.6`, `flat-cache@6.1.24`, `keyv@6.0.0`, `cache-manager@7.2.10`, `cacheable-request@13.0.20`, `http-metrics-middleware@2.2.2`, `picasso.js@2.11.6`, `picasso-plugin-hammer@2.11.6`, `picasso-plugin-q@2.11.6`, `@nebula.js/nucleus@0.5.1`, `@qlik/embed-react@2.5.3`, `@qlik/embed-runtime@1.6.4`, `@qlik/embed-web-components@1.7.3`, `@qlik/runtime-module-loader@1.5.1`, `@hubsync/web-sdk-react@6.3.7–6.3.33`, `@thiennq/docs-viewer@1.6.2–1.6.4`, `babel-plugin-linaria-css-to-undefined@0.3.1–0.3.17`, `pob-test-package-in-monorepo@5.2.1–5.2.16`, dan seluruh scope `@ornikar/*`. Jika terdeteksi: BERHENTI dan laporkan nama, versi, jalur dependensi. Perubahan tak terduga pada `.claude/`, `.vscode/`, `.github/workflows/`, `.git/hooks/` → berhenti.
- Patuhi struktur monorepo (`node scripts/check-structure.mjs`). Jangan membuat file kode di root atau folder alternatif.
- Setiap perubahan yang selesai dan sudah diperiksa **langsung di-commit** dengan pesan jelas; commit hanya berkas terkait. Sebelum meng-commit dokumen/evidence, jalankan pemindaian rahasia (lihat T7).
- Laporkan apa adanya: hasil gagal tetap dicatat, bedakan mock / lokal-nyata / Sepolia.

## 3. Kondisi lingkungan saat serah terima

1. Repo: `C:\Users\Maulana\Pictures\Matkul IF\Semester 7\Blockchain\UAS\Degree-E-Sign-and-Verifier-ZamaFHE-main`, branch `main`. Riwayat Git dimulai di `96b4a08` (salinan ZIP).
2. Kontrak aktif v2: `0x65b1C8C7B59D9651F8619F287Bc1c309FaE094e0` (blok 11841227, Sourcify exact_match). Kontrak lama v1 hanya-baca: `0x39de125002edA28c886d9125AE5d61BB5BE04903` (batas migrasi blok 11841226). Peran: admin/deployer `0xCa01…4096`, attestor `0x6512…02b5`, relayer `0xea36…2933` (didanai 0,25 SepETH), reader `0x84Bd…8B5e`, signer institusi `0x399a…a43e` (0,1 SepETH).
3. Alat bantu lokal (bukan kode repo) di `C:\Users\Maulana\AppData\Local\Temp\uasw\tools\`:
   - `run-sepolia-e2e.cjs` — menanam bukti kredensial lama (`legacy.json`) ke DB lokal, lalu menjalankan `apps/web/tests/e2e/sepolia.spec.ts` di worktree `uasw/live` dengan kunci dari berkas lokal; evidence ke `docs/uas/evidence/sepolia/e2e-run-<stamp>/`.
   - `receipts.cjs label=0xhash ...` — receipt + event terdekode (tidak mencetak RPC_URL).
   - `secret-scan.cjs <berkas...>` — gagal bila nilai rahasia terkonfigurasi muncul; hanya mencetak nama.
   - `bench-state.ts` (S-12, sudah dijalankan), `inspect-chain.cjs`, `PLAN.md` (catatan kerja lama).
4. Worktree uji: `C:\Users\Maulana\AppData\Local\Temp\uasw\live` (detached, `.env` testnet lokal: DB `verifikasi_local` di Docker, kontrak v2, tiga kunci layanan baru, `LEGACY_CREDENTIAL_CONTRACTS`). Worktree lain `uasw/base`, `uasw/e2e1` sisa uji bersih (boleh dihapus di akhir dengan `git worktree remove`).
5. Docker: container `verifikasi-uas-pg` (postgres:16-alpine, `127.0.0.1:54329`, DB `verifikasi_test` untuk `pnpm test:db` dan `verifikasi_local` untuk aplikasi testnet lokal). Kredensialnya hanya di `.env` lokal; jangan dicetak.
6. Sepolia sudah memiliki institusi sintetis `0xd4aadc1f7b58512ea3b4974d82df569c4cb734aa8049aed5377cb95e8caf62ab` ("Universitas Sintetis UAS (Uji)") dengan signer `0x399a…a43e` aktif (authorizationId 1) — tx `0x04cf8989…0ba46f` dan `0x40cea2ff…50f59d`.

## 4. Pekerjaan, berurutan

### T1 — Jadikan `sepolia.spec.ts` dapat dijalankan ulang
Masalah: spec membuat `issuerId` acak tiap run lalu mengaktifkan signer yang sama. Kontrak menolak signer yang masih aktif di institusi lain (`contracts/src/VerifikasiIjazah.sol:147`, `UnauthorizedIssuer`; diuji di `contracts/test/VerifikasiIjazah.cjs` "rejects cross-institution signer reassignment while active"). Run ulang akan gagal di tes registrasi.
Perbaikan yang diharapkan: dukung env `SEPOLIA_E2E_ISSUER_ID` (+ nama) untuk memakai ulang institusi di butir 3.6. Bila institusi sudah ada dengan nama yang sama dan signer sudah aktif, tes registrasi mencatat status yang sudah ada (rujuk tx sebelumnya di `docs/uas/evidence/sepolia/e2e-run-2026-10-04T09-40-02-443Z/`) dan tetap membuktikan penolakan no-op tanpa transaksi; bila belum ada, jalankan registrasi lewat UI seperti sekarang. Tambahkan env itu ke `run-sepolia-e2e.cjs`. Jalankan eslint + `tsc` web, commit.
Catatan: perbaikan allowlist jaringan (bucket kunci publik Zama `zama-mpc-testnet-public-*.s3.*.amazonaws.com`) sudah di-commit `e5dba67` tetapi belum diuji ulang.

### T2 — Jalankan skenario nyata bagian 8 di Sepolia
- Perbarui worktree: `git -C C:/Users/Maulana/AppData/Local/Temp/uasw/live checkout --detach main`. Bila ada perubahan kode aplikasi (bukan hanya tes), jalankan `pnpm build` di worktree itu sebelum uji.
- Jalankan `node C:/Users/Maulana/AppData/Local/Temp/uasw/tools/run-sepolia-e2e.cjs` di latar (±60–90 menit; Playwright menyalakan server sendiri karena `CI=1`). Pantau `playwright.log` di folder evidence baru.
- Pesan `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "playwright" not found` di akhir log hanyalah efek exit code non-nol, bukan penyebab.
- Bila gagal: baca `apps/web/test-results/<tes>/error-context.md`, screenshot, dan `trace.zip` (ekstrak, cari URL di `*.network`). Diagnosis akar masalah sebelum menjalankan ulang; setiap run memakai test ETH. Jangan melemahkan assertion atau ambang OCR agar lulus.
- Target: penerbitan A/B/C, QR `VERIFIED_RECORD`/`RECORD_ONLY` tanpa tx, `MATCH` FHE nyata, `MISMATCH` satu atribut, QR ≠ expected → `INCONCLUSIVE` tanpa tx, QR B + atribut A → `MISMATCH`, dokumen asing → `INCONCLUSIVE` tanpa tx, pencabutan C + jejak + PDF 409 + unggah `REVOKED` tanpa tx, riwayat/laporan hanya sesi pemilik, rekaman v1 hanya-baca.

### T3 — Kumpulkan bukti dan pengukuran Sepolia
- `node C:/Users/Maulana/AppData/Local/Temp/uasw/tools/receipts.cjs issueA=0x.. issueB=0x.. issueC=0x.. verifyMatch=0x.. ... revokeC=0x.. > docs/uas/evidence/sepolia/receipts-e2e.json` (gas, blok, waktu UTC, event `CredentialIssued`/`ComparisonRequested`/`CredentialRevoked`).
- Catat durasi tahap dari `sepolia-e2e-evidence.json` (`uiSecondsToResult`, `createdAt`/`checkedAt`, `secondsToConfirmedIssuance`) dengan definisi awal/akhir yang jelas; jumlah sampel kecil, sebutkan apa adanya, jangan membuat percentile dari satu sampel.
- Perbarui `DEPLOYMENT_RECORD.md` bagian 2.2 dan `CATATAN_TEMUAN_DAN_RETEST.md` (S-01/S-08 bila ada bukti nyata).

### T4 — Run verifikasi final pada commit final (worktree bersih)
`pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` (`TEST_DATABASE_URL` → `verifikasi_test` lokal), `pnpm build`, `pnpm test:e2e`, `pnpm coverage`. Simpan log ke `docs/uas/evidence/final/` dengan commit, waktu WIB, perintah, dan exit code asli (jangan tertutup oleh pipe/logger). Perbaiki kegagalan relevan dulu.

### T5 — Dokumentasi (fakta, bukan laporan akademik)
- `README.md` (G.1): use case, prasyarat & versi (Node 22+, pnpm 10.19.0, hardhat 2.28.6, solc 0.8.28 viaIR cancun, OpenZeppelin 5.6.1, @fhevm/solidity 0.11.1, relayer-sdk 0.4.1, ethers 6.16.0), instalasi, konfigurasi tanpa rahasia (tambahkan `LEGACY_CREDENTIAL_CONTRACTS`, `MAX_COMPARISONS_PER_HOUR`, tiga kunci layanan berbeda, `PLANNED_SIGNER_ADDRESSES`), migrasi, build, tes (termasuk `test:db`, `coverage`, E2E Sepolia opt-in), deployment via `uas:deploy`/`uas:register`/`uas:roles`/`uas:verify-source`, jalur demo, batas mode mock, reproduksi dari checkout bersih, atribusi OpenZeppelin (MIT) dan Zama (BSD-3-Clause-Clear), status proyek terkini. Perbaiki langkah penerbitan no. 5 (PDF tidak lagi melalui OCR/FHE) dan paragraf terakhir tentang dokumen usang.
- `docs/acceptance.md`, `docs/implementation.md`, `docs/pdf-ijazah-testing.md`: beri konteks versi/tanggal, jangan hapus riwayat.
- `docs/uas/KEPATUHAN_UAS.md`: butir A–J (bagian 4 instruksi) → dasar, keadaan awal, perubahan, tes, bukti, status, luaran tertunda.
- `docs/uas/FAKTA_ARSITEKTUR_DAN_PENGUKURAN.md`: aktor, model data, akses, on-chain/off-chain, fitur Solidity (B.5), keputusan (B.6), tujuh aspek E.1 (fakta implementasi; Sepolia = testnet publik dengan validator berizin; peran aplikasi ≠ izin validator), data mentah + ringkasan pengukuran (gas, durasi, S-12), interoperabilitas, tabel privasi (10.3), governance & prosedur yang benar-benar ada, dependensi/biaya, backlog teknis.
- `docs/uas/TEST_RESULTS.md`: matriks kategori, hasil per suite (jumlah lulus/gagal/skip), coverage + pengecualian, debugging C.2, regresi baseline vs final, E2E lokal dan Sepolia (termasuk dua run gagal sebelumnya dan penyebabnya), status CI jarak jauh (jangan disimpulkan tanpa bukti run).
- `docs/uas/DEMO.md`: langkah reproduksi demo, fixture, akun per peran (tanpa kunci), ekspektasi, hasil, bukti, langkah saat gangguan, langkah sinkronisasi Netlify (daftar env yang harus diubah pengguna), dan checklist perekaman video (G.9 tetap ❌ sampai video nyata ada).
- `docs/uas/BAHAN_LAPORAN_UAS.md`: inventaris fakta + indeks bukti **B-01, B-02, …** dengan kolom bagian 11.1 (kode, judul, lokasi relatif, waktu+zona, versi, metode, tingkat bukti, hasil, interpretasi, rujukan tugas/template, caption), plus data untuk tabel template bagian 12.3. Kontribusi: hanya dari riwayat nyata (`git shortlog -sn`); identitas/NPM anggota belum diberikan — tulis sebagai kebutuhan dari pengguna.
- Perbarui `docs/uas/STATUS_INSTRUKSI_UAS.md` (✅/❌) sesuai hasil akhir.

### T6 — Diagram (G.7)
Render `docs/uas/diagrams/architecture.mmd` dan `transaction-flow.mmd` menjadi `docs/uas/diagrams/Architecture_Diagram.png` dan `Transaction_Flow.png` yang terbaca (mis. Playwright yang sudah terpasang + halaman HTML sementara di luar repo yang memuat Mermaid versi tertentu dari CDN). Periksa kesesuaian dengan implementasi final dan hasil render. Jangan menambah dependensi repo hanya untuk ini.

### T7 — Keamanan evidence dan handoff
- Sebelum setiap commit dokumen/evidence: `git add -A --dry-run docs ...` lalu `node C:/Users/Maulana/AppData/Local/Temp/uasw/tools/secret-scan.cjs <daftar berkas>` harus `hits: 0`.
- Opsional: `BAHAN_LAPORAN_UAS_BLOCKCHAIN.zip` dengan daftar berkas yang diizinkan (dokumen `docs/uas`, evidence, diagram, record deployment), tanpa `.env`, `node_modules`, storage, cache.

### T8 — Bersih-bersih (paling akhir)
`git worktree remove` untuk `uasw/base`, `uasw/e2e1`, `uasw/live` (hapus `.env` di worktree), hentikan dan hapus container `verifikasi-uas-pg` setelah semua uji selesai dan beri tahu pengguna. Jangan menyentuh Supabase/Netlify.

## 5. Respons akhir (bagian 15 instruksi)

Dalam bahasa Indonesia: perubahan utama, daftar commit, hasil tes dengan jumlah, status coverage, jaringan & kontrak final, bukti FHE (MATCH/MISMATCH dengan tx hash dan hasil dekripsi) dan pencabutan, temuan audit yang terselesaikan, hambatan yang tersisa (mis. Netlify belum diselaraskan, video G.9, identitas anggota G.10, status CI jarak jauh), lokasi bahan laporan. Bedakan mock dari layanan nyata. Tutup dengan menyerahkan bahan kepada pengguna untuk dibawa ke ChatGPT; laporan UAS, audit formal, evaluasi, dan slide disusun ChatGPT. Jangan menawarkan menulis laporan.
