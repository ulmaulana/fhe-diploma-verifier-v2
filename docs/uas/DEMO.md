# Reproduksi dan demo UAS Blockchain

Tanggal: **4 Oktober 2026 (WIB, UTC+07:00)**. Demo Sepolia lengkap sudah dijalankan lewat UI: **12 lulus, 0 gagal, 0 skip**, kode `f32afe67b39af7b38e524e263bc63b5a0973c5a6`, pukul **21:53–22:02 WIB**. Verifikasi lokal bersih pada `8a13faaaac696700c8018cc6c947682028393afc` juga selesai. [TEST_RESULTS.md](TEST_RESULTS.md) membedakan tes lokal/mock, OCR lokal nyata, dan Sepolia nyata serta mempertahankan run yang gagal.

**Revisi 5 Oktober 2026:** checkout terbaru menerapkan [confidence OCR 70%](PERUBAHAN_KEBIJAKAN_OCR_70.md), dengan penolakan hanya saat keempat skor valid semuanya <70%. Gunakan revisi terbaru untuk demo aturan ini; rekaman video 4 Oktober menampilkan kebijakan lama. Tes keputusan confidence menggunakan fixture terkontrol dan PDF/OCR nyata lokal, bukan klaim transaksi Sepolia baru.

Untuk menerapkan revisi ke Netlify, pengguna perlu membangun dan menerbitkan source terbaru setelah penyelarasan konfigurasi v2 pada bagian Netlify dokumen ini. Ambang/kebijakan bukan environment variable; keduanya dikompilasi dari paket domain dan tercatat pada hash OCR v6. Kontrak, skema atribut dan data penerbitan tidak perlu dimigrasikan untuk perubahan confidence ini. Agent tidak mengubah atau menerbitkan situs produksi.

## 1. Jalur demo lokal tanpa transaksi

Prasyarat: Node **22.12.0 atau lebih baru** (run aktual memakai 24.21.0), pnpm **10.19.0**, dan browser Chromium untuk E2E. Gunakan checkout bersih pada revisi yang ingin direproduksi. Tidak perlu menambah dependency npm.

```text
pnpm install --frozen-lockfile
pnpm init:local
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm dev
```

`init:local` membuat `.env` dari `.env.example` bila belum ada; bila sudah ada, konfigurasi dipertahankan. Periksa konfigurasi lokal melalui editor sebelum menjalankan: **`APP_MODE=demo`**, origin localhost port **3000**, tanpa koneksi database produksi maupun kunci/RPC layanan. Buka `http://localhost:3000/verifikasi`.

| Langkah UI | Ekspektasi |
| --- | --- |
| Buka “Mode demo lokal · Jelajahi contoh hasil”, pilih “Tampilkan contoh” | Heading “Atribut cocok”, dengan label **“Contoh tampilan dengan data sintetis. Bukan hasil verifikasi blockchain.”** |
| Unduh hasil, buka Riwayat Saya, hapus data dokumen | Laporan contoh tersimpan; riwayat milik sesi; artefak yang dihapus tidak lagi dapat diunduh. |
| Unggah `packages/ocr/tests/fixtures/synthetic-A1.pdf` | OCR nyata membaca atribut, lalu heading **“Layanan verifikasi terganggu”** karena testnet tidak dikonfigurasi. Tidak ada MATCH blockchain atau transaksi. |
| Buka portal penerbit | Mode demo menyatakan bahwa pengesahan dan penerbitan membutuhkan konfigurasi testnet. |

Untuk mengulang E2E lokal, hentikan server dev terlebih dahulu, gunakan build yang sudah selesai, dan set environment **`APP_MODE=demo`, `SEPOLIA_E2E=0`, `CI=1`**, port **3000**. Jalankan `pnpm test:e2e`; Playwright menyalakan/mematikan server sendiri. Hasil final aktual: **25 lulus, 12 skip Sepolia opt-in**. Fixture QR OCR memakai origin localhost:3000; mengubah port tanpa memperbarui fixture akan mengubah kasus uji.

## 2. Menyiapkan Sepolia dengan database lokal

Sepolia memakai jaringan nyata dan SepETH wallet uji. Semua persistensi uji tetap di PostgreSQL Docker lokal, **bukan Supabase**. Jangan memuat data pribadi asli, private key utama, seed phrase, atau aset mainnet.

| Komponen | Konfigurasi run aktual / kebutuhan reproduksi |
| --- | --- |
| Kontrak aktif v2 | `0x65b1C8C7B59D9651F8619F287Bc1c309FaE094e0` |
| Jaringan dan konfirmasi | `CHAIN_ID=11155111`, `CHAIN_CONFIRMATIONS=2`; backend menegakkan sekurangnya dua konfirmasi |
| Awal deployment v2 | `CONTRACT_DEPLOYMENT_BLOCK=11841227` |
| Institusi sintetis yang dipakai ulang | `0xd4aadc1f7b58512ea3b4974d82df569c4cb734aa8049aed5377cb95e8caf62ab`, nama **Universitas Sintetis UAS (Uji)** |
| Kontrak v1 dipercaya hanya baca | `LEGACY_CREDENTIAL_CONTRACTS=0x39de125002edA28c886d9125AE5d61BB5BE04903:11841226` |
| Database aplikasi uji | Docker `verifikasi-uas-pg`, PostgreSQL 16, host loopback, port **54329**, database **verifikasi_local** |
| Database integrasi tes | Host/port sama, database terpisah **verifikasi_test**, hanya melalui `TEST_DATABASE_URL` |
| Origin aplikasi | `APP_ORIGIN=http://localhost:3000`, `APP_MODE=testnet` |
| Layanan | `RPC_URL` privat, `RELAYER_PRIVATE_KEY`, `ATTESTOR_PRIVATE_KEY`, `RESULT_READER_PRIVATE_KEY`; ketiganya berbeda dan memiliki role masing-masing |
| Pembatasan relayer | `MAX_COMPARISONS_PER_HOUR=30` |

Siapkan container/dua database lokal dan koneksi runtime/migrasi melalui berkas rahasia di luar evidence. Jangan menyalin koneksi Supabase ke konfigurasi uji. `DATABASE_URL` dan `DATABASE_MIGRATION_URL` harus menunjuk database **verifikasi_local** loopback; `TEST_DATABASE_URL` hanya **verifikasi_test** loopback. URL dan password tidak ditulis dalam panduan ini.

Sebelum migrasi, pemeriksaan berikut hanya mencetak keberhasilan guard dan tidak mencetak nilai koneksi:

```text
node --env-file=.env -e "for(const n of ['DATABASE_URL','DATABASE_MIGRATION_URL']){const u=new URL(process.env[n]);if(!['localhost','127.0.0.1','[::1]'].includes(u.hostname)||u.port!=='54329'||u.pathname!=='/verifikasi_local')throw new Error('Target DB uji ditolak');}console.log('Guard DB lokal verifikasi_local lulus');"
pnpm db:migrate
pnpm build
```

Gunakan rahasia wallet uji milik operator dari penyimpanan lokal yang aman. Alamat publik peran pada run yang sudah selesai:

| Peran | Alamat Sepolia | Tindakan |
| --- | --- | --- |
| Administrator/deployer | `0xCa01c8C68840cd1C9fdF06F124723a5339224096` | Registry institusi/signer; tidak dipakai sebagai layanan |
| Penandatangan institusi | `0x399a8A182631de9389B3fB3488537c9461d3a43e` | Pengesahan EIP-712, penerbitan dan pencabutan; sudah aktif pada institusi di atas |
| Attestor | `0x6512e69e2aDb0bba5cF96548546809b9B6f702b5` | Pengesahan unggahan terikat hasil OCR |
| Relayer | `0xea36d9628c7CaCa078FbD0a9164A5cF0FAc52933` | Membayar/mengirim transaksi comparison |
| Result reader | `0x84Bd1D6C317554Ff3539Ec62Da6B2F8f882c8B5e` | Dekripsi boolean hasil, bukan nilai referensi |
| Pemeriksa | Tidak membutuhkan wallet | QR, unggahan dan riwayat memakai sesi aplikasi |

Saldo SepETH yang cukup diperlukan oleh signer dan relayer. Registry yang sudah ada harus dipakai ulang: jangan membuat ID institusi baru dengan signer yang masih aktif pada institusi ini. Menyimpan kewenangan yang tidak berubah harus ditolak sebelum transaksi. Jika operator memakai wallet lain, administrator perlu mendaftarkan institusi/signer baru secara sah; tindakan itu berbeda dari reproduksi dengan wallet uji existing.

## 3. Fixture dan langkah demo Sepolia lewat UI

Seluruh identitas dan tanggal berikut **fiktif/sintetis**, diambil dari `apps/web/tests/e2e/sepolia.spec.ts`. Tanggal lulus digunakan dalam referensi terenkripsi dan arsip PDF privat; tidak dipublikasikan pada respons rekaman QR.

| Fixture | Nama | Nomor ijazah | Program | Tanggal sintetis |
| --- | --- | --- | --- | --- |
| A | ANDI PRATAMA | UAS/2026/A001 | INFORMATIKA | 2026-08-15 |
| B | BUDI SANTOSO | UAS/2026/B002 | SISTEM INFORMASI | 2026-07-20 |
| C | CITRA LESTARI | UAS/2026/C003 | INFORMATIKA | 2026-06-10 |

1. Buka `/penerbit`, hubungkan wallet uji pada Sepolia, lalu tandatangani pesan masuk. Beralih wallet/jaringan membatalkan sesi; masuk kembali untuk akun yang digunakan. Gunakan administrator untuk memeriksa registry institusi dan signer existing. Jangan mengirim ulang perubahan registry yang sama.
2. Masuk sebagai signer. Pada **Portal Penerbitan Ijazah Mahasiswa**, isi A, klik **“Siapkan data untuk ditinjau”**, periksa profil publik dan tanggal privat, centang persetujuan peninjauan, lanjutkan pengesahan EIP-712 dan kirim penerbitan. Tunggu **“Kredensial berhasil diterbitkan”** dan unduh PDF. Ulangi untuk B/C.
3. Buka QR A dalam sesi tanpa wallet: heading **“Rekaman ijazah terverifikasi”**, `VERIFIED_RECORD`/`RECORD_ONLY`. Belum ada keputusan kecocokan dokumen. Pembuatan/unduh PDF institusi memakai arsip penerbitan yang disahkan; tidak melalui OCR atau transaksi FHE comparison.
4. Unggah PDF A asli melalui `/verifikasi`: **“Atribut cocok”**, empat field MATCH. Pemeriksa tidak menandatangani transaksi; relayer backend mengirim comparison FHE.
5. Unggah salinan A yang hanya mengubah nama menjadi **ANDRI PRATAMA** dan mempertahankan QR A: **“Ditemukan ketidaksesuaian”**; nama MISMATCH, tiga atribut lain MATCH.
6. Dari tautan QR A, pilih unggahan B: **“Belum dapat diverifikasi”**, karena QR berbeda dari target. Tidak ada transaksi comparison.
7. Unggah dokumen dengan **QR B tetapi seluruh atribut A** melalui halaman verifikasi tanpa target A: MISMATCH terhadap B, bukan terhadap A. Run aktual menghasilkan empat boolean false.
8. Unggah PDF dengan QR ber-origin **`https://foreign.invalid`**: INCONCLUSIVE tanpa transaksi. Ini fixture QR asing; fixture `synthetic-A1.pdf` bawaan memiliki origin lokal dan ID yang tidak ditemukan sehingga bukan pengganti kasus ini.
9. Dalam **Data Ijazah Mahasiswa**, cabut C dan konfirmasikan tindakan. QR C menampilkan **“Kredensial dicabut”** dan **“Jejak pencabutan”**. Unduh PDF C ditolak HTTP 409; unggah PDF C yang telah tersimpan menghasilkan REVOKED tanpa comparison baru.
10. Buka `/riwayat` dalam sesi pemilik, unduh laporan hasil MATCH. Run aktual memiliki enam job, laporan PDF HTTP 200; sesi asing mendapat HTTP 401.
11. Buka rekaman v1 yang memiliki bukti pengesahan tersimpan dan berada dalam allowlist/batas migrasi. UI menjelaskan kompatibilitas baca saja. Jangan mencoba menganggap signature v1 sebagai signature kontrak v2 atau hasil QR sebagai MATCH dokumen.

PDF skenario negatif dibuat oleh spec memakai generator PDF aplikasi, dengan ID/QR hasil penerbitan run yang sama. Pengubahan nama atau QR tidak mengubah bukti penerbitan sah pada server. Jika melakukan demo manual, siapkan variasi setara sebelum sesi dan pastikan OCR membaca teks sesuai perubahan.

Run baru menghasilkan ID kredensial/PDF baru walaupun data sintetis sama. PDF evidence lama menyimpan origin localhost dan memerlukan arsip/bukti server run lama; tidak otomatis dapat dipakai pada checkout/DB baru atau domain Netlify. Untuk demo baru, terbitkan A/B/C dan gunakan PDF/QR dari origin aplikasi yang sedang didemokan.

## 4. Mengulang E2E Sepolia opt-in

Spec memerlukan environment dalam **proses Node test**, selain `.env` runtime aplikasi. Simpan konfigurasi E2E privat dalam berkas **di luar repo**, tanpa mencetak isinya. Variabel yang perlu disediakan:

| Variabel | Kegunaan / nilai publik |
| --- | --- |
| `SEPOLIA_E2E=1`, `CI=1` | Mengaktifkan suite nyata dan server Playwright sendiri |
| `SEPOLIA_E2E_ADMIN_KEY`, `SEPOLIA_E2E_SIGNER_KEY` | Rahasia wallet uji; hanya proses Node test |
| `SEPOLIA_E2E_ISSUER_ID` | ID existing pada bagian 2; wajib diisi untuk signer existing ini |
| `SEPOLIA_E2E_ISSUER_NAME` | Universitas Sintetis UAS (Uji) |
| `SEPOLIA_E2E_EVIDENCE_DIR` | Folder output baru per run, agar evidence tidak ditimpa |
| `SEPOLIA_E2E_VIDEO=1` | Merekam UI sebenarnya ke WebM |
| `SEPOLIA_E2E_LEGACY_ID` | Opsional: ID rekaman v1 yang bukti pengesahannya sudah ditanam ke DB lokal |
| `RPC_URL`, `CREDENTIAL_CONTRACT_ADDRESS`, `APP_ORIGIN` | Konfigurasi sama dengan runtime testnet; RPC tetap rahasia |

Hentikan server lain pada port 3000 dan selesaikan build testnet. Contoh perintah berikut memuat environment ke memori dan mempertahankan exit code Playwright; ganti placeholder path dengan lokasi berkas privat, tanpa menaruh isi rahasianya pada command line:

```text
node --env-file=.env --env-file="<berkas-env-e2e-di-luar-repo>" -e "const r=require('node:child_process').spawnSync('pnpm',['--filter','@verifikasi/web','exec','playwright','test','tests/e2e/sepolia.spec.ts','--reporter=list','--workers=1'],{stdio:'inherit',env:process.env,shell:process.platform==='win32'});process.exitCode=r.status??1;"
```

Proses test memakai bridge EIP-6963 **Dompet Uji Sepolia** untuk menjalankan UI. Private key tetap di Node; browser menerima signature/hash transaksi. RPC, signature EIP-712, transaksi kontrak, OCR dan layanan FHE sungguh berjalan. Otomasi ini bukan pengujian manual ekstensi wallet. Bukti yang boleh disimpan adalah field whitelist, receipt, screenshot/video sintetis dan log yang sudah dipindai rahasia; jangan menyalin payload workflow, cookie, file environment atau trace mentah secara otomatis.

Run lengkap aktual memakai helper lokal existing `C:/Users/Maulana/AppData/Local/Temp/uasw/tools/run-sepolia-e2e.cjs`. Helper memuat kunci wallet dari penyimpanan lokal, memeriksa target DB loopback **verifikasi_local**, menanam signed-proof v1 dari `tools/legacy.json` ke DB lokal, lalu menjalankan spec. Helper/seed itu berada di luar repo dan dipertahankan sebagai alat lokal; payload seed tidak dimasukkan ke evidence/commit. Karena itu command spec pada checkout lain **tidak otomatis menyediakan seed legacy**.

Untuk mengulang **12/12**, operator harus menyediakan bukti pengesahan v1 yang valid melalui seed lokal existing atau impor terkontrol ke DB lokal yang baru, lalu mengisi `SEPOLIA_E2E_LEGACY_ID`. ID pada run actual: `0x94041102751df8441d5b53790c9c3d0866fd00219b8ad7fdda64faf774608e1f`. Alamat/ID on-chain saja tidak menggantikan bukti pengesahan yang dibutuhkan server. Jika seed tidak tersedia, **kosongkan variabel legacy**: targetnya 11 tes lain dijalankan dan satu tes legacy skip, bukan klaim 12/12. Jangan menanam data uji ke Supabase.

## 5. Hasil nyata, receipt dan timing

Artefak run lengkap berada di [e2e-run-2026-10-04T14-53-27-678Z](evidence/sepolia/e2e-run-2026-10-04T14-53-27-678Z/sepolia-e2e-evidence.json). UI sukses mengirim **tiga penerbitan + satu pencabutan** dari wallet signer. Backend mengirim **tiga comparison**, sedangkan QR/no-op/unggahan yang ditolak tidak menambah comparison. [Receipt dan gas](evidence/sepolia/receipts-e2e.json), [binding/dekripsi](evidence/sepolia/fhe-decryption-confirmation.json) dan [konfirmasi tidak ada comparison untuk penolakan](evidence/sepolia/no-transaction-rejection-confirmation.json) disimpan terpisah.

| Hasil comparison final | Boolean `[nama, nomor, program, tanggal]` / agregat | Tx Sepolia | Durasi UI aktual |
| --- | --- | --- | ---: |
| A asli, MATCH | `[true,true,true,true]` / true | `0x2a57f0ac259c2ee52aa5c948ce6f30e26c1ae533a7abdd95d3a6e180bc3c1a84` | 77 detik |
| A nama berubah, MISMATCH | `[false,true,true,true]` / false | `0x62e1d27dd1257c7b5ffaaf192e666da63a312a16870d11b24af860e8e71c1ec5` | 70 detik |
| QR B + atribut A, MISMATCH | `[false,false,false,false]` / false | `0x3878ea29e95e0093e86d4e5379ba69c010d290881869727f62fbe00595dc3a92` | 79 detik |

Pencabutan C: `0x48daa72f6252339d3c768b4c8e04a1005752c901ccbadfb1ab485ea92dcad501`. Hash penerbitan A/B/C, blok dan gas ada di [DEPLOYMENT_RECORD.md](DEPLOYMENT_RECORD.md). Durasi UI dimulai sebelum klik verifikasi dan berakhir setelah heading, pengambilan job serta screenshot; bukan timer FHE murni. Durasi tahap server dan keterbatasannya ada di [sepolia-ui-stage-timings.json](evidence/measurements/sepolia-ui-stage-timings.json). Timer `userDecrypt` pada koleksi lanjutan mengukur re-dekripsi melalui layanan Zama, bukan timer run UI original atau waktu CPU saja.

## 6. Langkah saat gangguan

| Gejala | Langkah yang dapat ditelusuri |
| --- | --- |
| Signer ditolak / `UnauthorizedIssuer` | Periksa ID/name institusi dan signer aktif. Pakai ulang institusi yang sama; jangan mendaftarkan signer aktif ke dua institusi. |
| Review terenkripsi tidak muncul / gagal mengambil public key | Periksa konektivitas layanan Zama dan bucket kunci publik/CRS. Harness sudah memperbaiki allowlist S3 Zama; jangan menurunkan assertion atau threshold OCR. |
| RPC rate limit atau lama menunggu konfirmasi | Tunggu, periksa receipt/status hash yang sudah ada, gunakan provider yang sesuai kuota. Harness memakai request tanpa batching dan retry terbatas. Jangan klik ulang pengiriman ketika transaksi lama mungkin sudah broadcast. |
| Tidak ada layanan/role atau kunci layanan duplikat | Periksa konfigurasi lokal dan pemegang role tanpa mencetak rahasia. Backend menolak konfigurasi tersebut sebelum pengajuan. |
| OCR/QR tidak cukup atau asing | Pastikan PDF/QR berasal dari origin dan rekaman yang diharapkan. Tampilkan INCONCLUSIVE/penolakan sesuai alasan; jangan menyebutnya dokumen palsu otomatis. |
| Rekaman lama tidak ditemukan pada DB baru | Sediakan signed-proof yang valid untuk kontrak trusted v1 di DB lokal, atau terbitkan fixture baru untuk v2. Jangan menganggap ID chain saja cukup. |
| E2E gagal | Baca error pertama dan screenshot/context lokal, periksa exit asli. Run gagal tetap dicatat. Trace/cookie/payload hanya dipakai lokal untuk diagnosis dan harus disanitasi sebelum evidence. |

Riwayat dua kegagalan sebelum serah terima dan tiga run gagal/interupsi saat kelanjutan ada di [TEST_RESULTS.md](TEST_RESULTS.md). Pengujian ulang harus memakai folder evidence baru dan hanya dilakukan setelah penyebab dipahami agar tidak memboroskan SepETH.

## 7. Sinkronisasi Netlify — tindakan pengguna masih tertunda

**Konfigurasi situs dan deploy produksi Netlify tidak diubah dalam pekerjaan ini.** Bukti run ini berasal dari aplikasi lokal yang menggunakan Sepolia, bukan hasil pengujian ulang situs produksi. Langkah berikut merupakan panduan untuk dijalankan pengguna setelah memberikan izin deploy/menyesuaikan konfigurasi.

| Environment Netlify | Nilai atau tindakan pengguna |
| --- | --- |
| `APP_MODE` | `testnet` |
| `APP_ORIGIN` | Origin HTTPS situs Netlify yang benar; PDF/QR baru harus memakai origin ini |
| `CHAIN_ID`, `CHAIN_CONFIRMATIONS` | `11155111`, `2` |
| `CREDENTIAL_CONTRACT_ADDRESS` | Alamat v2 pada bagian 2 |
| `CONTRACT_DEPLOYMENT_BLOCK` | `11841227` |
| `LEGACY_CREDENTIAL_CONTRACTS` | Alamat v1 + cutoff pada bagian 2, jika rekaman v1 tetap dilayani |
| `RPC_URL` | Endpoint Sepolia rahasia, disimpan server-side |
| `RELAYER_PRIVATE_KEY`, `ATTESTOR_PRIVATE_KEY`, `RESULT_READER_PRIVATE_KEY` | Tiga kunci **berbeda** yang sesuai alamat layanan/role v2; bukan kunci deployer/signer dan tanpa awalan `NEXT_PUBLIC_` |
| `MAX_COMPARISONS_PER_HOUR` | `30`, atau kebijakan biaya yang ditentukan pengguna |
| `DATABASE_URL`, `DATABASE_POOL_MAX` | Koneksi PostgreSQL produksi existing, pool sesuai hosting; tidak diganti koneksi Docker uji |
| `DATABASE_MIGRATION_URL` | Hanya bila migrasi produksi perlu dijalankan terpisah; pengguna meninjau backup dan migrasi. Agent tidak menjalankannya ke Supabase. |
| `CRON_SECRET` | Rahasia maintenance terpisah, minimal 32 karakter |
| `NETLIFY_BLOBS_STORE` | Store privat existing (`verifikasi-private` bila memakai default); hosting menyediakan kredensial Blobs sendiri |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Opsional project identifier publik untuk koneksi mobile/QR; rebuild bila berubah |

Chain/contract portal dikirim dari server melalui `/api/portal/config`; repo **tidak memakai** `NEXT_PUBLIC_CHAIN_ID` atau `NEXT_PUBLIC_CREDENTIAL_CONTRACT_ADDRESS`. Jangan menciptakan variabel tersebut sebagai pengganti konfigurasi server. Kunci admin/deployer untuk tooling deployment tetap di luar hosting runtime. `PLANNED_SIGNER_ADDRESSES` digunakan untuk preflight tooling saat deployment baru; kontrak v2 yang disebutkan sudah dideploy dan tidak perlu dideploy ulang untuk demo ini.

Setelah environment ditinjau, pengguna melakukan deploy dari revisi final, memeriksa konfigurasi portal, role kontrak, sesi/DB/Blobs privat, dan migrasi bila memang dibutuhkan. Lakukan smoke test QR trusted dan kredensial sintetis baru melalui UI pada origin situs. Jangan menganggap hasil localhost membuktikan konfigurasi Netlify sudah benar. Pemindahan bukti/arsip lama harus mempertahankan pengesahan dan hak akses; tidak ada pemindahan data uji ke Supabase yang dilakukan agent.

## 8. Video nyata G.9 dan checklist

Video nyata sudah tersedia: [Video_Demo_Sepolia.mp4](evidence/sepolia/e2e-run-2026-10-04T14-53-27-678Z/Video_Demo_Sepolia.mp4), dengan [WebM asli](evidence/sepolia/e2e-run-2026-10-04T14-53-27-678Z/Video_Demo_Sepolia.webm) dan [metadata/QA](evidence/sepolia/e2e-run-2026-10-04T14-53-27-678Z/video-metadata.json). Rekaman otomasi UI run Sepolia lengkap, **555,88 detik (9 menit 15,88 detik)**, **1280×900**, **25 fps**, tanpa audio/narasi. MP4 H.264 berukuran **18.485.065 byte**, dikonversi dari WebM VP8; durasi, dimensi dan **13.897 frame** sama, tanpa pemotongan/perubahan kecepatan. Dekode penuh MP4 selesai exit 0 tanpa error. Hasil kriptografis dibuktikan oleh receipt/dekripsi pendamping, bukan video saja.

| Checklist perekaman | Status aktual |
| --- | --- |
| Menampilkan label jaringan/aktor dan data sintetis, tanpa rahasia | ✅ UI run nyata; kunci tetap di proses Node |
| Registry existing/no-op, pengesahan dan penerbitan A/B/C | ✅ Terekam |
| QR RECORD_ONLY, MATCH dan MISMATCH satu atribut | ✅ Terekam; frame sampel MATCH 349 detik, MISMATCH 419 detik diperiksa |
| QR berbeda/asing tanpa comparison, QR B + atribut A | ✅ Terekam dan diperkuat whitelist/event scan |
| Pencabutan, rekaman REVOKED, riwayat dan v1 | ✅ Terekam; frame v1 555,7 detik diperiksa |
| Video dapat didekode/diputar, original dan hash disimpan | ✅ MP4 + WebM + metadata tersedia |
| Narasi/presentasi akademik | Tidak dibuat; video ini rekaman UI otomatis tanpa audio |
| Identitas/NPM anggota untuk bahan akademik G.10 | ❌ Belum diberikan pengguna |
| Sinkronisasi dan demo pada situs produksi Netlify | ❌ Menunggu tindakan/izin pengguna |

Sesudah verifikasi, worktree uji dan container Docker disposable dibersihkan sesuai T8; receipt, JSON, PDF sintetis dan video evidence dipertahankan. Reproduksi berikutnya perlu membuat lingkungan lokal baru. Alat lokal/seed di `uasw/tools` serta penyimpanan kunci di luar repo bukan isi handoff Git dan tidak boleh dibagikan ke ChatGPT.
