# Bukti implementasi dan kriteria penerimaan v1.2

> Konteks versi, 4 Oktober 2026 (WIB): dokumen ini mempertahankan catatan penerimaan historis 24–25 September 2026. Angka tes dan keterangan “belum dijalankan” di bagian bertanggal berlaku untuk eksekusi tersebut. Hasil revisi UAS pada kontrak v2, pengujian PostgreSQL lokal, coverage, dan Sepolia nyata tersedia di [TEST_RESULTS.md](uas/TEST_RESULTS.md), [DEPLOYMENT_RECORD.md](uas/DEPLOYMENT_RECORD.md), serta [STATUS_INSTRUKSI_UAS.md](uas/STATUS_INSTRUKSI_UAS.md). Run final tidak menguji Supabase atau deployment produksi Netlify.

Pemeriksaan lokal dilakukan pada 24 September 2026. E-sign data kredensial, portal penerbitan bertahap, halaman QR langsung, serta pengikatan hasil OCR/FHE ke rekaman terverifikasi sudah diimplementasikan. Belum ada transaksi Sepolia, koneksi Supabase terkelola, atau deployment Vercel dalam sesi ini. Konfigurasi database, RPC, alamat kontrak, dan kunci layanan lokal belum diisi. Tes mock dan fixture tidak membuktikan seluruh MVP bekerja pada jaringan nyata.

## OCR tanpa Docker (25 September 2026)

Worker Python/Docker diganti paket `packages/ocr` (tesseract.js 7.0.0, data `@tesseract.js-data` 4.0.0, MuPDF.js 1.28.1, zxing-wasm 3.1.4) yang berjalan di langkah Workflow. Hasil berikut diperoleh secara lokal pada Windows untuk commit `5120ace` di branch `feat/ocr-tesseract-js`. Deployment Vercel dengan arsitektur ini **belum dijalankan**.

| Pemeriksaan | Hasil dan cakupan |
| --- | --- |
| `pnpm lint` | Lulus: struktur workspace, batas dependensi, ESLint termasuk `packages/ocr` |
| `pnpm typecheck` | Lulus: TypeScript seluruh workspace, Solidity/ABI |
| `pnpm test` | **254 lulus**: 12 kontrak, 52 domain, 11 credentials, 39 OCR (termasuk OCR nyata pada fixture), 40 chain, 100 web/server |
| `pnpm test:db` | **Belum dijalankan** setelah perubahan: tidak ada PostgreSQL lokal tanpa Docker pada mesin ini. CI menjalankannya dengan service PostgreSQL GitHub Actions |
| Build web + `check-deployment` | Lulus. Probe menjalankan MuPDF, zxing, dan tesseract.js `ind+eng` dari salinan trace terisolasi dengan direktori aplikasi sebagai cwd; QR dan teks fixture terbaca. Trace 161 MiB sebelum packaging platform |
| `pnpm test:e2e` | **15 lulus**, termasuk unggahan nyata `synthetic-A1.pdf` melalui Workflow dan OCR in-process yang berakhir aman tanpa testnet (sekitar 3,5 detik). Dijalankan dalam mode demo lokal tanpa database, Blob, atau kunci layanan |

Kesetaraan OCR (Tahap 0 spec), minimum confidence field per kasus:

| Fixture | PDF | Foto JPEG 160 DPI (Pillow, identik `smoke.py`) | PDF resave | Scan PNG 160 DPI |
| --- | --- | --- | --- | --- |
| A1 | 0,92 | **0,8996** | 0,92 | 0,90 |
| B1 | 0,91 | 0,91 | 0,91 | 0,91 |

Seluruh kasus membaca satu QR dan empat atribut dengan nilai persis; fixture `changed-*` membaca nilai yang diubah dan `swapped-qr` membaca QR yang menunjuk rekaman lain. OCR satu halaman sekitar 1 detik dan dokumen lima halaman 3,3 detik secara lokal. Pembanding dari Tesseract native tercatat sebelumnya pada bagian riwayat di bawah (minimum 0,91 untuk enam fixture); Tesseract native tidak terpasang pada mesin ini sehingga perbandingan langsung pada berkas yang sama tidak dijalankan.

**Deviasi yang diketahui:** foto A1 membaca `CONTOH/2026/0042` dengan confidence 89,96, sedikit di bawah ambang 0,90. Nilainya tetap benar; gerbang domain menghasilkan `INCONCLUSIVE` (bukan kecocokan salah) untuk berkas tersebut. Deviasi ini tercatat eksplisit di `packages/ocr/tests/extract.test.ts`. Encoder JPEG lain (MuPDF) menghasilkan confidence yang sama, sehingga selisihnya berasal dari mesin/model, bukan input.

Catatan implementasi: tesseract.js 7.0.0 salah menginisialisasi bahasa berbentuk objek `{ code, data }`, sehingga kedua berkas model publik disalin sekali per instance ke direktori temp privat. zxing-wasm versi browser diberi WASM lokal agar tidak mengunduh dari CDN.

## Riwayat: pemeriksaan 24 September 2026 (worker Python/Docker)

Bagian ini mencatat arsitektur sebelumnya; perintah `test:db:docker`, Ruff, pytest, dan distribusi Python sudah dihapus dari repository.

| Pemeriksaan | Hasil dan cakupan |
| --- | --- |
| `pnpm lint` | Lulus: struktur workspace, batas dependensi, ESLint dan Ruff |
| `pnpm typecheck` | Lulus: TypeScript, Solidity/ABI, sintaks Python |
| `pnpm test` | **227 lulus**: 12 kontrak, 52 domain, 11 credentials, 40 chain, 77 web/server, 35 Python |
| `pnpm test:db:docker` | **8 lulus** pada PostgreSQL Docker terisolasi: migrasi, RLS empat tabel, rollback, concurrency, lease dan retensi bukti penerbitan |
| `pnpm build` | Lulus setelah seluruh perbaikan: kontrak, Next.js produksi dan distribusi Python; route kredensial dan Workflow ikut dibangun |
| Paket deployment | SDK Node Zama, TFHE/TKMS WASM dan driver PostgreSQL berhasil dimuat dari salinan file trace terisolasi; 64 MiB sebelum packaging platform |
| `pnpm test:e2e` | **8 lulus, 1 dilewati**: alur workspace dan lima skenario rekaman; tes OCR nyata opsional tidak diaktifkan pada run v1.2 |

Tes kontrak memakai FHEVM mock lokal. Tes credentials dan backend membuat signature EIP-712 dengan wallet lokal yang benar-benar ditandatangani; pembacaan jaringan pada tes tersebut memakai mock. Tes API memeriksa domain tepercaya, integritas snapshot, kewenangan historis, deadline penerbitan, tujuh status rekaman, penyimpanan sebelum broadcast, serta penolakan data privat tambahan. Tes pipeline dan Workflow memeriksa status rekaman sebelum pencocokan dan setelah dekripsi, termasuk perubahan ke pencabutan, penerbit nonaktif, dan bukti tidak valid.

Tes retensi memeriksa bahwa expiry unggahan satu jam/maksimal 24 jam, penghapusan manual, dan pembersihan riwayat tidak menghapus payload penerbitan. Tes PostgreSQL menerapkan kedua migrasi pada database lokal terisolasi dan membaca kembali signed proof menggunakan koneksi lain. Tidak ada migrasi yang dijalankan terhadap Supabase pengguna.

Tes adapter juga mencakup transaksi penerbitan yang dipercepat lewat wallet: hash transaksi pengganti diterima hanya jika signer, chain, kontrak, nilai dan calldata penerbitan identik. Pembatalan atau transaksi pengganti yang mengubah payload ditolak.

Peringatan circular chunk SDK browser Zama masih muncul saat build. Pytest memberi peringatan deprecation transport HTTP TestClient; seluruh tes tetap lulus. Keduanya tidak menggantikan pengujian jaringan.

## Bukti tampilan

Screenshot berikut diperiksa untuk hierarki informasi, keterbacaan, tombol pemeriksaan tambahan, dan overflow desktop/mobile:

- [Rekaman desktop 1440 px](screenshots/v12-record-desktop.png)
- [Rekaman mobile 390 px](screenshots/v12-record-mobile.png)
- [Rekaman mobile 360 px](screenshots/v12-record-mobile-360.png)
- [Rekaman ketika chain belum dikonfigurasi](screenshots/v12-record-unconfigured.png)
- [Portal sebelum wallet masuk](screenshots/v12-portal.png)

**Screenshot rekaman berhasil memakai respons API fixture sintetis**, termasuk profil Andi Pratama, identitas kampus, blok dan hash. Screenshot tersebut hanya membuktikan tampilan, bukan penerbitan on-chain. Dua screenshot terakhir memakai konfigurasi demo aplikasi yang sebenarnya dan tidak menampilkan penerbitan sukses. Interaksi wallet dan kelima tahap portal pada jaringan nyata belum diuji melalui browser.

Tes browser memastikan halaman QR tidak meminta sesi, upload intent, job OCR, atau wallet. Profil yang disisipkan pada respons `INVALID_PROOF` tidak dirender. Loading, gangguan jaringan, retry, pencabutan, penerbit nonaktif, `NOT_FOUND`, `PENDING`, dan tautan unggahan dengan ID tujuan turut diperiksa. Kamera bawaan ponsel fisik belum diuji; URL tujuan dan viewport mobile diuji melalui Chromium.

## Pemetaan PRD

| Kriteria | Bukti lokal dan batas validasi |
| --- | --- |
| AC-01 | Portal membekukan snapshot, mengesahkan pesan, menyimpan proof sebelum broadcast dan menunggu konfirmasi sebelum QR. Tes kontrak/adapter/API lulus; alur wallet Sepolia belum dijalankan |
| AC-02 | Wallet tanpa kewenangan penerbitan/pencabutan ditolak tes kontrak |
| AC-03 | `MATCH` mensyaratkan `VERIFIED_RECORD`, OCR yang memenuhi syarat dan empat hasil FHE cocok. Domain/pipeline diuji; hasil FHE protokol nyata belum tersedia |
| AC-04 | Normalisasi dan pencocokan berbasis atribut, bukan kesamaan digest file. Fixture foto/resaved pernah diuji OCR; penyambungan FHE testnet belum dibuktikan |
| AC-05 | FHE mock membedakan atribut yang tidak sama; QR tujuan yang berbeda ditolak pipeline. Jalur dokumen tertukar menyeluruh masih perlu testnet |
| AC-06 | Normalisasi menjaga tanda baca, identitas dan makna tanggal; perubahan empat field diuji lokal |
| AC-07 | Confidence rendah, field hilang, tanggal ambigu dan template tak didukung tidak menghasilkan keputusan positif; korpus uji masih sintetis |
| AC-08 | QR asing, ambigu, hilang, dan berbeda dari target ditolak dengan alasan; tidak fetch URL QR |
| AC-09 | `NOT_FOUND` hanya setelah pembacaan chain berhasil; error RPC dan hilangnya proof dibedakan |
| AC-10 | Status diperiksa ulang setelah hasil FHE tersedia; tes polling dan Workflow menolak `MATCH` setelah pencabutan |
| AC-11 | Registry nonaktif memblokir penerbitan/perbandingan; pipeline dan pembacaan akhir menolak keputusan positif |
| AC-12 | Input resmi berasal dari OCR internal dengan token/lease; perubahan commitment, handle atau signer ditolak oleh binding |
| AC-13 | Signature, nonce, domain, relayer, deadline dan replay diperiksa pada tes kontrak/adapter |
| AC-14 | ACL referensi/result diuji pada mock; dekripsi lewat protokol Zama testnet belum dibuktikan |
| AC-15 | API ownership dan browser lintas sesi menolak akses hasil/laporan sesi lain |
| AC-16 | RPC/FHE/proof yang tidak tersedia menghasilkan error atau menunggu; demo tidak membuat keberhasilan chain sintetis |
| AC-17 | Retry, lease, fencing, dispatch ganda dan penyimpanan transaksi idempoten diuji lokal; fee speed-up menerima hash pengganti yang sah. Crash/reorg jaringan nyata belum diuji |
| AC-18 | TTL, tombstone, hapus manual dan penolakan URL lama diuji; bukti penerbitan bertahan. Lifecycle Blob nyata belum diuji |
| AC-19 | PDF memuat mode/scope, status rekaman, keputusan dokumen, serta tx penerbitan dan pencocokan secara terpisah; nilai chain nyata menunggu testnet |
| AC-20 | QR menampilkan rekaman tanpa unggahan dengan `mode: RECORD`, `scope: RECORD_ONLY`, `documentDecision: null`; tidak mengklaim dokumen otomatis cocok |
| AC-21 | Desktop 1440 px dan mobile 390/360 px lulus pemeriksaan visual/overflow. Wallet terhubung belum diuji melalui browser |
| AC-22 | Demo ditandai dan QR demo gagal dengan penjelasan konfigurasi. **Bukti pengesahan/penerbitan/OCR-FHE/pencabutan testnet masih belum tersedia** |
| AC-23–26 | Satu monorepo, dependensi workspace, satu lockfile pnpm, script root dan CI; `packages/credentials` dan `packages/ocr` ikut pemeriksaan struktur, lint, typecheck dan tes |
| AC-27 | Tidak ada jalur penerbitan unsigned; signature payload kosong/salah ditolak kontrak walaupun transaksi memiliki signer |
| AC-28 | Perubahan nama/nomor/program pada snapshot menghasilkan `INVALID_PROOF`; API tidak mengembalikan profil sebagai data resmi |
| AC-29 | Payload berbeda domain, issuer, ID atau handle ditolak; nonce terpakai menolak pengajuan baru |
| AC-30 | GET verifikasi rekaman tidak membuat pekerjaan OCR, transaksi atau nonce baru; tes API dan browser memeriksa kemandirian jalur QR |
| AC-31 | Profil berasal dari snapshot penerbit, disertai instruksi mencocokkan dengan dokumen di tangan pengguna; fixture QR tidak mengklaim membaca tulisan pada kertas |
| AC-32 | Profil publik memakai daftar field eksplisit; tanggal lulus/input proof privat ditolak dari payload publik; tidak ada dekripsi referensi pada jalur QR |
| AC-33 | Deadline lewat/nonce sudah dipakai tidak menggagalkan pembacaan kredensial yang sudah diterbitkan; dibuktikan oleh tes credentials/backend |
| AC-34 | Riwayat otorisasi signer dan hash nama institusi saat penerbitan dipertahankan; rotasi wallet tidak merusak bukti lama; status kampus/pencabutan tetap dibaca |
| AC-35 | Jalur QR tidak membutuhkan OCR atau kunci dekripsi; tes menggunakan hanya akses data publik dan chain |
| AC-36 | Tombol pemeriksaan tambahan opsional, membawa credential ID; jalur OCR/FHE tetap diimplementasikan. Pencocokan FHE nyata belum dibuktikan |
| AC-37 | `/c/{id}` terbuka tanpa login, wallet, upload atau izin kamera web; navigasi dan mobile diuji, scan fisik ponsel belum diuji |
| AC-38 | Chain ada tetapi payload/signature off-chain hilang menghasilkan `ERROR`, bukan `NOT_FOUND` atau profil contoh |

## Bukti lokal sebelum perubahan v1.2

Pada implementasi hosting sebelumnya, tes runtime Workflow lokal membuktikan generated flow/step routes, penolakan pekerjaan yang tidak dimiliki, serta penyelesaian run. Image Docker OCR berhasil dibangun; health/auth HTTP dan parser Tesseract melalui ASGI diuji dengan transport Blob mock. Enam fixture template A1/B1 dalam PDF/JPEG/resaved PDF menghasilkan empat atribut dan QR dengan confidence minimum 0,91. Tes browser unggahan melalui worker nyata pernah lulus dalam mode demo yang berhenti sebelum chain.

Pemeriksaan tersebut tidak diulang sebagai pengujian layanan eksternal pada v1.2. Confidence fixture tidak mengukur dokumen kampus nyata, scan buram, variasi font, akurasi populasi, maupun SLA. Screenshot terdahulu tetap tersedia pada `docs/screenshots` sebagai bukti tahap sebelumnya.

## Validasi yang masih membutuhkan konfigurasi eksternal

1. Terapkan migrasi Drizzle melalui `pnpm db:migrate` pada Supabase yang dituju. Jangan menggunakan database produksi untuk tes integrasi.
2. Deploy kontrak v1.2 baru; isi alamat dan blok deployment, daftar issuer ID dan wallet penandatangan. Kontrak lama tanpa payload e-sign tidak dapat dianggap memenuhi bukti v1.2.
3. Jalankan peninjauan → signature → penerbitan → QR → OCR/FHE → private decryption → pencabutan di Sepolia. Simpan hash/blok transaksi aktual, durasi, dan biaya; periksa pula rotasi wallet, perubahan status saat proses, retry, dan gangguan RPC.
4. Uji deployment Vercel (proyek Next.js, Root Directory `apps/web`), Supabase, Blob privat, OCR in-process, Workflow dan cron dengan fixture sintetis; catat durasi, memori, dan cold start OCR pada Function. Buktikan kemandirian halaman QR ketika OCR/dekripsi tidak tersedia.
5. Pindai QR menggunakan kamera ponsel fisik. Kalibrasikan OCR pada korpus kampus yang disetujui dan uji beban sebelum penggunaan luas.

Langkah konfigurasi tersedia pada [panduan testnet](testnet.md), [panduan Vercel](vercel.md), dan [README](../README.md).
