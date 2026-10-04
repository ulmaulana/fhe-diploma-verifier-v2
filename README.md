# Verifikasi Ijazah — Ethereum Sepolia & Zama FHEVM

Aplikasi penerbitan dan verifikasi ijazah dengan pengesahan data melalui wallet institusi, rekaman publik melalui QR, serta pencocokan atribut dokumen menggunakan OCR dan Fully Homomorphic Encryption (FHE).

Institusi dapat menerbitkan kredensial dan PDF ijazah ber-QR. Pemeriksa dapat membuka QR tanpa wallet untuk melihat rekaman penerbit, kemudian mengunggah dokumen untuk mencocokkan isinya secara otomatis. Antarmuka dan panduan tersedia dalam bahasa Indonesia.

**Revisi OCR 5 Oktober 2026:** ambang confidence menjadi **70%**, dengan penolakan confidence hanya jika **keempat atribut semuanya di bawah 70%**. Satu atribut ≥70% mengizinkan pencocokan jika empat teks lengkap dan syarat lain valid. Confidence rendah pada satu field hanya ditandai sebagai informasi; keputusan tetap mengikuti hasil FHE. Source `1413ebd` lulus delapan pemeriksaan dari worktree bersih: **515 unit/kontrak, 9 DB, 25 E2E lokal**; 12 tes Sepolia opt-in dilewati. [Kebijakan dan contoh](docs/uas/PERUBAHAN_KEBIJAKAN_OCR_70.md) serta [hasil tes terbaru](docs/uas/TEST_RESULTS.md) menjelaskan bukti dan batasnya. Bukti Sepolia/video 4 Oktober di bawah berasal dari kebijakan sebelumnya.

**Status per 4 Oktober 2026:** prototipe UAS pada Ethereum Sepolia (`chain ID 11155111`). Penerbitan, QR, pencocokan FHE `MATCH`/`MISMATCH`, penolakan tanpa transaksi, pencabutan, riwayat, dan pembacaan kontrak lama telah diuji melalui UI pada Sepolia nyata: 12 skenario lulus. Pengujian lokal final dan coverage juga selesai. [Hasil pengujian](docs/uas/TEST_RESULTS.md) memisahkan mock, komponen nyata lokal, dan Sepolia; [deployment record](docs/uas/DEPLOYMENT_RECORD.md) mencatat kontrak aktif v2 dan transaksi. Konfigurasi Netlify belum diselaraskan dalam pekerjaan UAS ini; langkahnya ada di [DEMO.md](docs/uas/DEMO.md). Kesiapan aplikasi, bahan laporan, dan luaran pengumpulan UAS dipisahkan di [status pekerjaan](docs/uas/STATUS_INSTRUKSI_UAS.md).

## Fitur dan halaman

| Halaman | Fungsi |
| --- | --- |
| `/` | Beranda, akses verifikasi/penerbitan, dan penjelasan teknologi di balik layar |
| `/c/{credentialId}` | Rekaman publik dari QR: profil yang disahkan, bukti penerbitan, dan status kredensial |
| `/verifikasi` | Unggah PDF/JPG/PNG untuk pemeriksaan OCR dan pencocokan empat atribut |
| `/riwayat` | Riwayat pemeriksaan milik sesi pengguna, laporan, dan penghapusan unggahan |
| `/panduan` | Panduan penggunaan, cara kerja, Sepolia, Zama FHE, privasi, dan penerbitan |
| `/penerbit` | Portal institusi, penerbitan ijazah, dan pengelolaan data ijazah mahasiswa |

Portal penerbit terbagi menjadi tiga tab:

| Tab | Akses langsung | Kegunaan |
| --- | --- | --- |
| **Portal Kredensial Institusi** | `/penerbit` | Administrator mengatur identitas/status institusi dan kewenangan wallet penandatangan |
| **Portal Penerbitan Ijazah Mahasiswa** | `/penerbit?tab=issuance` | Mengisi data, meninjau profil publik, mengesahkan kredensial, mengirim transaksi, dan mengunduh PDF |
| **Data Ijazah Mahasiswa** | `/penerbit?tab=records` | Melihat rekaman yang sudah diterbitkan, membuat atau mengunduh PDF, dan mencabut kredensial sesuai kewenangan |

Panduan dilengkapi rekomendasi pencarian, pencocokan sinonim, dan toleransi salah ketik. Pencarian bekerja secara lokal atas judul, isi, langkah, dan kata kunci artikel; tidak memakai layanan AI eksternal. Contoh kueri: `blockchain apa yang dipake`, `fungsi zamafhe`, atau `buat pdf ijazah`.

## Cara kerja

### Penerbitan oleh institusi

1. Administrator mendaftarkan institusi dan mengaktifkan wallet pejabat yang berwenang.
2. Pejabat mengisi **nama mahasiswa, nomor ijazah, program studi, dan tanggal lulus**. Referensi atribut disiapkan dalam bentuk terenkripsi.
3. Pejabat meninjau profil publik dan menandatangani pesan kredensial **EIP-712** melalui wallet. Data yang disahkan terikat pada identitas kredensial dan bukti penerbitan.
4. Wallet mengirim transaksi ke kontrak `VerifikasiIjazah` di Sepolia. QR tersedia setelah transaksi terkonfirmasi dan bukti pengesahan sesuai.
5. Sistem membuat PDF dari profil publik yang telah disahkan dan tanggal lulus privat yang dibekukan saat penerbitan, lalu menyimpannya sebagai arsip privat. Status `READY` berarti PDF tersedia. Pembuatan PDF tidak menjalankan OCR atau transaksi FHE; pemeriksaan itu dilakukan pada jalur unggahan pemeriksa.

Login wallet, pengesahan pesan kredensial, dan transaksi penerbitan merupakan persetujuan yang terpisah. Membuat PDF untuk rekaman yang sudah ada mempertahankan ID kredensial dan QR; tidak menerbitkan kredensial baru. Detail tersedia di [PDF ijazah dan arsip privat](docs/pdf-ijazah.md).

### Pemeriksaan rekaman melalui QR

QR membuka `/c/{credentialId}`. Aplikasi memeriksa signature, kesesuaian profil publik dengan bukti on-chain, kewenangan penerbit, konfirmasi jaringan, dan status pencabutan.

Jalur ini tidak memerlukan wallet pemeriksa, unggahan, OCR, atau transaksi pencocokan baru. Cakupannya adalah **`RECORD_ONLY`**: rekaman penerbit telah diperiksa, sedangkan isi dokumen di tangan pemeriksa belum dicocokkan otomatis.

### Pencocokan dokumen melalui unggahan

1. Pengguna mengunggah dokumen ke penyimpanan privat.
2. **MuPDF.js** merender PDF, **zxing-wasm** membaca QR, dan **tesseract.js** membaca teks Indonesia/Inggris.
3. Sistem memeriksa rekaman tujuan serta kualitas hasil OCR. Empat atribut yang memenuhi syarat dinormalisasi, diubah menjadi hash, lalu dienkripsi.
4. Relayer aplikasi mengirim transaksi pencocokan. Kontrak memakai **Zama FHEVM** untuk membandingkan atribut terenkripsi dengan referensi penerbit.
5. Layanan yang berwenang mendekripsi hasil cocok/tidak cocok, memeriksa ulang status rekaman, lalu menyediakan hasil dan laporan dengan cakupan **`CHECKED_ATTRIBUTES`**.

Sepolia menjadi jaringan tempat kontrak dan transaksi aplikasi dicatat. Zama menyediakan kemampuan komputasi terenkripsi yang digunakan kontrak. OCR berjalan di server aplikasi sebelum tahap pencocokan FHE.

## Teknologi

| Bagian | Implementasi |
| --- | --- |
| Web dan API | Next.js App Router 16.3.6, React 19.3.0, TypeScript 5.9.3, Tailwind CSS 4.3.3 |
| Wallet institusi | RainbowKit, Wagmi, Viem, autentikasi melalui challenge bertanda tangan |
| Pengesahan data | EIP-712, payload dan snapshot publik yang terikat pada penerbitan |
| Blockchain | Ethereum Sepolia; Hardhat 2.28.6, solc 0.8.28 (optimizer 200, `viaIR`, EVM `cancun`), OpenZeppelin Contracts 5.6.1 |
| Pencocokan terenkripsi | `@fhevm/solidity` 0.11.1, `@fhevm/hardhat-plugin` 0.4.2, Zama Relayer SDK 0.4.1, ethers 6.16.0 |
| OCR dan QR | tesseract.js 7.0.0 `ind+eng`, paket data bahasa 1.0.0/data Tesseract 4.0.0, MuPDF.js 1.28.1, zxing-wasm 3.1.4 |
| PDF ijazah | pdf-lib, font tertanam, QR rekaman, arsip privat |
| Database | PostgreSQL melalui Drizzle ORM 0.45.3 dan Drizzle Kit 0.31.11; Supabase untuk konfigurasi hosting, PostgreSQL Docker lokal untuk pengujian UAS |
| Pekerjaan latar belakang | Workflow 4.8.9 untuk lokal/Vercel; Netlify Background Functions untuk Netlify, dengan state/lease PostgreSQL dan maintenance |
| Penyimpanan | Netlify Blobs otomatis pada Netlify; Vercel Blob privat pada Vercel; filesystem privat untuk demo lokal; adapter S3 privat tersedia |
| Pengujian | Vitest 3.2.7 (paket chain 3.2.4), Playwright 1.63.0, solidity-coverage 0.8.17, Hardhat/FHEVM mock, dan pemeriksaan trace deployment |

Versi di atas berasal dari manifest dan lockfile. Dependensi dengan rentang versi tetap direproduksi memakai `pnpm install --frozen-lockfile`. Versi driver dan alat pada instalasi final: `pg` 8.23.0, pdf-lib 1.17.1, ESLint 10.11.0, tsx 4.23.15, hardhat-verify 2.1.3. Detail lingkungan run aktual tersedia di [TEST_RESULTS.md](docs/uas/TEST_RESULTS.md).

## Menjalankan secara lokal

Prasyarat: **Node.js >=22.12.0** dan **pnpm 10.19.0**, sesuai manifest proyek. OCR dan data bahasa dipasang bersama dependensi workspace; demo lokal tidak memerlukan Python, Docker, atau instalasi Tesseract sistem. Pengujian database UAS memakai PostgreSQL 16 Docker lokal.

Jalankan dari root repository:

```powershell
pnpm install --frozen-lockfile
pnpm init:local
pnpm --filter @verifikasi/contracts build
pnpm dev
```

Buka **http://localhost:3000**. `pnpm init:local` membuat `.env` dari [`.env.example`](.env.example) jika belum ada. File yang sudah ada tetap dipertahankan, termasuk nilai kosong; tambahkan variabel baru secara manual bila diperlukan. Perintah web memuat `.env` root melalui `scripts/run-web.mjs`.

Dengan `APP_MODE=demo` dan `DATABASE_URL` kosong, aplikasi memakai state serta penyimpanan privat lokal di `PRIVATE_DATA_DIR`. Satu terminal cukup: Workflow lokal menjalankan OCR di dalam aplikasi Next.js.

Gunakan dokumen sintetis di [`packages/ocr/tests/fixtures`](packages/ocr/tests/fixtures). Mode demo menjalankan OCR nyata, tetapi unggahan tidak otomatis memperoleh hasil cocok tanpa pencocokan testnet. Contoh hasil sintetis tersedia terpisah dan diberi penanda demo.

### PostgreSQL lokal dan konfigurasi hosting

PostgreSQL wajib untuk mode testnet serta hosting Netlify/Vercel, dan opsional untuk demo lokal. Gunakan database lokal sekali pakai untuk seluruh pengujian; jangan menjalankan uji atau migrasi fixture pada Supabase pengguna. Run UAS memakai container `verifikasi-uas-pg`, port loopback `54329`, database aplikasi `verifikasi_local`, dan database integrasi terpisah `verifikasi_test`. Persiapan serta guard target migrasi tersedia di [DEMO.md](docs/uas/DEMO.md#2-menyiapkan-sepolia-dengan-database-lokal). Isi koneksi lokal melalui editor atau berkas rahasia yang tidak dilacak Git, tanpa mencetak URL.

Untuk konfigurasi hosting yang disiapkan operator:

- `DATABASE_URL`: koneksi runtime; untuk konfigurasi Supabase, gunakan Transaction pooler port `6543`.
- `DATABASE_MIGRATION_URL`: koneksi migrasi; gunakan direct connection atau Session pooler port `5432` dari konfigurasi Supabase.

Terapkan migrasi sebelum menjalankan aplikasi dengan database yang dituju. Untuk reproduksi pengujian UAS, kedua variabel koneksi harus mengarah ke `verifikasi_local` pada localhost:

```powershell
pnpm db:migrate
```

Jalankan `pnpm db:generate` hanya setelah mengubah schema Drizzle, lalu tinjau migrasi yang dihasilkan. Runtime tidak membuat tabel secara otomatis.

## Konfigurasi testnet

[`.env.example`](.env.example) menjadi daftar variabel konfigurasi tanpa kredensial. Kelompok utamanya:

| Variabel | Fungsi |
| --- | --- |
| `APP_MODE`, `APP_ORIGIN` | Mode `demo`/`testnet` dan origin kanonis aplikasi untuk QR serta pemeriksaan request |
| `RPC_URL`, `CHAIN_ID`, `CHAIN_CONFIRMATIONS` | Koneksi Sepolia; chain ID `11155111`, minimal dua konfirmasi |
| `CREDENTIAL_CONTRACT_ADDRESS`, `CONTRACT_DEPLOYMENT_BLOCK` | Alamat dan blok deployment kontrak yang benar-benar digunakan |
| `LEGACY_CREDENTIAL_CONTRACTS` | Kontrak v1 tepercaya untuk pembacaan saja, format `alamat:cutoffBlock`; rekaman setelah cutoff tidak dipercaya |
| `MAX_COMPARISONS_PER_HOUR` | Anggaran global transaksi pencocokan relayer per jam, default `30` |
| `RELAYER_PRIVATE_KEY` | Wallet backend yang mengirim transaksi pencocokan |
| `ATTESTOR_PRIVATE_KEY` | Wallet backend yang menandatangani attestation pemeriksaan |
| `RESULT_READER_PRIVATE_KEY` | Wallet backend yang berwenang membaca hasil pencocokan |
| `DEPLOYER_PRIVATE_KEY`, `ADMIN_ADDRESS`, `ATTESTOR_ADDRESS`, `RELAYER_ADDRESS`, `RESULT_READER_ADDRESS` | Konfigurasi deployment dan pembagian kewenangan kontrak |
| `PLANNED_SIGNER_ADDRESSES` | Daftar alamat signer institusi dipisahkan koma, untuk preflight deployment; harus berbeda dari seluruh alamat role |
| `DATABASE_URL`, `DATABASE_MIGRATION_URL` | Koneksi runtime dan migrasi PostgreSQL |
| `BLOB_READ_WRITE_TOKEN`, `BLOB_STORE_HOSTNAME` | Penyimpanan Blob privat pada Vercel |
| `STORAGE_PROVIDER`, `NETLIFY_BLOBS_STORE`, `NETLIFY_SITE_ID`, `NETLIFY_AUTH_TOKEN` | Konfigurasi adapter Netlify; kredensial tambahan hanya untuk akses lokal/eksternal, bukan pengujian produksi |
| `CRON_SECRET`, `TRUST_PROXY` | Otorisasi maintenance dan konfigurasi proxy hosting |
| `ETHERSCAN_API_KEY` | Opsional untuk verifikasi source Etherscan; Sourcify API v2 tidak memerlukan API key |

Admin, attestor, relayer, result reader, dan signer institusi memakai lima alamat berbeda. Tiga private key layanan harus menghasilkan tiga alamat berbeda dan hanya memegang role masing-masing; backend menolak konfigurasi duplikat. Kunci admin/deployer dipakai hanya oleh tooling deployment, sedangkan institusi menandatangani dari wallet browser. Jangan memasukkan private key institusi ke formulir atau runtime web.

Kontrak aktif v2 adalah `0x65b1C8C7B59D9651F8619F287Bc1c309FaE094e0`, mulai blok `11841227`. Pembacaan v1 memakai `LEGACY_CREDENTIAL_CONTRACTS=0x39de125002edA28c886d9125AE5d61BB5BE04903:11841226`. Gunakan kontrak ini untuk reproduksi; deployment baru hanya diperlukan bila Solidity berubah. Kontrak tidak memakai proxy dan signature v1 tidak berlaku pada domain v2.

Tooling operasi tersedia dari direktori `contracts/`. Konfigurasi dibaca dari `.env` lokal tanpa dicetak. Siapkan wallet uji dan alamat role, lalu jalankan preflight sebelum mengirim transaksi:

```powershell
pnpm --filter @verifikasi/contracts build
cd contracts

# Preflight: tidak mengirim transaksi.
node --env-file=../.env node_modules/hardhat/internal/cli/cli.js uas:deploy --network sepolia --expected-chain-id 11155111

# Hanya bila deployment uji baru diperlukan.
node --env-file=../.env node_modules/hardhat/internal/cli/cli.js uas:deploy --network sepolia --expected-chain-id 11155111 --confirmations 2 --execute

# Isi placeholder dengan ID/alamat publik yang sah.
node --env-file=../.env node_modules/hardhat/internal/cli/cli.js uas:register --network sepolia --issuer-id "0x<bytes32>" --name "Institusi Sintetis Uji" --signer "0x<wallet>" --expected-chain-id 11155111 --confirmations 2 --execute

# Inspeksi role hanya membaca chain.
node --env-file=../.env node_modules/hardhat/internal/cli/cli.js uas:roles --network sepolia

# Verifikasi source berdasarkan deployment record tersimpan.
node --env-file=../.env node_modules/hardhat/internal/cli/cli.js uas:verify-source --network sepolia
cd ..
```

`uas:deploy`, `uas:register`, dan perubahan `uas:roles` hanya membuat rencana tanpa `--execute`; verifikasi source mengirim source publik ke layanan verifikasi dan memperbarui deployment record. Registrasi membaca state terlebih dahulu dan melewati keadaan yang sudah sesuai tanpa transaksi. Signer yang masih aktif pada institusi lain ditolak. Rotasi memakai `uas:roles --action grant|revoke|transfer-admin` dengan `--role`, `--account` atau `--to` sesuai tindakan. `transfer-admin` memberikan dan memverifikasi admin baru sebelum melepas admin lama; kontrak menolak penghapusan admin terakhir. Perintah lengkap dan receipt tersedia di [DEPLOYMENT_RECORD.md](docs/uas/DEPLOYMENT_RECORD.md#4-reproduksi).

Simpan alamat/blok hasil deployment, jalankan migrasi pada database uji lokal, lalu gunakan `APP_MODE=testnet` dan mulai ulang aplikasi. Administrator dapat mendaftarkan institusi serta wallet penandatangan melalui portal. Untuk mengulang E2E dengan signer yang sudah aktif, gunakan ulang institusi sintetis di [DEMO.md](docs/uas/DEMO.md), bukan ID institusi baru. Wallet penerbit dan relayer memerlukan SepETH untuk transaksi masing-masing. Pemeriksa QR/unggahan tidak harus menghubungkan wallet.

`APP_ORIGIN` harus sesuai alamat aplikasi yang dibuka pengguna. Gunakan origin yang stabil sebelum menerbitkan QR. Private key layanan, URL database, dan token storage hanya disimpan pada backend; jangan gunakan awalan `NEXT_PUBLIC_` untuk secret.

## Login wallet kampus

Portal memakai RainbowKit untuk memilih wallet dan meminta tanda tangan pesan login. Server memverifikasi challenge sekali pakai sebelum membuat sesi, lalu memeriksa kewenangan wallet pada kontrak. Koneksi wallet saja tidak memberikan hak penerbit atau administrator.

Wallet ekstensi dapat digunakan tanpa Project ID tambahan. Untuk koneksi HP/QR WalletConnect, isi `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` dari proyek Reown, atur domain aplikasi pada allowlist proyek tersebut, lalu restart development server atau rebuild deployment. Project ID ini merupakan konfigurasi publik; private key wallet institusi tidak diminta dalam formulir aplikasi.

Pergantian wallet atau jaringan mengakhiri autentikasi dan membuang draf di layar. Riwayat pemeriksaan anonim tetap tersedia pada sesi pengguna setelah logout wallet.

## Hosting Netlify

Untuk hosting Netlify, penyimpanan dokumen otomatis memakai **Netlify Blobs** dan proses pemeriksaan memakai **Background Functions** dengan lease PostgreSQL serta maintenance. Ikuti [panduan storage Netlify](docs/netlify-storage.md) untuk environment, upload hingga 10 MiB, dan verifikasi setelah deploy. Pekerjaan UAS tidak mengubah konfigurasi atau melakukan deployment produksi Netlify; daftar penyelarasan yang harus dijalankan pengguna ada di [DEMO.md](docs/uas/DEMO.md).

## Hosting Vercel

Gunakan **satu proyek Next.js** dengan:

- **Framework Preset:** `Next.js`.
- **Root Directory:** `apps/web`.
- **Install command:** `pnpm install --frozen-lockfile`.
- **Build command:** `pnpm build:vercel`.
- PostgreSQL/Supabase, Vercel Blob **privat**, dan environment sesuai mode aplikasi.

Konfigurasi ada di [`apps/web/vercel.json`](apps/web/vercel.json). OCR berjalan di langkah Workflow dalam Function yang sama, tanpa service OCR terpisah. Migrasi database dijalankan sebelum penggunaan aplikasi, bukan otomatis saat request atau build.

Workflow memulai pemrosesan segera setelah finalisasi unggahan dan menjadwalkan cleanup setelah pekerjaan selesai. Cron `0 0 * * *` menjadi cadangan harian untuk maintenance; gangguan Workflow/storage dapat menunda penghapusan fisik. Detail environment, retensi, dan migrasi dari deployment Services lama tersedia di [panduan Vercel dan Supabase](docs/vercel.md).

## Batas verifikasi dan privasi

- **Profil publik:** nama, nomor ijazah, program studi, dan institusi dapat dibaca melalui tautan QR. Tanggal lulus tidak ditampilkan pada profil publik.
- **Akses OCR:** server membaca isi unggahan sebelum enkripsi. FHE melindungi referensi dan operasi pencocokan; bukan berarti seluruh isi dokumen tersembunyi dari server OCR.
- **Cakupan hasil:** `MATCH` menyatakan kecocokan empat atribut yang diperiksa. Hasil tersebut tidak membuktikan keaslian kertas, seluruh unsur visual, atau signature PDF. QR yang valid juga belum membuktikan bahwa QR tersebut ditempel pada dokumen yang sesuai.
- **Format:** satu PDF/JPG/PNG maksimal **10 MiB** dan **5 halaman**. QR dan keempat atribut harus ada pada halaman yang sama. Parser mendukung template PDF portal **D1** serta template uji **A1/B1**; tata letak lain dapat berakhir belum dapat diverifikasi.
- **Kegagalan:** OCR yang tidak memadai, bukti tidak valid, pencabutan, dan gangguan layanan tidak diubah menjadi hasil cocok. Status rekaman diperiksa kembali sebelum hasil akhir.
- **Retensi:** akses artefak unggahan berakhir satu jam setelah pekerjaan terminal dan maksimal 24 jam sejak intent/unggah. Penghapusan fisik dapat tertunda saat layanan terganggu. Bukti penerbitan, profil publik, dan arsip PDF disimpan terpisah dari unggahan sementara; menghapus unggahan tidak menghapus riwayat blockchain.
- **Kepercayaan:** laporan adalah ringkasan pemeriksaan layanan pada waktu tertentu. Pengujian mock tidak membuktikan operasi Zama, RPC, database cloud, atau Blob nyata berhasil.

## Pengujian

Perintah utama dari root repository:

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm test:db
pnpm build
pnpm --filter @verifikasi/web exec playwright install chromium
pnpm test:e2e
pnpm coverage
```

`lint` memeriksa struktur dan ESLint. `typecheck` memeriksa TypeScript serta membangun kontrak/ABI. `test` mencakup domain, pengesahan, chain adapter, OCR, web, dan kontrak FHEVM mock. `build` juga memeriksa dependency OCR/Zama dan aset PDF dari salinan trace deployment melalui `scripts/check-deployment.mjs`.

Untuk E2E lokal, gunakan checkout uji terpisah dengan `APP_MODE=demo`, `SEPOLIA_E2E=0`, `CI=1`, dan port `3000`; hentikan server dev terlebih dahulu. Playwright menyalakan server dari build dan mematikannya sesudah run. Fixture OCR memakai origin localhost:3000. Jangan arahkan pengujian ke database atau storage produksi. Run final yang tercatat memakai worktree yang diawali bersih tanpa `.env`, dengan environment demo ditetapkan pada proses; langkah `init:local` di atas adalah cara persiapan konfigurasi lokal, bukan klaim bahwa seluruh variasi `.env` sudah diuji.

Tes integrasi database terpisah memerlukan `TEST_DATABASE_URL` menuju `verifikasi_test` pada PostgreSQL lokal sekali pakai; runner menolak host non-localhost, membuat/menghapus schema acak, dan tidak memakai fallback `DATABASE_URL`. Tanpa variabel itu suite dilewati, sehingga keluaran skipped tidak membuktikan integrasi database lulus:

```powershell
pnpm test:db
```

Suite Sepolia melalui UI bersifat opt-in: `SEPOLIA_E2E=1`, dengan `SEPOLIA_E2E_ADMIN_KEY` dan `SEPOLIA_E2E_SIGNER_KEY` dalam proses Node test, `SEPOLIA_E2E_ISSUER_ID`/`SEPOLIA_E2E_ISSUER_NAME` untuk menggunakan ulang institusi, `SEPOLIA_E2E_EVIDENCE_DIR`, serta opsional `SEPOLIA_E2E_LEGACY_ID`. Kunci tetap dalam berkas lokal di luar repo dan tidak dicetak. Suite mengirim transaksi testnet nyata; lihat [DEMO.md](docs/uas/DEMO.md#4-mengulang-e2e-sepolia-opt-in) untuk konfigurasi serta perintah lengkap. Mode demo menjalankan OCR nyata tetapi tidak menyatakan unggahan cocok tanpa pencocokan testnet.

Hasil final pada source `8a13faaaac696700c8018cc6c947682028393afc`: 417 tes unit/kontrak lulus, 9 tes PostgreSQL lokal lulus, 25 E2E lokal lulus dan 12 Sepolia opt-in skip. Run Sepolia terpisah pada `f32afe67b39af7b38e524e263bc63b5a0973c5a6` menghasilkan 12 lulus. Coverage kontrak 100% pada empat metrik; cakupan TypeScript berbeda per workspace. Angka, pengecualian coverage, run gagal sebelumnya, receipt dan video nyata dirujuk melalui [TEST_RESULTS.md](docs/uas/TEST_RESULTS.md) dan [BAHAN_LAPORAN_UAS.md](docs/uas/BAHAN_LAPORAN_UAS.md). Status CI jarak jauh belum diverifikasi dari run CI.

Untuk menguji pencarian panduan secara terarah:

```powershell
pnpm --filter @verifikasi/web exec vitest run tests/unit/guide-search.test.ts
pnpm --filter @verifikasi/web exec playwright test tests/e2e/search.spec.ts
```

## Struktur repository

| Direktori | Tanggung jawab |
| --- | --- |
| `apps/web/src/app` | Halaman Next.js dan route API |
| `apps/web/src/features` | Beranda, verifikasi, rekaman, riwayat, panduan, wallet, dan portal |
| `apps/web/src/server` | Sesi/CSRF, database, storage, pipeline, dan dokumen PDF |
| `apps/web/src/workflows` | OCR, transaksi, polling/dekripsi, dan cleanup |
| `apps/web/drizzle` | Migrasi PostgreSQL |
| `packages/ocr` | Render PDF, pembacaan QR/teks, parser atribut, dan fixture sintetis |
| `packages/domain` | Normalisasi, encoding, QR, attestation, dan aturan keputusan |
| `packages/credentials` | Payload EIP-712, hashing profil publik, dan verifikasi signature |
| `packages/chain` | Enkripsi, pembacaan chain, transaksi, dan dekripsi hasil |
| `packages/config` | Konfigurasi TypeScript bersama |
| `contracts` | Solidity, deployment, tes FHEVM, dan ABI hasil kompilasi |
| `scripts` | Setup lokal, pemuat environment, dan pemeriksaan struktur/deployment |
| `docs` | Panduan operasi, desain, dan catatan pengujian |

Dependensi internal memakai `workspace:*` dengan satu `pnpm-lock.yaml` root. ABI dihasilkan dari kompilasi kontrak.

## Dokumentasi lanjutan

- [Deployment Vercel dan Supabase](docs/vercel.md).
- [PDF ijazah dan arsip privat](docs/pdf-ijazah.md).
- [Bukti uji PDF dan batas pengujian jaringan nyata](docs/pdf-ijazah-testing.md).
- [Skenario validasi Sepolia dan migrasi kontrak](docs/testnet.md).
- [Arsitektur dan operasi](docs/implementation.md).
- [Kriteria penerimaan dan bukti pengujian](docs/acceptance.md).
- [Fakta arsitektur, privasi, governance, dan pengukuran](docs/uas/FAKTA_ARSITEKTUR_DAN_PENGUKURAN.md).
- [Matriks kepatuhan UAS](docs/uas/KEPATUHAN_UAS.md).
- [Inventaris bahan dan indeks bukti B-01 dan seterusnya](docs/uas/BAHAN_LAPORAN_UAS.md).

Dokumen bertanggal mempertahankan hasil dan keputusan pada versi yang diuji. Gunakan README ini untuk operasi, `docs/uas/TEST_RESULTS.md` untuk hasil final, `DEPLOYMENT_RECORD.md` untuk kontrak/transaksi, dan `DEMO.md` untuk reproduksi serta tindakan hosting yang tertunda. Catatan worker Python atau Vercel Services merupakan riwayat arsitektur; OCR sekarang berada di `packages/ocr` dan berjalan in-process.

Kontrak memakai OpenZeppelin Contracts 5.6.1 (MIT) serta `@fhevm/solidity` 0.11.1 dan Zama Relayer SDK 0.4.1 (BSD-3-Clause-Clear). Lisensi/atribusi masing-masing dependency tetap berlaku. Source kontrak aplikasi mencantumkan `SPDX-License-Identifier: BSD-3-Clause-Clear`; pengesahan data mengikuti EIP-712 dan tidak membuat algoritma kriptografi sendiri.
