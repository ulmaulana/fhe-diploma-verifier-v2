# Verifikasi Ijazah — Ethereum Sepolia & Zama FHEVM

## Deskripsi

Aplikasi penerbitan dan verifikasi ijazah. Institusi mengesahkan data kredensial dengan tanda tangan **EIP-712** dari wallet berwenang, lalu mencatatnya pada kontrak `VerifikasiIjazah` di Ethereum Sepolia. Setiap ijazah memiliki QR yang membuka rekaman publik di `/c/{credentialId}` tanpa wallet atau unggahan. Pemeriksa juga dapat mengunggah dokumen ijazah. Sistem membaca empat atribut (nama, nomor ijazah, program studi, tanggal lulus) dengan OCR, lalu mencocokkannya dengan referensi terenkripsi menggunakan **Zama FHEVM**.

Seluruh kode berada dalam satu monorepo pnpm:

| Direktori | Isi |
| --- | --- |
| `apps/web` | Aplikasi Next.js: halaman, API, portal penerbit, workflow, migrasi database |
| `packages/ocr` | Render PDF/gambar, pembacaan QR, OCR, dan fixture dokumen sintetis |
| `packages/domain` | Normalisasi atribut, encoding, dan aturan keputusan |
| `packages/credentials` | Payload EIP-712 dan verifikasi signature |
| `packages/chain` | Enkripsi FHE, adapter kontrak, relayer, dan dekripsi hasil |
| `contracts` | Kontrak Solidity, tes Hardhat/FHEVM, dan script deployment |

## Dependensi

Prasyarat sistem:

- **Node.js >= 22.12.0**
- **pnpm 10.19.0** (sesuai `packageManager` di `package.json`)
- **PostgreSQL 16** (opsional untuk demo lokal; wajib untuk mode testnet dan tes integrasi database)
- Wallet browser (misalnya MetaMask) dan SepETH bila menjalankan mode testnet

Python, Docker, dan Tesseract sistem tidak diperlukan karena OCR berjalan sebagai paket JavaScript/WASM.

Dependensi utama, versinya terkunci di `pnpm-lock.yaml`:

| Bagian | Paket |
| --- | --- |
| Web dan API | Next.js 16.3.6, React 19.3.0, TypeScript 5.9.3, Tailwind CSS 4.3.3 |
| Wallet | RainbowKit, Wagmi, Viem |
| Kontrak | Hardhat 2.28.6, solc 0.8.28, OpenZeppelin Contracts 5.6.1 |
| FHE | `@fhevm/solidity` 0.11.1, `@fhevm/hardhat-plugin` 0.4.2, Zama Relayer SDK 0.4.1, ethers 6.16.0 |
| OCR dan QR | tesseract.js 7.0.0 (`ind+eng`), MuPDF.js 1.28.1, zxing-wasm 3.1.4 |
| PDF | pdf-lib 1.17.1 |
| Database | PostgreSQL, Drizzle ORM 0.45.3, Drizzle Kit 0.31.11, `pg` 8.23.0 |
| Pekerjaan latar belakang | Workflow 4.8.9 |
| Pengujian | Vitest 3.2.7, Playwright 1.63.0, solidity-coverage 0.8.17 |

## Instalasi

Jalankan dari root repository:

```powershell
pnpm install --frozen-lockfile
pnpm init:local
pnpm --filter @verifikasi/contracts build
```

- `pnpm install --frozen-lockfile` memasang dependensi persis sesuai lockfile.
- `pnpm init:local` membuat `.env` dari `.env.example` bila `.env` belum ada. File `.env` yang sudah ada tidak ditimpa.
- `pnpm --filter @verifikasi/contracts build` mengompilasi kontrak dan menghasilkan ABI yang dipakai aplikasi web.

## Konfigurasi

Semua konfigurasi dibaca dari `.env` di root repository. Daftar lengkapnya ada di [`.env.example`](.env.example). Private key, URL database, dan token storage hanya untuk server; jangan memakai awalan `NEXT_PUBLIC_` untuk nilai rahasia.

**Aplikasi**

| Variabel | Fungsi |
| --- | --- |
| `APP_MODE` | `demo` (lokal, tanpa transaksi) atau `testnet` (Sepolia) |
| `APP_ORIGIN` | Origin yang dibuka pengguna, dipakai untuk URL QR; default `http://localhost:3000` |
| `PORT` | Opsional; port server Next.js, default `3000`. Samakan dengan `APP_ORIGIN` |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Opsional; Project ID Reown untuk koneksi wallet HP/QR |
| `CRON_SECRET` | Secret acak minimal 32 karakter untuk endpoint maintenance |
| `TRUST_PROXY` | `true` hanya bila berada di belakang satu reverse proxy tepercaya |
| `MAX_COMPARISONS_PER_HOUR` | Batas transaksi pencocokan per jam, default `30` |

**Database dan penyimpanan**

| Variabel | Fungsi |
| --- | --- |
| `DATABASE_URL` | Koneksi PostgreSQL runtime; boleh kosong pada demo lokal |
| `DATABASE_MIGRATION_URL` | Koneksi PostgreSQL untuk `pnpm db:migrate` |
| `DATABASE_POOL_MAX` | Ukuran pool koneksi, default `1` |
| `STORAGE_PROVIDER` | `local`, `neon`, `netlify`, atau adapter lain; isi `local` untuk demo tanpa layanan cloud |
| `PRIVATE_DATA_DIR` | Folder penyimpanan privat saat `STORAGE_PROVIDER=local`, default `.private-data` |
| `S3_BUCKET`, `NEON_STORAGE_*` | Bucket dan kredensial Neon Object Storage saat `STORAGE_PROVIDER=neon` |

**Blockchain (mode testnet)**

| Variabel | Fungsi |
| --- | --- |
| `RPC_URL` | Endpoint RPC Sepolia |
| `CHAIN_ID`, `CHAIN_CONFIRMATIONS` | `11155111` dan jumlah konfirmasi blok, default `2` |
| `CREDENTIAL_CONTRACT_ADDRESS`, `CONTRACT_DEPLOYMENT_BLOCK` | Alamat kontrak dan blok deployment |
| `LEGACY_CREDENTIAL_CONTRACTS` | Opsional; kontrak lama untuk pembacaan saja, format `alamat:cutoffBlock` |
| `RELAYER_PRIVATE_KEY` | Wallet backend pengirim transaksi pencocokan |
| `ATTESTOR_PRIVATE_KEY` | Wallet backend penanda tangan attestation |
| `RESULT_READER_PRIVATE_KEY` | Wallet backend pembaca hasil pencocokan |
| `DEPLOYER_PRIVATE_KEY`, `ADMIN_ADDRESS`, `ATTESTOR_ADDRESS`, `RELAYER_ADDRESS`, `RESULT_READER_ADDRESS` | Hanya untuk deployment kontrak |
| `PLANNED_SIGNER_ADDRESSES` | Alamat signer institusi untuk preflight deployment, dipisahkan koma |
| `ETHERSCAN_API_KEY` | Opsional; verifikasi source di Etherscan |

Admin, attestor, relayer, result reader, dan signer institusi harus memakai lima alamat yang berbeda. Backend menolak konfigurasi bila tiga kunci layanan menghasilkan alamat yang sama. Relayer Zama Sepolia tidak memerlukan API key.

Kontrak aktif di Sepolia adalah `0xd1B25A26A1A022C1fD95996507F851Ec878aaD48`, blok deployment `11846910`.

## Langkah reproduksi

### 1. Demo lokal (tanpa blockchain dan cloud)

Ubah `.env` hasil `pnpm init:local` menjadi:

```dotenv
APP_MODE=demo
APP_ORIGIN=http://localhost:3000
DATABASE_URL=
STORAGE_PROVIDER=local
S3_BUCKET=
```

Lalu jalankan:

```powershell
pnpm dev
```

Buka `http://localhost:3000`. State dan berkas disimpan di `PRIVATE_DATA_DIR`. Untuk mencoba unggahan, gunakan dokumen sintetis di [`packages/ocr/tests/fixtures`](packages/ocr/tests/fixtures). Mode demo menjalankan OCR nyata, tetapi tidak menghasilkan status cocok karena pencocokan FHE memerlukan Sepolia.

### 2. Menyiapkan PostgreSQL lokal

Gunakan database lokal yang dapat dihapus kapan saja, bukan database produksi. Contoh dengan PostgreSQL 16:

```powershell
createdb verifikasi_local
createdb verifikasi_test
```

Isi `DATABASE_URL` dan `DATABASE_MIGRATION_URL` dengan koneksi ke `verifikasi_local`, lalu terapkan migrasi:

```powershell
pnpm db:migrate
```

Migrasi wajib dijalankan sebelum aplikasi memakai database; aplikasi tidak membuat tabel saat berjalan.

### 3. Mode testnet Sepolia

1. Siapkan wallet uji untuk admin/deployer, attestor, relayer, result reader, dan signer institusi, lalu isi variabel blockchain di `.env`. Wallet deployer, relayer, dan signer memerlukan SepETH.
2. Pakai kontrak aktif di atas, atau deploy kontrak baru dari folder `contracts`:

   ```powershell
   cd contracts

   # Preflight, tidak mengirim transaksi.
   node --env-file=../.env node_modules/hardhat/internal/cli/cli.js uas:deploy --network sepolia --expected-chain-id 11155111

   # Deploy kontrak.
   node --env-file=../.env node_modules/hardhat/internal/cli/cli.js uas:deploy --network sepolia --expected-chain-id 11155111 --confirmations 2 --execute

   # Daftarkan institusi dan wallet signer.
   node --env-file=../.env node_modules/hardhat/internal/cli/cli.js uas:register --network sepolia --issuer-id "0x<bytes32>" --name "Institusi Sintetis Uji" --signer "0x<wallet>" --expected-chain-id 11155111 --confirmations 2 --execute

   # Periksa role (hanya membaca chain).
   node --env-file=../.env node_modules/hardhat/internal/cli/cli.js uas:roles --network sepolia

   cd ..
   ```

   Tanpa `--execute`, `uas:deploy` dan `uas:register` hanya menampilkan rencana tanpa mengirim transaksi.
3. Isi `CREDENTIAL_CONTRACT_ADDRESS` dan `CONTRACT_DEPLOYMENT_BLOCK`, ubah `APP_MODE=testnet`, jalankan `pnpm db:migrate`, lalu `pnpm dev`.
4. Buka `/penerbit`, hubungkan wallet signer, terbitkan ijazah, dan unduh PDF ber-QR.
5. Scan QR atau buka `/c/{credentialId}` untuk melihat rekaman. Unggah PDF tersebut di `/verifikasi` untuk menjalankan OCR dan pencocokan FHE.

### 4. Menjalankan pengujian

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @verifikasi/web exec playwright install chromium
pnpm test:e2e
pnpm coverage
```

Tes integrasi database memerlukan `TEST_DATABASE_URL` yang menunjuk ke `verifikasi_test` di localhost. Tanpa variabel ini, suite dilewati.

```powershell
pnpm test:db
```

Untuk E2E lokal, gunakan `APP_MODE=demo` dan port yang tidak sedang dipakai. Tes E2E Sepolia bersifat opt-in (`SEPOLIA_E2E=1`) dan mengirim transaksi testnet nyata.
