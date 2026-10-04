# Status pengerjaan terhadap `INSTRUKSI_IMPLEMENTASI_UAS_BLOCKCHAIN.md`

Posisi per **4 Oktober 2026, ±21:00 WIB**, HEAD `f2166c2` di branch `main`. Tanda: ✅ selesai dengan bukti · ❌ belum selesai (termasuk yang baru sebagian; keterangan menyebut bagian yang sudah ada). Nomor bagian mengikuti dokumen instruksi.

Tingkat bukti: **mock** = Hardhat/FHEVM mock atau tes lokal; **lokal-nyata** = komponen nyata di mesin lokal (PostgreSQL Docker, OCR); **Sepolia** = transaksi/state on-chain di testnet.

## Ringkasan cepat

| Area | Status |
| --- | --- |
| Remediasi kontrak S-01..S-05, S-09, S-10 + tes merah/hijau | ✅ |
| Tooling peran/deployment/registrasi/verifikasi source | ✅ |
| Backend: pemisahan kunci layanan, cek saldo, anggaran relayer atomik, sumber IP tepercaya | ✅ |
| Jejak transaksi (FT-02), pembacaan kontrak lama v1 | ✅ |
| E2E lokal (mock) diperbaiki, test:db, coverage, debugging C.2 | ✅ |
| Deployment kontrak v2 di Sepolia + Sourcify exact_match | ✅ |
| Registrasi institusi & signer via UI di Sepolia | ✅ |
| Penerbitan, QR, MATCH/MISMATCH FHE nyata, pencabutan di Sepolia | ❌ (uji E2E berhenti di penerbitan) |
| Dokumen `docs/uas/` lengkap, README, diagram PNG, indeks bukti B-xx | ❌ (sebagian) |
| Netlify diselaraskan ke kontrak v2 | ❌ |
| Video demo (G.9), data kontribusi/identitas (G.10) | ❌ |

## Bagian 3 — Pemeriksaan awal

- ✅ 3.1 Branch/HEAD/manifest/lockfile diperiksa; kerja tanpa reset atau checkout paksa (worktree terpisah untuk uji bersih). Catatan: checkout ini adalah salinan ZIP; riwayat Git dimulai di `96b4a08`, commit hulu `efa663b` tidak tersedia.
- ✅ 3.2 Baseline dicatat sebelum perubahan kode (`efc3f3c`, `docs/uas/evidence/baseline/`, exit code asli: lint/typecheck/test lulus, E2E 19 lulus/3 gagal).
- ✅ 3.3 Fitur `/penerbit`, `/c/{id}`, `/verifikasi`, `/riwayat`, `/panduan`, kontrak, chain adapter, OCR, storage, DB, Workflow diperiksa.
- ❌ 3.4 Matriks kepatuhan (`docs/uas/KEPATUHAN_UAS.md`) belum ditulis.
- ✅ 3.5 Pekerjaan dijalankan tanpa menanyakan ulang jenis pekerjaan.
- ❌ 3.6 Hosting: Netlify adalah hosting aktual, tetapi **belum diselaraskan** (masih kontrak lama dan kunci layanan lama); dokumentasi hosting (README bagian Vercel/Netlify, `docs/implementation.md`) belum diselaraskan.
- ✅ 3.7 Akun uji khusus: wallet attestor/relayer/reader/signer baru (kunci di luar repo, `%USERPROFILE%\.uas-verifikasi\sepolia-test-wallets.env`); tanpa mainnet.
- ✅ 3.8–3.10 Hambatan dicatat; uji serangan hanya pada fixture/akun proyek; commit tertelusur per perubahan.

## Bagian 5 — Perilaku yang dipertahankan

- ✅ Butir 1–18 dipertahankan dan dilindungi tes unit/E2E lokal (QR `RECORD_ONLY` + `documentDecision: null`, `MATCH` hanya setelah FHE + baca ulang status, tanggal lulus privat, tanpa `makePubliclyDecryptable`, gagal tertutup, outbox, tombstone, PDF penerbit tanpa OCR, mode demo berlabel). Pembuktian di Sepolia untuk butir 1, 4, 8, 13 masih ❌ (lihat bagian 8).

## Bagian 6 — Implementasi

### 6.1 E2E penerbitan PDF
- ✅ `wallet.spec.ts` diselaraskan (tanggal beku/perlu diisi × 3 viewport); E2E bersih 25 lulus di `714a2af` (`evidence/tests/clean-pnpm-test-e2e-714a2af.log`).

### 6.2 Pemisahan admin/signer/layanan
- ✅ 1 Tooling baca/grant/revoke/transfer-admin (`uas:roles`, mode baca default, `--expected-chain-id`, receipt) — `7f7f271`, `contracts/test/Tooling.cjs`.
- ✅ 2 Validasi lokal kunci layanan (tiga alamat berbeda, tanpa mencetak kunci) — `9e31e82`.
- ✅ 3 Cek peran on-chain sebelum operasi sensitif; RPC gagal → error konfigurasi/jaringan — `9e31e82`.
- ✅ 4 Deployment baru dengan admin/attestor/relayer/reader/signer terpisah — `0x65b1…94e0`.
- ✅ 5 Transfer admin grant → verifikasi → renounce (diuji lokal; tidak dilakukan di Sepolia, sengaja).
- ✅ 6 Eksklusivitas peran on-chain dua arah (konstruktor, grant, `setSigner`) — `43c3c37`.
- ✅ 7 Catatan satu batas kepercayaan untuk tiga kunci backend (CATATAN S-01).
- ❌ Penerimaan "role baru berfungsi" untuk attestor/relayer/reader **di Sepolia** belum terbukti (belum ada tx `verify`).

### 6.3 Remediasi kontrak
- ✅ S-05 ACL referensi (`8bb71ce`), S-09 `tryRecover` (`07f627a`), S-10 validasi registry + no-op (`a5c3589`), S-03 ID terikat (`cfd6514`), S-04 nama institusi disahkan, domain v2 (`131dcbb`, klien `8d7bbcc`). Log merah/hijau di `evidence/remediation/`.

### 6.4 Deployment dan kompatibilitas
- ✅ 1 Preflight chain ID/alamat/pemisahan peran/saldo (`uas:deploy`).
- ✅ 2 Record non-rahasia (`contracts/deployments/sepolia/*.json`; versi dependensi diperbaiki `fc0b158` setelah deployment — dicatat).
- ✅ 3 Registrasi idempoten (`uas:register`) + registrasi nyata via UI (setIssuer `0x04cf…a46f`, setSigner `0x40ce…f59d`).
- ✅ 4–5 Sourcify API v2 **exact_match** (`6673e51`); kegagalan hardhat-verify 404 tetap dicatat.
- ❌ 6 Penyelarasan pasca-redeploy: lokal ✅, **Netlify/hosting ❌** (env, ABI, alamat, blok, kunci layanan baru, `LEGACY_CREDENTIAL_CONTRACTS`, `MAX_COMPARISONS_PER_HOUR`).
- ✅ 7 Kontrak lama dibaca hanya-baca via daftar tepercaya + batas migrasi (`3082f4a`, tes unit). ❌ Skenario legacy di Sepolia (tes 12 E2E) belum berjalan.
- ❌ 8 Kredensial sintetis baru pada kontrak final belum terbit (E2E berhenti).

### 6.5 Jejak transaksi
- ✅ Kode + tes (`3ee4f01`): tautan explorer dari chain ID tepercaya, log pencabutan dicocokkan alamat+ID di blok pencabutan, status tetap `REVOKED` bila log gagal.
- ❌ Bukti di Sepolia (jejak pencabutan nyata) belum ada.

### 6.6 Relayer dan rate limit
- ✅ Anggaran global atomik (`MAX_COMPARISONS_PER_HOUR`), reservasi dipakai ulang saat retry, dilepas saat gagal pra-broadcast; cek saldo sebelum enkripsi dan sebelum tanda tangan; IP dari header platform; sumber tak dikenal tidak disatukan (`e86e2f8`, `9e31e82`; tes unit + test:db lintas pool).
- ❌ Perilaku header `x-nf-client-connection-ip` di Netlify nyata belum diuji (hanya rujukan dokumentasi).

### 6.7 Penyimpanan dan proses latar
- ✅ `pnpm test:db` 9 lulus di PostgreSQL 16 Docker lokal (`0063ca4`, `evidence/tests/pnpm-test-db.log`).
- ✅ S-12 diukur (`evidence/measurements/S-12-state-row-benchmark.log`): ±100 op/s datar, 0 lost update.
- ❌ Satu siklus unggah→baca→hasil→hapus→retensi pada **namespace uji hosting** (Netlify Blobs) belum dibuktikan.

### 6.8 Dokumentasi
- ✅ `docs/testnet.md`, `docs/pdf-ijazah.md` diselaraskan (`f2166c2`).
- ❌ `README.md` (status proyek, langkah 5 penerbitan masih menyebut OCR/FHE pada PDF, perintah deploy lama, env baru, versi, atribusi OpenZeppelin MIT & Zama BSD-3-Clause-Clear, reproduksi checkout bersih, paragraf terakhir tentang dokumen usang).
- ❌ `docs/acceptance.md` (baris 3: "Belum ada transaksi Sepolia"), `docs/implementation.md` (konteks Vercel vs Netlify), `docs/pdf-ijazah-testing.md` (konteks versi).

## Bagian 7 — Pengujian

- ❌ 7.1 Run final semua perintah pada commit final (lint, typecheck, test, test:db, build, test:e2e) belum dijalankan ulang setelah perubahan terakhir. Run terakhir yang tercatat: unit 417 lulus (kontrak 34, domain 52, credentials 14, ocr 45, chain 71, web 201), lint/typecheck 0 error, E2E 25 lulus (`714a2af`), test:db 9 lulus (`0063ca4`).
- ✅ 7.2 Checklist tes kontrak (positif, akses, signature/binding, replay, deadline tepat/±1 s, nilai nol/versi, nama byte UTF-8, paginasi, status bisnis, rotasi, FHE 256 bit & ACL, ordering) — `contracts/test/VerifikasiIjazah.cjs` (29) + `Tooling.cjs` (5).
- ✅ 7.3 Tes aplikasi butir 1–10 (unit/integrasi; mock dan lokal-nyata).
- ✅ 7.4 Coverage kontrak (mock: statements 99/99, branches 131/132, functions 18/18, lines 132/132) dan TypeScript (v8) — diukur di `f7f791b`/`ceefce7`; ❌ **pengukuran ulang final** belum. Debugging C.2 nyata ✅ (`evidence/debugging/`).

## Bagian 8 — End-to-end di Sepolia (melalui UI, `apps/web/tests/e2e/sepolia.spec.ts`)

| Skenario | Status | Bukti/keterangan |
| --- | --- | --- |
| Wallet di jaringan benar, jaringan salah membatalkan sesi | ✅ Sepolia | run `e2e-run-2026-10-04T09-40-02-443Z`, `01-admin-signed-in.png` |
| Registrasi institusi dan signer | ✅ Sepolia | tx `0x04cf…a46f` (73.555 gas), `0x40ce…f59d` (130.593 gas), event terdekode di `evidence/sepolia/receipts-deploy-and-registry.json`; no-op ditolak tanpa tx (`03-registry-noop-rejected.png`) |
| Penerbitan dengan otorisasi sah (A, B, C) | ❌ | gagal: allowlist jaringan tes memblokir bucket kunci publik Zama (diperbaiki `e5dba67`, belum dijalankan ulang) |
| QR → `VERIFIED_RECORD`/`RECORD_ONLY` tanpa tx | ❌ | menunggu penerbitan |
| PDF penerbit diunduh | ❌ (Sepolia) | ✅ mock/E2E lokal |
| Unggah PDF cocok → `MATCH` (FHE nyata) | ❌ | |
| Satu atribut diubah → `MISMATCH` | ❌ | |
| QR ≠ `expectedCredentialId` → `INCONCLUSIVE` tanpa tx | ❌ | |
| QR B + atribut A → `MISMATCH` terhadap B | ❌ | |
| Dokumen tanpa QR aplikasi → `INCONCLUSIVE` tanpa tx | ❌ | |
| Pencabutan via portal + event `CredentialRevoked` | ❌ | |
| QR/unggah/PDF setelah pencabutan | ❌ | |
| Pencabutan/nonaktif saat pekerjaan berjalan | ✅ mock | tes terkontrol `record-pipeline.test.ts` (label mock) |
| Gangguan RPC/dekripsi/kuota/saldo | ✅ mock | tes unit + test:db |
| Riwayat, laporan, penolakan sesi lain | ❌ (Sepolia) | ✅ E2E lokal |
| Rekaman kontrak lama v1 hanya-baca | ❌ (Sepolia) | ✅ unit |

## Bagian 9 — Audit

- ✅ Threat model, tujuh aspek D.2, keputusan S-01..S-15 dengan kategori, tabel lengkap, temuan tambahan A-01..A-05 — `docs/uas/CATATAN_TEMUAN_DAN_RETEST.md`.
- ❌ Baris yang membutuhkan "verifikasi deployment" (S-01 role layanan dipakai nyata, S-08 kuota di hosting) belum diperbarui dengan bukti Sepolia/hosting.

## Bagian 10 — Data untuk P4/P5

- ❌ 10.1 Fakta arsitektur tujuh aspek E.1 (`FAKTA_ARSITEKTUR_DAN_PENGUKURAN.md`) belum ditulis.
- ❌ 10.2 Pengukuran: gas deployment ✅ (3.041.734), setIssuer ✅ (73.555), setSigner ✅ (130.593), S-12 ✅; gas `issueCredential`/`verify`/`revoke` ❌, durasi OCR/antrean/submit/konfirmasi/dekripsi ❌, sampel berulang kecil ❌.
- ❌ 10.3 Tabel privasi (data publik/on-chain/terenkripsi/privat/log/metadata, akses, retensi) dan governance (siapa mengubah apa, prosedur) belum ditulis.
- ❌ 10.4 Langkah demo (`DEMO.md`), video, fakta F.4, kontribusi nyata (riwayat checkout ini: seluruh commit sejak `96b4a08` oleh satu penulis "Maul" menurut `git shortlog -sn`; identitas/NPM anggota belum diberikan), backlog/roadmap teknis.

## Bagian 11 — Artefak

| Artefak | Status |
| --- | --- |
| `README.md` final | ❌ |
| `docs/uas/KEPATUHAN_UAS.md` | ❌ |
| `docs/uas/FAKTA_ARSITEKTUR_DAN_PENGUKURAN.md` | ❌ |
| `docs/uas/CATATAN_TEMUAN_DAN_RETEST.md` | ✅ |
| `docs/uas/DEPLOYMENT_RECORD.md` + record mesin | ✅ (perlu ditambah tx penerbitan/pencocokan/pencabutan setelah E2E) |
| `docs/uas/TEST_RESULTS.md` | ❌ |
| `docs/uas/DEMO.md` | ❌ |
| `docs/uas/BAHAN_LAPORAN_UAS.md` + indeks B-01… | ❌ |
| `docs/uas/evidence/` | ✅ sebagian (baseline, remediasi, debugging, coverage, tests, sepolia, measurements) |
| `docs/uas/diagrams/` sumber `.mmd` | ✅ |
| `Architecture_Diagram.png` dan PNG alur transaksi | ❌ |
| Pemindaian rahasia evidence | ✅ (0 temuan pada commit `f2166c2`) |
| ZIP `BAHAN_LAPORAN_UAS_BLOCKCHAIN.zip` (opsional) | ❌ |

## Bagian 13 — Luaran G.1–G.10

| Butir | Status |
| --- | --- |
| G.1 README | ❌ |
| G.2 Laporan UAS | Ditulis ChatGPT nanti (bukan tugas agent) |
| G.3 Source kontrak + frontend | ✅ kode; ❌ penerimaan akhir menunggu E2E Sepolia |
| G.4 Folder tes + bukti | ✅ (perlu run final) |
| G.5 Deployment record | ✅ (Markdown + JSON) |
| G.6 Security audit | Catatan teknis ✅; PDF formal oleh ChatGPT |
| G.7 Diagram arsitektur | ❌ (PNG/PDF belum dirender) |
| G.8 Slide | Oleh ChatGPT |
| G.9 Video demo | ❌ (belum direkam) |
| G.10 Riwayat kontribusi | ❌ (riwayat ada, identitas/kontribusi anggota belum diberikan) |

## Bagian 14.1 — Checklist teknis

- ✅ Versi final dan perubahan dapat ditelusuri (commit per perubahan).
- ❌ Alur penerbitan/QR/unggah/pencocokan/pencabutan/riwayat/PDF terbukti di Sepolia.
- ❌ Frontend/API/kontrak/DB/storage/proses latar memakai konfigurasi final konsisten (lokal ✅, hosting ❌).
- ✅ Perangkapan kewenangan ditangani dan prosedur rotasi diuji (lokal).
- ✅ S-01..S-15 punya keputusan dan bukti.
- ✅ Unit test positif/negatif/batas/akses/regresi.
- ❌ Lint/typecheck/compile/build/test:db/E2E final pada commit final.
- ❌ Coverage diukur ulang pada versi final.
- ✅ Satu debugging nyata didokumentasikan.
- ✅ Deployment final punya network, address, tx, receipt, event/state, build, reproduksi.
- ❌ Dekripsi FHE nyata untuk kasus cocok dan berbeda.
- ❌ Pencabutan dan akibatnya terbukti di Sepolia.
- ✅ Gagal/timeout/retry/pembatasan tanpa sukses palsu atau tx ganda (tes terkontrol).
- ✅ Kredensial lama ditangani sesuai versi (kode + unit).
- ❌ README dapat dipakai dari checkout bersih.

## Bagian 14.2 — Checklist bahan laporan

- ❌ Setiap butir matriks PDF punya bukti/status (KEPATUHAN belum ada).
- ❌ Fakta arsitektur, pengukuran, akses data, prosedur operasional, backlog tersedia.
- ❌ Kolom tabel template UAS punya data (identitas anggota belum diberikan).
- ❌ Indeks B-01… tersedia.
- ❌ Konsistensi angka lintas dokumen diverifikasi.
- ✅ Screenshot yang ada berasal dari eksekusi nyata dan bebas rahasia.
- ❌ Sumber teknis dan atribusi lengkap (README).
- ❌ Paket handoff (ZIP) dibuat.
- ✅ G.2, G.6 PDF, G.8 tercatat sebagai tahap ChatGPT.
