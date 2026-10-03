# Verifikasi Ijazah — Ethereum Sepolia & Zama FHEVM

Aplikasi penerbitan dan verifikasi ijazah dengan pengesahan data melalui wallet institusi, rekaman publik melalui QR, serta pencocokan atribut dokumen menggunakan OCR dan Fully Homomorphic Encryption (FHE).

Institusi dapat menerbitkan kredensial dan PDF ijazah ber-QR. Pemeriksa dapat membuka QR tanpa wallet untuk melihat rekaman penerbit, kemudian mengunggah dokumen untuk mencocokkan isinya secara otomatis. Antarmuka dan panduan tersedia dalam bahasa Indonesia.

**Status proyek:** prototipe dengan mode demo lokal dan integrasi Ethereum Sepolia (`chain ID 11155111`). Pengujian lokal mencakup OCR nyata dan kontrak FHEVM mock. [Catatan uji PDF](docs/pdf-ijazah-testing.md) juga mencatat pembacaan rekaman Sepolia nyata, tetapi belum membuktikan seluruh alur penerbitan, pencocokan FHE, dan pencabutan di jaringan nyata. Keberhasilan tes lokal bukan bukti kesiapan produksi.

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
5. Sistem membuat PDF, memeriksanya melalui OCR dan FHE, lalu menyimpan arsip privat. PDF final dapat diunduh setelah pemeriksaan dan pengarsipan berhasil.

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
| Web dan API | Next.js App Router, React, TypeScript |
| Wallet institusi | RainbowKit, Wagmi, Viem, autentikasi melalui challenge bertanda tangan |
| Pengesahan data | EIP-712, payload dan snapshot publik yang terikat pada penerbitan |
| Blockchain | Ethereum Sepolia, Solidity, Hardhat, OpenZeppelin |
| Pencocokan terenkripsi | Zama FHEVM dan Relayer SDK |
| OCR dan QR | tesseract.js `ind+eng`, MuPDF.js, zxing-wasm |
| PDF ijazah | pdf-lib, font tertanam, QR rekaman, arsip privat |
| Database | PostgreSQL melalui Drizzle ORM; Supabase untuk konfigurasi hosting |
| Pekerjaan latar belakang | Workflow untuk OCR, transaksi, polling/dekripsi, dan cleanup |
| Penyimpanan | Netlify Blobs otomatis pada Netlify; Vercel Blob privat pada Vercel; filesystem privat untuk demo lokal; adapter S3 privat tersedia |
| Pengujian | Vitest, Playwright, Hardhat/FHEVM mock, dan pemeriksaan trace deployment |

## Menjalankan secara lokal

Prasyarat: **Node.js 22+** dan **pnpm 10.19.0**, sesuai manifest proyek. OCR dan data bahasa dipasang melalui npm; tidak memerlukan Python, Docker, atau instalasi Tesseract sistem.

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

### PostgreSQL lokal atau Supabase

PostgreSQL wajib untuk mode testnet serta hosting Netlify/Vercel, dan opsional untuk demo lokal. Isi:

- `DATABASE_URL`: koneksi runtime; untuk konfigurasi Supabase, gunakan Transaction pooler port `6543`.
- `DATABASE_MIGRATION_URL`: koneksi migrasi; gunakan direct connection atau Session pooler port `5432` dari konfigurasi Supabase.

Terapkan migrasi sebelum menjalankan aplikasi dengan database tersebut:

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
| `RELAYER_PRIVATE_KEY` | Wallet backend yang mengirim transaksi pencocokan |
| `ATTESTOR_PRIVATE_KEY` | Wallet backend yang menandatangani attestation pemeriksaan |
| `RESULT_READER_PRIVATE_KEY` | Wallet backend yang berwenang membaca hasil pencocokan |
| `DEPLOYER_PRIVATE_KEY`, `ADMIN_ADDRESS`, `ATTESTOR_ADDRESS`, `RELAYER_ADDRESS`, `RESULT_READER_ADDRESS` | Konfigurasi deployment dan pembagian kewenangan kontrak |
| `DATABASE_URL`, `DATABASE_MIGRATION_URL` | Koneksi runtime dan migrasi PostgreSQL |
| `BLOB_READ_WRITE_TOKEN`, `BLOB_STORE_HOSTNAME` | Penyimpanan Blob privat pada Vercel |
| `CRON_SECRET`, `TRUST_PROXY` | Otorisasi maintenance dan konfigurasi proxy hosting |

Untuk deployment kontrak baru, siapkan wallet dan konfigurasi di `.env`, lalu jalankan:

```powershell
node --env-file=.env node_modules/tsx/dist/cli.mjs contracts/scripts/deploy-entry.ts
```

Simpan alamat kontrak dan blok yang dikembalikan jaringan, jalankan migrasi, lalu gunakan `APP_MODE=testnet` dan mulai ulang aplikasi. Administrator kemudian mendaftarkan institusi serta wallet penandatangan melalui portal. Wallet penerbit dan relayer aplikasi memerlukan ETH Sepolia untuk transaksi masing-masing. Pemeriksa QR/unggahan tidak harus menghubungkan wallet.

`APP_ORIGIN` harus sesuai alamat aplikasi yang dibuka pengguna. Gunakan origin yang stabil sebelum menerbitkan QR. Private key layanan, URL database, dan token storage hanya disimpan pada backend; jangan gunakan awalan `NEXT_PUBLIC_` untuk secret.

## Login wallet kampus

Portal memakai RainbowKit untuk memilih wallet dan meminta tanda tangan pesan login. Server memverifikasi challenge sekali pakai sebelum membuat sesi, lalu memeriksa kewenangan wallet pada kontrak. Koneksi wallet saja tidak memberikan hak penerbit atau administrator.

Wallet ekstensi dapat digunakan tanpa Project ID tambahan. Untuk koneksi HP/QR WalletConnect, isi `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` dari proyek Reown, atur domain aplikasi pada allowlist proyek tersebut, lalu restart development server atau rebuild deployment. Project ID ini merupakan konfigurasi publik; private key wallet institusi tidak diminta dalam formulir aplikasi.

Pergantian wallet atau jaringan mengakhiri autentikasi dan membuang draf di layar. Riwayat pemeriksaan anonim tetap tersedia pada sesi pengguna setelah logout wallet.

## Hosting Netlify

Untuk hosting Netlify, penyimpanan dokumen otomatis memakai **Netlify Blobs**. Ikuti [panduan storage Netlify](docs/netlify-storage.md) untuk environment, upload hingga 10 MiB, dan verifikasi setelah deploy.

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
pnpm build
pnpm --filter @verifikasi/web exec playwright install chromium
pnpm test:e2e
```

`lint` memeriksa struktur dan ESLint. `typecheck` memeriksa TypeScript serta membangun kontrak/ABI. `test` mencakup domain, pengesahan, chain adapter, OCR, web, dan kontrak FHEVM mock. `build` juga memeriksa dependency OCR/Zama dan aset PDF dari salinan trace deployment melalui `scripts/check-deployment.mjs`.

Playwright menjalankan server produksi setelah build, atau memakai server lokal yang sudah berjalan. Gunakan konfigurasi demo dan data uji; jangan arahkan pengujian ke database atau storage produksi.

Tes integrasi database terpisah memerlukan `TEST_DATABASE_URL` menuju PostgreSQL lokal sekali pakai; runner menolak host non-localhost:

```powershell
pnpm test:db
```

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

Sebagian catatan implementasi/testnet masih menyebut worker Python atau Vercel Services dari arsitektur lama. Untuk menjalankan dan melakukan deployment versi saat ini, gunakan perintah dalam README ini serta [panduan Vercel](docs/vercel.md); OCR sekarang berada di `packages/ocr` dan dijalankan in-process.
