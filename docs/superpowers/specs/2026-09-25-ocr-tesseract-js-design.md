# Desain: OCR tanpa Docker dengan tesseract.js

Tanggal: 25 September 2026. Status: diimplementasikan pada branch `feat/ocr-tesseract-js` (commit `87fcfe8` sampai `5120ace`); deployment Vercel belum dijalankan.

## Penyesuaian saat implementasi

- `OcrField` sudah ada di `@verifikasi/domain`, sehingga tidak dipindahkan; `@verifikasi/ocr` hanya mengekspor `Extraction` yang memakai tipe domain tersebut.
- tesseract.js 7.0.0 salah menginisialisasi bahasa berbentuk objek `{ code, data }` (memakai `data` sebagai nama). Kedua berkas `traineddata.gz` publik disalin sekali per instance ke direktori temp privat lalu dipakai sebagai `langPath`; salinan selalu ditimpa melalui nama unik. tesseract.js sendiri tetap `cacheMethod: "none"`.
- zxing-wasm versi browser mengunduh WASM dari CDN secara default; WASM lokal diberikan melalui `wasmBinary`. Path WASM dan data bahasa di-resolve dari direktori aplikasi saat runtime, dan paket runtime OCR juga menjadi dependensi langsung `apps/web`.
- Tahap 0: seluruh nilai dan QR terbaca persis, tetapi foto A1 160 DPI membaca `CONTOH/2026/0042` dengan confidence 89,96 (<0,90). Atas instruksi pengguna untuk melanjutkan tanpa bertanya, pekerjaan diteruskan dan deviasi dicatat di tes serta `docs/acceptance.md`; dampaknya `INCONCLUSIVE`, bukan kecocokan salah.

## Keputusan pengguna

Keputusan berikut diambil pengguna pada sesi 24–25 September 2026 dan menjadi instruksi eksplisit untuk mengubah ketentuan stack di `CLAUDE.md` dan `PRD.MD`:

1. OCR diganti total ke TypeScript (tesseract.js + MuPDF.js + zxing-wasm); worker Python dihapus.
2. Pendekatan A: paket baru `packages/ocr`, dijalankan di dalam langkah Workflow Next.js; mode polling dihapus sehingga Workflow menjadi satu-satunya jalur eksekusi, termasuk lokal.
3. Docker dihapus total dari repositori, termasuk PostgreSQL untuk pengujian.

## Latar belakang

Deployment Vercel memakai Services (beta) dengan service container `ocr` dari `apps/worker/Dockerfile.vercel`. Build web dan image berhasil, tetapi deployment berakhir `Error` setelah `Deploying outputs...` tanpa pesan di build log. Container diperlukan hanya karena Tesseract adalah program sistem yang dipasang melalui `apt-get`; PyMuPDF dan OpenCV sudah berupa wheel pip. tesseract.js menjalankan mesin Tesseract yang sama sebagai WebAssembly di Node, sehingga OCR dapat berjalan di Function Next.js biasa.

## Tujuan dan kriteria sukses

- Deployment Vercel berhasil sebagai proyek Next.js biasa, tanpa `services`, container, atau fitur beta.
- Kontrak `Extraction`, aturan `academic-diploma-v1`, dan langkah FHE/chain tidak berubah.
- Pada kasus uji kesetaraan (bagian Pengujian, Tahap 0), hasil TypeScript memenuhi syarat yang sama dengan `smoke.py`: satu kandidat QR, empat field, `full_name == "ANDI PRATAMA"`, `diploma_number == "CONTOH/2026/0042"`, dan semua confidence ≥ 0.9.
- Repositori tidak lagi berisi Dockerfile, compose, atau kode Python; pengembang cukup menjalankan `pnpm dev`.

## Non-tujuan

- Tidak mengubah alur pengguna, UI, label, status, atau aturan pencocokan.
- Tidak mengubah jalur QR `/c/{credentialId}`, portal penerbit, e-sign, maupun kontrak.
- Tidak mengganti mesin OCR: tetap Tesseract `ind+eng`, PSM 6, 200 DPI. Peningkatan akurasi foto berada di luar cakupan.
- Tidak menjalankan OCR di browser.

## Alur pengguna (tetap)

Pemeriksa memindai QR dan melihat profil resmi tanpa OCR. Jalur tambahan tetap: unggah PDF/JPG/PNG → memproses → tabel Hasil OCR dan Kecocokan → `MATCH`/`NO_MATCH`/`INCONCLUSIVE` → laporan. Satu perbedaan yang terlihat: baris "Konfigurasi OCR" pada laporan (`apps/web/src/server/reports.ts`) menampilkan `tesseract-js-ind-eng-v3` untuk pekerjaan baru; pekerjaan lama tetap menampilkan versi yang tersimpan.

## Arsitektur: paket `@verifikasi/ocr`

Lokasi `packages/ocr`, mengikuti konvensi paket lain: `"type": "module"`, `exports: { ".": "./src/index.ts" }`, script `typecheck`/`lint`/`build` = `tsc --noEmit`, `test` = `vitest run`, devDependency `@verifikasi/config`.

API publik tunggal:

```ts
export function extractDocument(bytes: Uint8Array, mime: string, options?: { timeoutMs?: number }): Promise<Extraction>;
export type { Extraction, OcrField } from './types';
export { OCR_CONFIG, OCR_CONFIG_HASH } from './config';
```

| File | Tanggung jawab | Menggantikan |
| --- | --- | --- |
| `src/config.ts` | `OCR_CONFIG` = `{ version: "tesseract-js-ind-eng-v3", dpi: 200, psm: 6, languages: "ind+eng", templates: ["A1","B1"], confidence: "minimum-word", qr_mask: "detected-bounds-10px", engine, tessdata }`, dengan `engine` = `"tesseract.js@"` + versi persis di `packages/ocr/package.json` dan `tessdata` = nama serta versi persis paket `@tesseract.js-data/ind` dan `@tesseract.js-data/eng`, sehingga pembaruan mesin atau data bahasa mengubah hash; `OCR_CONFIG_HASH` = `"0x" + sha256(JSON dengan kunci terurut)` seperti `extract.py`. | `OCR_CONFIG`, `CONFIG_HASH` |
| `src/render.ts` | MuPDF.js. PDF: tolak password (`PDF_PASSWORD`), > 5 halaman (`TOO_MANY_PAGES`), 0 halaman atau rusak (`INVALID_DOCUMENT`), halaman > 20 MP pada 200 DPI (`RESOLUTION_LIMIT`); render RGB tanpa alpha dari piksel halaman, tidak pernah membaca text layer. PNG/JPEG dibuka MuPDF sebagai image document: satu frame, batas 20 MP, orientasi EXIF diterapkan. Jika MuPDF tidak menerapkan tag Orientation secara otomatis, `render.ts` membaca tag tersebut dan memutar melalui matriks render. | `render_pages` |
| `src/qr.ts` | zxing-wasm, format QR, multi-barcode, dengan opsi mengembalikan simbol yang terdeteksi tetapi gagal didekode sebagai kandidat string kosong, agar ambiguitas tidak diabaikan. Mengembalikan nilai dan posisi. | `read_qrs` |
| `src/engine.ts` | tesseract.js: worker baru per dokumen, bahasa `ind+eng` dari paket `@tesseract.js-data/ind` dan `@tesseract.js-data/eng` melalui `langPath` lokal, `cacheMethod: "none"`, logger nonaktif, `tessedit_pageseg_mode = 6`. Citra grayscale dengan area QR (posisi dari `qr.ts`, +10 px) diputihkan sebelum OCR. Keluaran per kata: teks, confidence, nomor blok/paragraf/baris, bbox. Worker di-`terminate()` setelah selesai atau saat timeout. | `TesseractEngine` |
| `src/parse.ts` | Port langsung `parse_fields`: pengelompokan per (blok, paragraf, baris), penanda `TEMPLATE A1|B1` tunggal, label per template, semua kandidat, confidence = minimum kata nilai / 100, bbox gabungan, teks gabungan dipotong 20.000 karakter. | `parse_fields` |
| `src/extract.ts` | Orkestrasi `extractDocument`: render → QR → OCR → parse per halaman; tepat satu halaman kandidat, atau `reason` "Tidak ada satu halaman ijazah yang dapat dipastikan."; `templateId` `synthetic-a1-v1`/`synthetic-b1-v1`; `dateFormat` `DMY` untuk A1 dan `MDY` untuk B1; `qrPage`; pemetaan error pada bagian Penanganan error. | `extract_document` |
| `src/types.ts` | `Extraction` dan `OcrField` dipindahkan dari `apps/web/src/server/types.ts`; `FieldKey` diimpor dari `@verifikasi/domain`. Web mengimpor tipe dari `@verifikasi/ocr`. | tipe web |

Dependensi: `tesseract.js`, `mupdf`, `zxing-wasm`, `@tesseract.js-data/ind`, `@tesseract.js-data/eng`, `@verifikasi/domain` (`workspace:*`). Versi dipatok persis saat implementasi setelah diperiksa terhadap denylist keamanan pengguna, termasuk dependensi transitif. Lisensi: tesseract.js Apache-2.0, zxing-wasm MIT, data Tesseract Apache-2.0, MuPDF.js AGPL (sama dengan PyMuPDF yang dipakai sekarang).

## Alur data

Langkah Workflow `extractHosted` (`apps/web/src/server/workflow-jobs.ts`):

1. Validasi job dan lease melalui `workflowJob`/`checkLease`, lalu set `EXTRACTING` dan `attempts++` (tetap).
2. Baca `upload.bin` melalui `getPrivate()` (Blob di Vercel, `.private-data` di lokal).
3. Tolak bila ukuran > 10 MiB atau `0x` + sha256 ≠ `job.digest`; perlakuannya sama dengan `DIGEST_MISMATCH` dari worker saat ini, yaitu kegagalan teknis yang diulang Workflow.
4. `extractDocument(bytes, job.mimeType, { timeoutMs: 210_000 })`.
5. Validasi bentuk hasil dan klasifikasi `errorCode` tetap seperti sekarang; simpan `ocr.json`, isi `ocrConfigHash`/`ocrConfigVersion`, status `AWAITING_CHAIN`.

`submitHosted` dan `concludeHosted` tidak berubah. Dokumen dan hasil OCR tetap hanya berada di penyimpanan privat, tidak masuk argumen atau hasil langkah Workflow.

## Satu jalur eksekusi

- `config().workflow` selalu aktif; `JOB_EXECUTION` dihapus.
- Dihapus: `claim`, `failWorker`, cabang non-hosted `completeExtraction`, route `/api/internal/jobs/claim`, `/api/internal/jobs/[id]/file`, `/api/internal/jobs/[id]/complete`, `/api/internal/jobs/[id]/fail`, `workerAuth`, pemakaian `workerToken` pada `http.ts`. Ekspor lain yang tidak lagi dipakai, misalnya `privateObjectUrl` atau `verifyAttributes`, dihapus hanya bila grep dan typecheck membuktikan tidak ada pemanggil.
- `requireRealConfiguration`: `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `BLOB_STORE_HOSTNAME`, dan `APP_ORIGIN` wajib bila `VERCEL` aktif; `DATABASE_URL` dan variabel chain tetap wajib pada mode testnet. Lokal demo memakai file state dan penyimpanan lokal yang sudah ada.
- Variabel dihapus: `OCR_SERVICE_URL`, `WORKER_API_URL`, `WORKER_API_TOKEN`, `JOB_EXECUTION`; catatan `PORT=8000` dihapus dari dokumentasi.

## Penanganan error

| Kondisi | `errorCode` | Perlakuan di web |
| --- | --- | --- |
| PDF berpassword | `PDF_PASSWORD` | Permanen, `INCONCLUSIVE` dengan alasan |
| Lebih dari 5 halaman | `TOO_MANY_PAGES` | Permanen |
| Berkas rusak, MIME tidak didukung, multi-frame | `INVALID_DOCUMENT` | Permanen |
| Halaman atau gambar > 20 MP | `RESOLUTION_LIMIT` | Permanen |
| tesseract.js, WASM, atau data bahasa gagal dimuat | `OCR_UNAVAILABLE` | Sementara, Workflow mengulang |
| Melewati `timeoutMs` | `OCR_TIMEOUT` | Worker di-`terminate()`, diulang |
| Error lain | `OCR_FAILURE` | Sementara, diulang |

Pesan `OCR_UNAVAILABLE` di `pipeline.ts` diganti dari "belum tersedia pada worker" menjadi "belum tersedia pada server". Teks dokumen, hasil OCR, dan pesan exception tidak pernah dicatat ke log.

## Keamanan dan privasi

- Isolasi berubah dari proses OS terpisah dengan `RLIMIT` menjadi: MuPDF dan zxing di sandbox memori WASM, tesseract.js di worker thread yang dapat dihentikan, batas halaman/piksel/ukuran sebelum rendering, `maxDuration` Function, dan batas percobaan Workflow. Perubahan ini dicatat di `CLAUDE.md` dan `docs/vercel.md`.
- Tidak ada unduhan jaringan saat OCR dan tidak ada tulisan ke disk oleh tesseract.js.
- Hanya piksel hasil render yang dibaca; text layer PDF tidak pernah dipakai.
- Penanda penghapusan dan pemeriksaan lease sebelum menyimpan hasil tetap berlaku, sehingga retry tidak menghidupkan kembali job yang dihapus.
- OCR tetap berjalan di backend tepercaya; teks privasi pada UI tetap benar ("OCR memproses unggahan di server").

## Hosting Vercel

- `vercel.json` root dihapus; `apps/web/vercel.json` berisi `framework: "nextjs"`, `buildCommand: "pnpm build:vercel"`, `crons` (`/api/internal/maintenance`, `0 0 * * *`), dan `functions` (`src/app/**/route.ts`, `maxDuration: 300`). Instalasi dependensi dijalankan Vercel dari root workspace pnpm secara otomatis karena Root Directory berada di dalam monorepo.
- `apps/web/next.config.ts`: tambah `@verifikasi/ocr` ke `transpilePackages`; tambah `tesseract.js`, `mupdf`, `zxing-wasm` ke `serverExternalPackages`; masukkan berkas WASM dan data bahasa ke `outputFileTracingIncludes`.
- `scripts/check-deployment.mjs` diperluas: dari salinan trace deployment, jalankan `extractDocument` pada `synthetic-A1.pdf` dan gagalkan build bila QR atau empat field tidak terbaca.
- Langkah manual pengguna di dashboard Vercel, didokumentasikan di `docs/vercel.md`: Framework Preset **Next.js**, Root Directory **`apps/web`**, hapus env `PORT`, `OCR_SERVICE_URL`, `WORKER_API_TOKEN`, `JOB_EXECUTION`.

## Penghapusan dari repositori

- `apps/worker/` seluruhnya, setelah fixture `tests/fixtures/generated/*` dipindahkan ke `packages/ocr/tests/fixtures/`.
- `infra/` seluruhnya (`compose.yaml`, `worker.Dockerfile`), `.dockerignore` root, `apps/web/tests/integration/run-database.mjs` beserta script `test:db:docker`.
- Script root `dev:worker`, `dev:ocr-http`, `fixtures`, `infra:up`, `infra:down`, `test:db:docker`; bagian `uv` pada `lint`, `typecheck`, `test`, `build`.
- `scripts/check-structure.mjs`: pemeriksaan `apps/worker` (`pyproject.toml`, `uv.lock`) dihapus.
- CI (`.github/workflows/ci.yml`): hapus `setup-uv`, apt Tesseract, `uv sync`, `pnpm fixtures`, smoke Python, `test:db:docker`; tambah `services: postgres` dengan `TEST_DATABASE_URL` pada `localhost` dan langkah `pnpm test:db`.
- Tes e2e `apps/web/tests/e2e/workspace.spec.ts`: path fixture menunjuk `packages/ocr/tests/fixtures`, skip `RUN_WORKER_E2E` dihapus.

## Pengujian

### Tahap 0: spike sebagai gerbang

Dikerjakan sebelum penghapusan apa pun.

1. `packages/ocr` versi awal menjalankan kasus `smoke.py` (A1 dan B1 × PDF, foto JPEG 160 DPI kualitas 90, PDF resave) serta fixture `changed-*` dan `swapped-qr`.
2. Syarat lulus (mutlak): kriteria kesetaraan pada bagian Tujuan; fixture `changed-*` menghasilkan nilai yang diubah; `swapped-qr` menghasilkan QR yang ditukar.
3. Data pembanding (bukan syarat lulus): bila Tesseract native tersedia di mesin pengembang, keluaran `extract_document` Python pada berkas yang sama dicatat berdampingan (teks field dan confidence) di `docs/acceptance.md`. Bila tidak tersedia, hal itu dicatat apa adanya.
4. `check-deployment.mjs` versi baru lulus pada build lokal. Build Vercel preview dijalankan setelah pengguna menyetujui push branch.
5. Durasi `extractDocument` untuk dokumen 1 halaman dan 5 halaman dicatat di `docs/acceptance.md`.

Bila salah satu gagal, pekerjaan berhenti, Docker tetap dipakai, dan data kegagalan dilaporkan ke pengguna.

### Tes permanen

- `packages/ocr/tests` (vitest), port `test_extract.py`: tanda baca dipertahankan tanpa koreksi referensi; kandidat ganda; confidence 0.67 dipertahankan; template tidak dikenal tanpa field; `PDF_PASSWORD`; `TOO_MANY_PAGES`; PDF/PNG rusak; teks tersembunyi (render mode 3) menghasilkan render putih polos; QR bertahan setelah rasterisasi dan resave PNG; dua halaman ijazah tidak meyakinkan; halaman raksasa `RESOLUTION_LIMIT`; OCR nyata pada fixture. PDF uji dibuat dengan MuPDF.js bila API mendukung, selain itu memakai fixture statis yang di-commit.
- `apps/web/tests`: `workflow.test.ts` men-stub `extractDocument`, bukan `fetch`; stub `JOB_EXECUTION`, `OCR_SERVICE_URL`, `WORKER_API_TOKEN` dihapus; `record-pipeline.test.ts` memakai jalur hosted.
- Pemeriksaan akhir: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm build`, `pnpm check:structure`, `pnpm test:e2e`, lalu deployment preview dengan fixture sintetis pada `APP_MODE=demo`.

## Pembaruan dokumen

- `CLAUDE.md`: poin arsitektur (Python/FastAPI/Docker/Vercel Services/uv/polling diganti `packages/ocr` dengan tesseract.js, MuPDF.js, zxing-wasm di Function Next.js), tabel monorepo (`apps/worker` diganti `packages/ocr`, baris `infra` dihapus), aturan Python/uv dihapus, daftar env diperbarui, catatan isolasi WASM ditambahkan.
- `PRD.MD`: bagian hosting, worker OCR, dan mode polling.
- `README.md`, `docs/vercel.md`, `docs/implementation.md`, `docs/testnet.md`, `docs/acceptance.md`: perintah, arsitektur, langkah dashboard, dan hasil spike yang benar-benar diperoleh.

## Cara kerja

- Semua perubahan di branch `feat/ocr-tesseract-js`, commit per langkah setelah pemeriksaan yang relevan.
- Push, deployment preview, dan merge ke `main` menunggu persetujuan pengguna.

## Risiko

| Risiko | Mitigasi |
| --- | --- |
| WASM lebih lambat dari Tesseract native | Diukur pada Tahap 0; batas 210 detik dan `maxDuration` 300 detik tetap |
| Varian data `@tesseract.js-data` berbeda dari paket Debian `tesseract-ocr-ind/eng` | Uji kesetaraan Tahap 0 menjadi gerbang |
| WASM/data bahasa tidak ikut ter-trace di Vercel | `check-deployment.mjs` menjalankan OCR dari salinan trace |
| MuPDF tidak menerapkan orientasi EXIF | Rotasi manual dari tag Orientation di `render.ts` |
| zxing tidak mengembalikan QR yang gagal didekode | Opsi pengembalian simbol tidak valid; diuji pada Tahap 0 |
| Memori Function saat 5 halaman | Diukur pada Tahap 0; worker tesseract dimatikan per dokumen |
