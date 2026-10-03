# Wallet tidak dapat menyiapkan pesan di Netlify

Pada pemeriksaan 25 September 2026, `GET https://sage-daifuku-cef5a6.netlify.app/api/session` membalas HTTP 503 (`SERVICE_UNAVAILABLE`). Ini terjadi sebelum permintaan tanda tangan ke wallet: sesi browser harus tersimpan lebih dahulu, lalu server membuat challenge.

Database Supabase yang dikonfigurasi di `.env` lokal dapat dihubungi dan tabel `verification_state` tersedia. Hasil lokal ini tidak membuktikan environment Functions Netlify memakai konfigurasi yang sama. Respons 503 lama tidak mengungkap penyebab internalnya.

## Konfigurasi deployment

Di **Project configuration → Environment variables**, pastikan nilai berikut tersedia untuk **Functions** (atau semua scope), pada konteks **Production**:

| Variabel | Nilai |
| --- | --- |
| `APP_ORIGIN` | `https://sage-daifuku-cef5a6.netlify.app` |
| `DATABASE_URL` | Connection string Supabase Transaction pooler, port 6543, sesuai proyek yang sudah dimigrasi |
| `DATABASE_POOL_MAX` | `1` |
| `APP_MODE` | `testnet` untuk mode Sepolia |

Variabel chain seperti `RPC_URL` dan `CREDENTIAL_CONTRACT_ADDRESS` tetap diperlukan untuk operasi testnet setelah tanda tangan. `.env` lokal diabaikan Git dan tidak otomatis menjadi environment hosting. Jangan mengunggahnya ke repository.

Jika `APP_ORIGIN` masih `http://localhost:3000`, ubah ke domain di atas. Setelah sesi berhasil dibuat, origin yang salah akan menyebabkan `CSRF_REJECTED`. Kode memakai `URL` tepercaya dari Netlify sebagai fallback hanya jika `APP_ORIGIN` kosong; tidak menerima origin arbitrer dari request.

Environment untuk Functions harus dipasang lewat UI, CLI atau API Netlify, bukan `[build.environment]` di `netlify.toml`. **Buat deployment baru setelah mengubah nilai.** Lihat [dokumentasi environment Functions Netlify](https://docs.netlify.com/build/functions/environment-variables/).

## Verifikasi setelah redeploy

1. Buka `/api/session`. Hasil yang benar HTTP 200 dengan JSON `csrfToken`, bukan 503 atau HTML.
2. Muat ulang aplikasi, hubungkan wallet pada jaringan Sepolia, lalu masuk. Request `/api/portal/challenge` harus HTTP 200 sebelum popup tanda tangan muncul.
3. Jika sesi masih gagal, periksa respons JSON dan Function logs. `DATABASE_CONFIGURATION_REQUIRED` berarti runtime belum mendapat `DATABASE_URL`. `SESSION_STORAGE_UNAVAILABLE` berarti akses penyimpanan gagal; log `SESSION_STORAGE` memuat kode aman seperti `28P01` (autentikasi database gagal), `42P01` (tabel belum tersedia), atau `ECONNREFUSED` (koneksi ditolak), tanpa mencetak kredensial.
4. Jika database tujuan memang belum dimigrasi, arahkan `DATABASE_MIGRATION_URL` lokal ke database tersebut dan jalankan `pnpm db:migrate`. Jangan mengubah URL database produksi tanpa memastikan database tujuan.

Sesi dan challenge memerlukan PostgreSQL bersama antar instance. Jangan mengarahkan `PRIVATE_DATA_DIR` ke `/tmp` sebagai pengganti database: sesi dapat hilang atau berbeda antar request.
