# Hosting Vercel dengan PostgreSQL Supabase

Target konfigurasi ini adalah **satu proyek Vercel Next.js biasa** untuk web, API, OCR, Workflow, dan Blob privat. OCR berjalan di dalam Function langkah Workflow melalui paket `packages/ocr` (tesseract.js, MuPDF.js, zxing-wasm); tidak ada Docker, container, atau Vercel Services. PostgreSQL dikelola Supabase; kontrak tetap berjalan pada Sepolia/Zama. Seluruh kode berada dalam monorepo yang sama.

Konfigurasi deployment berada di `apps/web/vercel.json`. Pengujian lokal, termasuk `scripts/check-deployment.mjs`, tidak membuktikan deployment cloud berhasil.

## Susunan deployment

| Bagian | Konfigurasi repository |
| --- | --- |
| Proyek | Next.js, Root Directory `apps/web`, build `pnpm build:vercel` |
| OCR | In-process di langkah Workflow; tesseract.js `ind+eng`, MuPDF.js, zxing-wasm; WASM dan data bahasa ikut trace deployment |
| Database | Supabase PostgreSQL melalui Drizzle ORM dan `pg` |
| Dokumen sementara | Vercel Blob **private**, token hanya pada backend |
| Pekerjaan | Workflow SDK, metadata persisten di database |
| Pemeliharaan | `/api/internal/maintenance`, cron sekali sehari (`0 0 * * *`, kompatibel dengan batas Hobby) |

OCR tidak memiliki endpoint publik maupun internal. Dokumen dibaca langkah Workflow dari penyimpanan privat, digest diperiksa ulang, lalu diproses di Function yang sama. Isolasi parser dokumen memakai sandbox memori WASM untuk MuPDF dan zxing, worker thread tesseract.js baru per dokumen yang dihentikan saat selesai atau timeout, batas ukuran/halaman/piksel sebelum rendering, batas durasi Function, dan batas percobaan Workflow. Isolasi ini berbeda dari proses OS terpisah pada worker Python sebelumnya. Model bahasa publik disalin sekali per instance ke direktori temp privat (`/tmp` pada Vercel); dokumen tidak pernah ditulis ke sana.

## 1. Siapkan Supabase dan migrasi

Ambil connection string dari menu **Connect** proyek Supabase. Gunakan **Transaction pooler, port 6543**, sebagai `DATABASE_URL` runtime. Gunakan koneksi direct atau **Session pooler, port 5432**, sebagai `DATABASE_MIGRATION_URL` untuk migrasi; session pooler berguna ketika mesin migrasi tidak memiliki IPv6. Ikuti hostname, SSL, username, dan encoding password dari konfigurasi proyek. [Pilihan koneksi Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres).

Isi `.env` root lokal dengan kedua URL, lalu jalankan:

```powershell
pnpm install --frozen-lockfile
pnpm db:migrate
```

Migrasi yang sudah dilacak berada di `apps/web/drizzle`. Setelah mengubah schema aplikasi, buat migrasi baru dengan `pnpm db:generate`, tinjau SQL-nya, lalu jalankan `pnpm db:migrate`. Migrasi tidak dijalankan ketika request masuk maupun saat build preview. `DATABASE_MIGRATION_URL` hanya dibutuhkan mesin/CI yang menjalankan migrasi; tidak perlu dimasukkan ke runtime Vercel. [Panduan Drizzle Supabase](https://supabase.com/docs/guides/database/drizzle).

Runtime memakai pool kecil (`DATABASE_POOL_MAX=1` secara default), tanpa named prepared statements atau session advisory lock. Lease relayer tersimpan dalam tabel dengan owner token dan expiry agar kompatibel dengan transaction pooling. Tabel aplikasi mengaktifkan RLS tanpa policy untuk role browser; jangan menambahkan akses `anon`/`authenticated` ke metadata sesi. Koneksi database hanya digunakan backend.

Model database ini masih prototipe: `verification_state.body` adalah satu JSONB bertipe yang dikunci secara transaksional untuk menjaga kuota, kepemilikan, idempotensi, dan antrean. Tabel `verification_relayer_leases` menyimpan lease transaksi. Ini belum merupakan antrean terukur untuk beban besar.

Migrasi v1.2 menambah `credential_drafts` dan `signed_credentials` untuk snapshot publik serta payload e-sign. Bukti penerbitan disimpan terpisah dari pekerjaan/Blob sementara dan tidak ikut dihapus oleh TTL unggahan. Kedua tabel tetap hanya diakses melalui backend. Sebelum memakai portal baru, terapkan semua migrasi, deploy kontrak v1.2 baru, dan daftarkan institusi serta wallet penandatangan mengikuti [panduan testnet](testnet.md).

## 2. Hubungkan Blob privat

Buat Vercel Blob store dengan akses **Private** dan hubungkan ke proyek. Jangan gunakan store Public untuk ijazah. Sediakan `BLOB_READ_WRITE_TOKEN` dan `BLOB_STORE_HOSTNAME` berupa hostname tepat seperti `storeid.private.blob.vercel-storage.com`, tanpa `https://` atau path. [Keamanan Blob privat](https://vercel.com/docs/vercel-blob/security).

Browser meminta intent dan token upload yang terikat sesi/CSRF, lalu mengirim dokumen langsung ke Blob. API finalisasi hanya menerima ID intent; server mengambil objek dari path yang ditentukannya sendiri, memeriksa ukuran, MIME, signature PDF/JPG/PNG, dan digest aktual, kemudian membuat job. URL arbitrary dari browser tidak dipakai. Jalur ini mendukung batas produk 10 MiB tanpa melewatkan badan dokumen melalui Function. [Client uploads](https://vercel.com/docs/vercel-blob/client-upload).

Langkah OCR membaca berkas privat dengan kredensial backend, memeriksa ukuran dan digest lagi, lalu menjalankan OCR. File, teks OCR, hasil, serta transaksi bertanda tangan disimpan di Blob privat. Argumen dan hasil langkah Workflow dibatasi pada ID, status, dan metadata kendali; dokumen dan atribut tidak dimasukkan ke riwayat Workflow.

## 3. Konfigurasi proyek Vercel

Impor repository, lalu pada **Settings → Build and Deployment**:

1. **Framework Preset = Next.js**.
2. **Root Directory = `apps/web`**. Vercel menjalankan instalasi dari root workspace pnpm; `apps/web/vercel.json` menetapkan `pnpm install --frozen-lockfile` dan `pnpm build:vercel`.
3. Hapus override build/install command lama yang ditujukan ke konfigurasi Services.
4. Deploy ulang commit terbaru. Redeploy deployment lama tetap memakai source commit lama.

### Migrasi dari konfigurasi Services lama

Deployment sebelum 25 September 2026 memakai `vercel.json` root dengan Services dan container OCR. Konfigurasi itu sudah dihapus. Jika proyek Vercel masih memakai **Framework Preset = Services** atau Root Directory kosong, ubah ke Next.js dan `apps/web` seperti di atas. Hapus juga variabel lama yang tidak dibaca lagi: `PORT`, `OCR_SERVICE_URL`, `WORKER_API_TOKEN`, `WORKER_API_URL`, dan `JOB_EXECUTION`. Lihat [pengaturan Root Directory](https://vercel.com/docs/builds/configure-a-build#root-directory).

### Build dan environment

Build web juga menjalankan `scripts/check-deployment.mjs`: file yang tercantum dalam trace langkah Workflow disalin ke direktori sementara, lalu SDK Node Zama, driver PostgreSQL, dan mesin OCR dijalankan dari salinan tersebut. Probe OCR membaca QR dan teks fixture sintetis dengan direktori aplikasi sebagai direktori kerja, sama seperti Function. Build gagal bila WASM tesseract.js, MuPDF, zxing, data bahasa `ind`/`eng`, atau dependency SDK tidak ikut terpaket. Ukuran trace lokal terakhir 161 MiB sebelum packaging platform.

Isi environment untuk environment deployment yang dituju:

| Variabel | Nilai atau fungsi |
| --- | --- |
| `APP_MODE` | `demo` untuk memeriksa jalur hosting tanpa transaksi; `testnet` setelah chain dikonfigurasi |
| `APP_ORIGIN` | Origin HTTPS kanonis aplikasi, tanpa trailing slash |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Project ID publik Reown untuk RainbowKit mobile/QR; opsional untuk wallet ekstensi. Tetapkan sebelum build dan rebuild jika berubah |
| `DATABASE_URL` | URL Supabase transaction pooler, port 6543 |
| `DATABASE_POOL_MAX` | `1` sebagai default prototipe |
| `BLOB_READ_WRITE_TOKEN` | Secret store Blob privat |
| `BLOB_STORE_HOSTNAME` | Host store Blob privat yang sama persis |
| `CRON_SECRET` | Secret acak minimal 32 karakter untuk endpoint maintenance |
| `TRUST_PROXY` | `true` pada Vercel untuk kuota sumber berbasis forwarded IP |

`APP_ORIGIN` harus sama dengan origin yang dibuka pengguna: nilainya dipakai untuk QR, pemeriksaan origin/CSRF, dan callback upload. QR dari origin lain ditolak dengan hasil belum dapat diverifikasi. Tetapkan domain stabil sebelum menerbitkan QR. Preview membutuhkan `APP_ORIGIN` preview yang sesuai serta database dan Blob store terpisah; jangan arahkan preview ke data produksi.

Untuk mode testnet, tambahkan RPC dan seluruh secret/address pada [panduan testnet](testnet.md). Jangan memakai awalan `NEXT_PUBLIC_` untuk token Blob, database, atau private key layanan. Mode demo tetap menjalankan OCR nyata; pencocokan chain yang belum dikonfigurasi berakhir dengan penjelasan, bukan hasil cocok sintetis.

## 4. Workflow, cron, dan retensi

Next.js memakai wrapper Workflow pada build. Finalisasi unggahan menyimpan job sebelum dispatch, sehingga retry atau maintenance dapat memulihkan pengiriman yang gagal. Langkah OCR menjalankan `extractDocument` di Function; langkah transaksi menyimpan transaksi bertanda tangan sebelum broadcast; polling/dekripsi dilakukan dalam langkah terpisah dengan `sleep`, bukan satu request yang menunggu seluruh proses. [Vercel Workflows](https://vercel.com/docs/workflows).

Konfigurasi route aplikasi menetapkan batas 300 detik. Route langkah yang dihasilkan SDK Workflow memakai durasi maksimum paket Vercel; ini tetap dibatasi paket, bukan proses komputasi tanpa batas. OCR dibatasi 210 detik per dokumen dan 35 detik per halaman, RPC ethers 20 detik, serta operasi proof/dekripsi SDK 60 detik. Kesalahan dokumen (password, lebih dari lima halaman, berkas rusak, resolusi berlebih) menjadi hasil belum dapat diverifikasi; timeout dan kegagalan mesin OCR diulang oleh Workflow. Pada pengujian lokal, OCR satu halaman sekitar 1 detik dan lima halaman 3,3 detik; ukur ulang cold start, memori, dan durasi pada Vercel.

Unggahan memulai Workflow segera setelah finalisasi, tanpa menunggu cron. Workflow menjadwalkan cleanup satu jam setelah pekerjaan terminal. Cron menjadi cadangan untuk memulihkan dispatch yang terlewat dan menghapus artefak kedaluwarsa, termasuk staging upload yang ditinggalkan. Endpoint maintenance memeriksa `Authorization: Bearer <CRON_SECRET>`; Vercel mengirim secret cron yang dikonfigurasi. Jangan menonaktifkan maintenance untuk menjalankan deployment biasa.

**Default repository memakai `0 0 * * *`, sekali sehari pada jam 00 UTC (07 WIB), agar diterima paket Hobby.** Pada Hobby, pemanggilan dapat terjadi kapan saja dalam jam tersebut; jadwal bukan jaminan eksekusi tepat pukul 07.00. Pro atau Enterprise dapat memakai `*/5 * * * *` jika diperlukan maintenance lebih sering. [Batas Cron Vercel](https://vercel.com/docs/cron-jobs/usage-and-pricing).

Cron harian memperlambat pemulihan cadangan: dispatch yang gagal perlu dicoba kembali oleh pengguna atau menunggu maintenance, dan pekerjaan dapat kedaluwarsa sebelum cron berikutnya. Jika Workflow terhenti dan tidak ada request pembersihan, penghapusan fisik unggahan/staging dapat menunggu maintenance harian berikutnya. Jadwal ini tidak menjamin penghapusan fisik dalam satu jam atau tepat pada batas 24 jam saat terjadi gangguan; gunakan scheduler yang lebih sering jika target operasional tersebut diperlukan. Batas akses API tetap diberlakukan berdasarkan expiry meskipun berkas belum terhapus secara fisik.

Batas akses artefak adalah satu jam setelah pekerjaan terminal dan maksimal 24 jam sejak intent/unggah. Penghapusan fisik dijalankan oleh cleanup terjadwal atau request berikutnya; keterlambatan scheduler, kegagalan storage, atau gangguan layanan dapat menunda penghapusan fisik. Karena itu akses ditolak berdasarkan expiry/tombstone terlebih dahulu. Intent staging berlaku sepuluh menit dan tombstone mencegah callback/retry menghidupkan kembali job yang dihapus.

## 5. Pemeriksaan sebelum memakai dokumen nyata

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm test:db
pnpm --filter @verifikasi/web build:vercel
```

`pnpm test:db` membutuhkan `TEST_DATABASE_URL` yang menunjuk PostgreSQL lokal sekali pakai; runner menolak hostname non-localhost dan tidak memakai `DATABASE_URL` aplikasi. CI menyediakan PostgreSQL melalui service GitHub Actions. Repository tidak memerlukan Docker.

Pengembangan lokal cukup dengan `pnpm dev`: Workflow memakai world lokal, dan mode demo tanpa `DATABASE_URL` memakai state serta penyimpanan file di `PRIVATE_DATA_DIR`. Untuk memeriksa runtime Workflow tanpa dokumen atau layanan eksternal, jalankan `pnpm dev`, lalu `node apps/web/tests/integration/workflow-smoke.mjs` di terminal lain.

Setelah deployment nyata tersedia, gunakan fixture sintetis dari `packages/ocr/tests/fixtures` untuk memastikan upload 10 MiB, status OCR, retry, dua sesi terpisah, penghapusan, pemulihan cron, dan hasil terminal benar. Periksa bahwa database tidak mempunyai akses browser dan tidak ada dokumen/token/teks OCR pada log.

Hasil validasi lokal, pemetaan kriteria PRD, screenshot, serta pemisahan bukti mock dan jaringan nyata tersedia pada [catatan penerimaan](acceptance.md). Adapter Blob memakai mock; tes pipeline Workflow memakai stub layanan eksternal. Angka tes lokal tidak menyatakan pengujian cloud berhasil.

**Koneksi ke Supabase terkelola, upload Blob nyata, deployment Vercel dengan OCR in-process, dan alur penuh Sepolia belum diuji**, karena kredensial serta deployment eksternal belum tersedia. Catat hasil cloud aktual pada `docs/acceptance.md` setelah dijalankan; jangan menyamakan tes lokal dengan bukti deployment.
