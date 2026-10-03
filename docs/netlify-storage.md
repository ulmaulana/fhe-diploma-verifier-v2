# Penyimpanan dokumen di Netlify Blobs

Deployment Netlify otomatis memakai `@netlify/blobs` untuk unggahan, artefak pemeriksaan, dan arsip PDF. `BLOB_READ_WRITE_TOKEN` serta `BLOB_STORE_HOSTNAME` milik Vercel tidak dibutuhkan dan diabaikan pada Netlify. Adapter Vercel tetap tersedia untuk deployment lama di luar Netlify; data yang sudah ada di Vercel tidak dipindahkan oleh perubahan kode ini.

## Eksekusi pemeriksaan di Netlify

Blobs menyimpan berkas. PDF penerbit dibuat dan diarsipkan langsung oleh API setelah pemeriksaan bukti penerbitan; proses ini tidak memerlukan OCR atau Background Functions. Pemeriksaan OCR dan blockchain untuk dokumen unggahan berjalan melalui function native `verification-background`, yang dikirim otomatis oleh server ketika aplikasi berjalan di Netlify. Vercel dan pengembangan lokal tetap menggunakan Workflow SDK. Mengatur `STORAGE_PROVIDER=netlify` di localhost hanya memilih penyimpanan, bukan memindahkan eksekusi ke Background Functions.

Function menerima ID pekerjaan dan token acak per pekerjaan melalui POST server-ke-server. Token tidak dikirim ke browser. Function memeriksa token, masa berlaku, tombstone, dan lease dalam transaksi database sebelum menjalankan OCR. PDF dan transaksi tetap dibaca dari penyimpanan privat. Respons HTTP 202 hanya membuktikan Netlify menerima pengiriman; kemajuan dan hasil tetap dibaca dari database.

Satu lease eksekusi berlaku 16 menit, lebih lama dari batas keras 15 menit Background Functions. Pengiriman duplikat tidak menjalankan pekerjaan yang sedang aktif. Kesalahan sementara dilepas untuk retry Netlify, dengan maksimal tiga upaya eksekusi per generasi. OCR dan transaksi bertanda tangan yang sudah tersimpan digunakan kembali. Function terjadwal `verification-maintenance` berjalan setiap lima menit pada deployment produksi untuk cleanup dan pemulihan pengiriman yang hilang/proses yang mati setelah lease kedaluwarsa. Batch pemulihan dibatasi sepuluh pekerjaan. Retry pengguna membuat generasi baru setelah kegagalan terminal.

Rujukan: [Background Functions](https://docs.netlify.com/build/functions/background-functions/) dan [Scheduled Functions](https://docs.netlify.com/build/functions/scheduled-functions/).

### Menerapkan perbaikan antrean

1. Deploy commit yang memuat kedua function di `apps/web/src/functions`, script build, dan `netlify.toml`. Build menghasilkan entrypoint di `apps/web/dist/netlify-functions`, berikut daftar lengkap dependensi runtime dan aset OCR. Redeploy commit lama tidak menyertakan perbaikan ini.
2. Pastikan `DATABASE_URL`, `APP_ORIGIN`, konfigurasi blockchain, dan `NETLIFY_BLOBS_STORE` tersedia untuk scope Functions. `APP_ORIGIN` harus origin HTTPS kanonis aplikasi, tanpa pengalihan ke domain lain.
3. Tidak perlu menambah token antrean, `JOB_EXECUTION`, `WORKER_API_URL`, atau `WORKFLOW_TARGET_WORLD`. Netlify Blobs memakai kredensial runtime otomatis; PAT hanya diperlukan untuk akses lokal/worker di luar Netlify.
4. Pastikan daftar Functions menampilkan `verification-background` dan `verification-maintenance`. Paket/akun Netlify harus mendukung Background Functions.
5. Pada ijazah yang sudah diterbitkan, pilih **Buat PDF ijazah** atau **Coba kembali** jika PDF lama tertahan. API membuat arsip langsung tanpa menerbitkan ulang kredensial blockchain atau menunggu OCR.
6. Untuk unggahan verifikasi, pantau log function dan hasil pemeriksaan. Kesalahan pemanggilan antrean dicatat sebagai `DISPATCH`; kesalahan pemrosesan menggunakan kode `OCR` atau `FHE`, tanpa mencetak berkas, token, atau pesan mentah penyedia.

Jalankan `pnpm check:netlify` untuk membundel function dengan bundler Netlify dan menguji impor handler, SDK/WASM, PostgreSQL, QR, dan OCR pada arsip terisolasi. Tes ini memakai fixture sintetis, tidak menghubungi database, Blobs, atau blockchain produksi. Pengujian lokal belum membuktikan keberhasilan runtime pada akun Netlify live.

## Environment

- `NETLIFY_BLOBS_STORE=verifikasi-private` (opsional; ini nama default).
- `DATABASE_URL` tetap wajib: PostgreSQL menyimpan sesi wallet, kuota, kepemilikan, dan status pekerjaan. Netlify Blobs menyimpan berkas.
- `APP_ORIGIN` harus sesuai domain aplikasi. Konfigurasi blockchain tetap berlaku untuk mode testnet.
- Gunakan Node.js 22.12 atau lebih baru sesuai kebutuhan SDK Blobs.

Di Netlify Functions, SDK menggunakan kredensial runtime otomatis. Tidak perlu menyalin personal access token ke frontend. Pasang environment runtime melalui UI Netlify, lalu redeploy; setting `[build.environment]` tidak menjadi environment Functions. Lihat [environment Functions](https://docs.netlify.com/build/functions/environment-variables/).

Untuk akses dari `pnpm dev` atau worker di luar Netlify, isi `STORAGE_PROVIDER=netlify`, `NETLIFY_SITE_ID`, dan `NETLIFY_AUTH_TOKEN` di environment server. Gunakan store berbeda untuk pengembangan. Tanpa pilihan itu, demo lokal masih memakai filesystem privat; S3 dan Vercel tetap didukung pada deployment lain.

## Impor environment dan secret scanning

Jangan menandai semua konfigurasi sebagai secret dalam satu impor. Konfigurasi publik seperti `APP_MODE`, `APP_ORIGIN`, `CHAIN_ID`, dan `NETLIFY_BLOBS_STORE` memang muncul di kode, dokumentasi, atau respons aplikasi. Tandai `DATABASE_URL`, `RPC_URL` yang memuat API key, private key layanan, dan token sebagai secret.

Log kegagalan 25 September 2026 menunjukkan build Next.js dan bundling Functions sudah selesai. Deploy dihentikan oleh pemindaian nilai tujuh variabel yang salah ditandai secret: `PRIVATE_DATA_DIR`, `APP_MODE`, `JOB_EXECUTION`, `CHAIN_ID`, `WORKER_API_URL`, `NETLIFY_BLOBS_STORE`, dan `APP_ORIGIN`.

`netlify.toml` mengecualikan hanya ketujuh nama tersebut melalui `SECRETS_SCAN_OMIT_KEYS`. Pemindaian credential dan smart detection tetap aktif; tidak ada pengecualian file atau folder. Setting ini mengatur proses build, bukan mengisi environment runtime. Jangan menambahkan kredensial ke daftar pengecualian atau memakai `SECRETS_SCAN_ENABLED=false`.

Untuk impor berikutnya, pisahkan variabel publik dan secret. Variabel yang sudah ditandai secret tidak dapat sekadar dibuka nilainya dengan melepas flag; jika perlu memperbaiki klasifikasi di UI, buat ulang variabel publik menggunakan nilai yang diketahui. Lihat [Netlify Secrets Controller](https://docs.netlify.com/build/environment-variables/secrets-controller/).

## Alur penyimpanan

1. Browser meminta upload intent. Server memeriksa sesi, CSRF, tipe berkas, kuota, dan batas 10 MiB.
2. Browser mengirim potongan 1 MiB ke `PUT /api/uploads/{id}/parts/{part}`. Setiap request memeriksa sesi pemilik, CSRF, ukuran bagian, masa berlaku, dan idempotency key. Tidak ada token storage di browser.
3. Server merakit bagian saat finalisasi, memeriksa signature berkas dan hash byte sebenarnya, lalu membuat satu pekerjaan pemeriksaan.
4. Artefak berada pada `jobs/{id}/`. Arsip PDF menggunakan `credentials/{id}/{sha256}.pdf` dengan write bersyarat `onlyIfNew` dan verifikasi digest. Cleanup job tidak menghapus arsip.

Pembacaan memakai strong consistency agar finalisasi dapat langsung membaca bagian yang baru diunggah. Store bersifat site-wide sehingga bertahan setelah redeploy. Store ini juga dibagi antar deploy context: gunakan proyek/store dan database terpisah untuk preview; jangan hubungkan preview yang tidak dipercaya ke data produksi. Akses berkas tetap melalui API aplikasi yang memeriksa izin, bukan URL Blobs publik. Lihat [Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/).

Upload dibagi menjadi bagian kecil karena batas payload Functions lebih kecil dari batas berkas aplikasi. Lihat [batas Functions](https://docs.netlify.com/build/functions/configuration/).

## Pemeriksaan setelah deploy

1. `GET /api/session` harus HTTP 200 dengan `uploadMode: "netlify"`. Jika masih 503, perbaiki konfigurasi sesi/database mengikuti [panduan wallet](netlify-wallet.md).
2. Unggah PDF/JPG/PNG. Network browser harus menunjukkan request `parts/0`, dan seterusnya untuk berkas besar, lalu `finalize`; tidak memakai `/api/uploads/token` Vercel.
3. Periksa store `verifikasi-private` di dashboard Netlify. Setelah finalisasi, bagian sementara dibersihkan dan `jobs/{id}/upload.bin` tersimpan.
4. Jalankan alur pemeriksaan dan penerbitan PDF, lalu cek unduhan arsip melalui aplikasi. Pastikan Background Functions dan konfigurasi blockchain tersedia seperti bagian eksekusi di atas.

Tes otomatis memakai SDK asli dengan `BlobsServer` lokal: upload 10 MiB, retry, CSRF/ownership, perubahan byte, kedaluwarsa, serta pemisahan cleanup dan arsip. Tes lokal belum membuktikan kredensial atau koneksi deployment Netlify live.
