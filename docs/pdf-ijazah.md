# PDF ijazah dan arsip privat

Portal Penerbit menghasilkan PDF A4 landscape dari profil publik dalam bukti pengesahan yang telah diverifikasi. Tanggal penerbitan baru dibekukan bersama persiapan kredensial di UI; tanggal untuk kredensial lama dimasukkan oleh penandatangan. Server membekukan tanggal per pekerjaan. Nama institusi, nama lulusan, nomor ijazah, dan program studi tidak dapat dikirim atau diganti lewat API dokumen.

Langkah terakhir portal adalah **Unduh ijazah**. PDF dapat diunduh setelah **Menyiapkan PDF → Menyimpan arsip → Siap diunduh**. Sejak penyelarasan UAS (Oktober 2026), pembuatan PDF penerbit **tidak** lagi menjalankan OCR atau transaksi pencocokan FHE: PDF dibuat dari data penerbitan yang telah diverifikasi, lalu server memeriksa ulang rekaman (`VERIFIED_RECORD`) sebelum arsip ditandai siap dan sebelum setiap unduhan. Gambar QR tetap tersedia sebagai unduhan tambahan; gambar itu hanya mengidentifikasi rekaman, bukan bukti kecocokan isi ijazah.

Untuk kredensial lama, masuk dengan wallet penandatangan aktif institusi, pilih **Buat PDF ijazah** pada daftar kredensial, lalu masukkan tanggal lulus yang sama dengan saat penerbitan. Tidak ada penerbitan ulang: ID, QR, dan transaksi penerbitan tetap sama. Pembuatan PDF tidak mengirim transaksi apa pun. Pencocokan OCR/FHE hanya terjadi ketika pemeriksa mengunggah dokumen di `/verifikasi`.

## API dan otorisasi

| Endpoint | Perilaku |
| --- | --- |
| `POST /api/credentials/{id}/document` | JSON `{ "graduationDate": "YYYY-MM-DD" }`, header `Idempotency-Key`, sesi wallet, Origin dan CSRF; membuat atau melanjutkan pekerjaan. |
| `GET /api/credentials/{id}/document` | Status, versi template, alasan/kode kegagalan, dan alamat unduh jika siap. |
| `GET /api/credentials/{id}/document/download` | PDF attachment privat; memeriksa ulang kewenangan signer dan status rekaman sebelum mengirim berkas. |

Ketiga endpoint membatasi akses pada signer aktif institusi pemilik. Tanggal dan lokasi objek privat tidak dikirim melalui halaman QR atau API rekaman publik. Perubahan wallet menutup kontrol unduh dan membatalkan penggunaan hasil permintaan UI lama.

## Pemeriksaan dan ketahanan

- Template `issued-diploma-v1` memakai font Noto Sans tertanam (lisensi OFL disertakan), empat label terlihat, penanda `TEMPLATE D1`, dan satu QR kanonis. Teks panjang dibungkus. Teks yang tidak muat atau karakternya tidak tersedia menghasilkan kesalahan yang jelas, bukan pemotongan atau penggantian karakter.
- PDF ini dirancang agar dapat dibaca jalur unggahan: MuPDF merender PDF, zxing membaca QR, dan Tesseract membaca piksel sebenarnya ketika pemeriksa mengunggahnya. Metadata PDF tidak memasok atribut. Konfigurasi OCR `tesseract-js-ind-eng-v4` mempertahankan template A1/B1/D1 dan ambang minimum setiap kata 0,90.
- ID kredensial target dikunci pada pekerjaan. Promosi ke `READY` dan setiap unduhan mensyaratkan pemeriksaan rekaman terbaru berstatus `VERIFIED_RECORD`; rekaman dicabut, bukti tidak valid, atau gangguan layanan tidak menyediakan PDF final (unduhan rekaman dicabut → HTTP 409).
- Tabel `credential_documents` memiliki RLS dan metadata privat: institusi, versi, hash PDF, tanggal beku, ID pekerjaan, status, lokasi objek, serta idempotency key. Migrasi: `0002_slow_bucky.sql`.
- Upload sementara berada di `jobs/`; arsip immutable beralamat menurut hash di `credentials/{id}/{sha256}.pdf`. Cleanup unggahan tidak menelusuri namespace arsip. Unduhan memverifikasi kembali hash berkas.
- Kegagalan penyimpanan dapat dicoba kembali; berkas READY tidak ditimpa dan hash PDF yang berubah saat penyimpanan ulang ditolak (`PDF_CHANGED`). Klik berulang dan login baru melanjutkan pekerjaan yang sama melalui idempotency key.
- Tanggal yang berbeda dari tanggal yang dibekukan saat penerbitan ditolak (`DOCUMENT_DATE_MISMATCH`/`DOCUMENT_FROZEN`).
- Diagnostik memakai tahap konfigurasi, RPC, bukti, atau arsip dan kode yang diizinkan. Pesan exception mentah, isi ijazah, kunci, dan endpoint berkredensial tidak dicatat. Pembacaan jaringan sementara dicoba maksimal tiga kali; status bukti tidak valid atau pencabutan tidak diubah menjadi kegagalan jaringan.

## Operasi

Jalankan `pnpm db:migrate`, lalu mulai ulang aplikasi melalui `pnpm dev` atau build/start standar agar `.env` root dan modul terbaru dimuat. Kontrak aktif adalah v2 (lihat [`docs/uas/DEPLOYMENT_RECORD.md`](uas/DEPLOYMENT_RECORD.md)). Production tetap membutuhkan PostgreSQL, private Vercel Blob (atau penyimpanan server/S3 privat pada hosting yang mendukungnya), workflow, RPC, dan layanan Zama yang berfungsi.

Validasi deployment memeriksa WASM, worker OCR, data bahasa, serta font PDF dalam trace build. Hindari menjalankan Next langsung dari direktori yang mengabaikan pemuat `.env` pada `scripts/run-web.mjs`.

Bukti uji nyata dan pengujian dengan mock dipisahkan dalam [laporan pengujian](pdf-ijazah-testing.md).
