# Bukti uji PDF ijazah — 25 September 2026

## Pemeriksaan nyata

- Generator menghasilkan satu halaman A4 landscape dengan font tertanam. MuPDF, zxing, dan Tesseract sungguhan berhasil membaca satu QR dan empat atribut dengan ambang minimum kata 0,90. Nama panjang melewati pembungkusan baris dan kembali sebagai nilai kanonis yang tepat. Tampilan PDF diperiksa melalui hasil render PNG.
- Seluruh 39 pengujian paket OCR lolos, termasuk dukungan A1/B1 lama. Beberapa fixture foto lama memang berada di bawah 0,90 dan tetap tidak memenuhi pemeriksaan domain; ambang tidak diturunkan.
- Kredensial Sepolia `0x94041102751df8441d5b53790c9c3d0866fd00219b8ad7fdda64faf774608e1f` dibaca melalui endpoint aplikasi lokal dan menghasilkan `VERIFIED_RECORD`. Sebelum pemuatan ulang modul, endpoint yang sama menghasilkan ERROR sementara kode sumber langsung berhasil. Setelah pemuatan ulang, kedua jalur sepakat. Bukti ini menunjukkan perbedaan runtime telah hilang; penyebab internal exception lama tidak dapat dipastikan karena sebelumnya exception dibuang.
- Gambar QR kredensial tersebut benar-benar diunggah lewat `POST /api/verifications`, diproses oleh workflow/OCR, lalu diperiksa terhadap Sepolia. Pekerjaan `0xec0eba9a8a2d22bf436e8aba51c20aa606a86390f5aa6908782b9f7df8551070` selesai `INCONCLUSIVE`, rekaman `VERIFIED_RECORD`, dengan alasan “Belum dapat memverifikasi isi dokumen—unggah PDF ijazah lengkap”. Tidak ada transaksi pembandingan FHE pada pemeriksaan QR saja.
- Migrasi `0002_slow_bucky.sql` diterapkan pada database yang dikonfigurasi. Kontrak Sepolia tidak diubah atau diterbitkan ulang.
- Setelah restart server melalui pemuat `.env` root, endpoint rekaman tetap menghasilkan HTTP 200 / `VERIFIED_RECORD`. Endpoint status dan unduh dokumen tanpa sesi menghasilkan HTTP 401 / `SESSION_REQUIRED`.

## Pemeriksaan kode dan deployment

`pnpm typecheck`, `pnpm lint`, serta build produksi dan smoke test deployment berhasil. Trace deployment menyertakan font PDF, Zama SDK, kedua WASM kriptografi, MuPDF, zxing, worker Tesseract, dan data bahasa Indonesia/Inggris. Build melaporkan peringatan dependensi chunk melingkar dan dynamic import dari `@vercel/queue`; smoke test isolasi tetap berhasil. Peringatan tersebut belum dihilangkan.

## Pengujian menggunakan mock

Suite aplikasi terakhir: **121 tes dalam 12 berkas lolos**. Suite tersebut mencakup OCR/PDF dan penyimpanan lokal nyata serta pengujian dengan mock yang dibedakan di bawah. Suite OCR terpisah: **39 tes lolos**; browser: **2 tes lolos**.

- `documents.test.ts`: pembatasan wallet/institusi/CSRF, permintaan bersamaan, login baru, unduhan setelah cleanup, immutable READY, tanggal beku dan koreksi setelah mismatch, kegagalan penyimpanan, integritas hash, pemulihan transaksi dan pemeriksaan ulang pencabutan. PDF, penyimpanan berkas, serta state lokal nyata; chain dan dispatch workflow dimock.
- `record-pipeline.test.ts`: QR saja, RPC ERROR, bukti tidak valid, rekaman belum terkonfirmasi, OCR kurang jelas, hasil MATCH, serta pencabutan di pemeriksaan terakhir. Chain/FHE dimock.
- Playwright menjalankan alur login wallet fixture, pembuatan dokumen, polling, unduhan PDF sungguhan melalui browser, reload, dan pergantian wallet pada viewport 1280 dan 390 piksel. API dokumen/profil penerbit dimock; pengujian ini tidak membuktikan transaksi Sepolia. Kedua tes lolos, tanpa overflow horizontal. Screenshot tersedia pada `apps/web/test-results/` saat tes dijalankan.

## Batas bukti end-to-end

Belum ada klaim bahwa PDF kredensial pengguna telah menghasilkan MATCH melalui FHE Sepolia. Tanggal lulus asli diminta kepada pengguna dan belum tersedia saat laporan ini dibuat. Tanggal tidak ditebak. Uji tanggal salah, PDF yang diubah, dan pencabutan melalui transaksi Sepolia nyata juga belum dilakukan pada kredensial pengguna; cakupan tersebut saat ini berasal dari tes pipeline/mock.

Setelah tanggal diberikan: buat PDF untuk ID yang sama melalui portal, tunggu READY, unduh, logout/login lalu unduh ulang, unggah PDF pada `/verifikasi`, dan catat ID pekerjaan serta transaksi pencocokan dari kedua pemeriksaan. Jangan mencabut kredensial pengguna untuk pengujian; gunakan kredensial uji terpisah jika pengujian pencabutan nyata diperlukan.
