# Fakta arsitektur dan pengukuran Verifikasi Ijazah

Catatan teknis untuk bahan B.1–B.6, E.1–E.5, dan F.4–F.6; bukan laporan evaluasi enterprise. Penyajian waktu memakai WIB (UTC+07:00), sementara bukti mesin mempertahankan UTC.

## Versi dan ruang bukti

| Objek | Versi dan kondisi yang benar-benar diperiksa |
| --- | --- |
| Kontrak v2 | Sepolia `11155111`, `0x65b1C8C7B59D9651F8619F287Bc1c309FaE094e0`; deployment blok 11841227; source Solidity identik sejak `131dcbb`; Sourcify exact_match. Detail ada di [deployment record](DEPLOYMENT_RECORD.md). |
| UI Sepolia nyata | Source `f32afe67b39af7b38e524e263bc63b5a0973c5a6`, 4 Oktober 2026, 21:53–22:02 WIB; 12 skenario lulus. Next.js lokal, PostgreSQL Docker `verifikasi_local`, OCR dan Zama nyata, wallet uji khusus; [bukti UI](evidence/sepolia/e2e-run-2026-10-04T14-53-27-678Z/sepolia-e2e-evidence.json). |
| Verifikasi checkout bersih | Source `8a13faaaac696700c8018cc6c947682028393afc`; 4 Oktober 2026, 22:14:32–22:22:52 WIB. Delapan perintah exit 0; 417 unit/kontrak, 9 database, 25 E2E lokal lulus; 12 tes Sepolia opt-in dilewati pada run lokal. [Konteks final](evidence/final/verification-context.json), [hasil tes](TEST_RESULTS.md). |
| Lingkungan database | Semua pengujian yang dicatat memakai PostgreSQL Docker lokal `verifikasi-uas-pg`, bukan Supabase produksi. Test database `verifikasi_test` terpisah dari aplikasi testnet lokal `verifikasi_local`. |
| Hosting | Kode mendukung Netlify Background Functions/Blobs serta Workflow dan penyimpanan lokal/Vercel. Penyelarasan situs Netlify pengguna ke kontrak/peran v2 belum dilakukan; bukti lokal tidak menjadi bukti deployment aplikasi produksi. Langkah pengguna ada di [DEMO](DEMO.md). |
| Video G.9 | [MP4 rekaman UI nyata](evidence/sepolia/e2e-run-2026-10-04T14-53-27-678Z/Video_Demo_Sepolia.mp4), 555,88 detik, 1280×900, 25 fps; WebM asli dipertahankan. [Metadata](evidence/sepolia/e2e-run-2026-10-04T14-53-27-678Z/video-metadata.json) memuat SHA-256, konversi, dan QA. Rekaman otomatis tanpa narasi manusia. |

Nilai `synthetic: false` pada job testnet berarti job tidak melalui hasil sintetis mode demo; isi PDF uji tetap data fiktif yang dibuat spec. Keberhasilan FHE berikut berasal dari transaksi dan dekripsi layanan nyata. Kegagalan run sebelumnya dipertahankan dalam [hasil tes](TEST_RESULTS.md).

## Aktor, hak akses, dan batas kepercayaan

| Aktor | Operasi aktual | Batas kepercayaan dan bukti |
| --- | --- | --- |
| Pemeriksa | Membaca `/c/{id}` tanpa login/wallet; mengunggah dokumen; membaca riwayat/laporan hanya pada sesi pemilik. | Browser dan dokumen tidak dipercaya. API memvalidasi origin, QR, CSRF, sesi, format, dan batas dokumen; [http.ts](../../apps/web/src/server/http.ts), [jobs.ts](../../apps/web/src/server/jobs.ts). |
| Pejabat institusi | Login dengan `personal_sign` challenge; meninjau profil dan atribut; EIP-712 `CredentialAuthorization`; transaksi `issueCredential` dan `revoke`. | Login membuktikan penguasaan wallet kepada API, tanpa transaksi chain. Kontrak memeriksa signer aktif dan issuer yang sama. Kebenaran fakta akademik tetap tanggung jawab institusi. |
| Admin platform | `setIssuer`, `setSigner`, grant/revoke/renounce role. | Admin dapat mengubah registry. Kontrak melindungi admin terakhir; belum ada multisig/timelock. [Kontrak](../../contracts/src/VerifikasiIjazah.sol), [tooling](../../contracts/scripts/lib/roles.cjs). |
| Attestor backend | Menandatangani attestation yang mengikat request, berkas, credential ID, versi, handle, relayer, reader, nonce, dan deadline. | Memercayai OCR backend. Kunci memiliki `ATTESTOR_ROLE`, terpisah dari admin/signer/layanan lain. |
| Relayer backend | Mengenkripsi input hasil OCR, menyiapkan outbox, membayar transaksi `verify`. | Lease dan anggaran global membatasi pengiriman. Tidak mendapat ACL dekripsi referensi. |
| Result reader backend | `userDecrypt` boolean per field dan agregat untuk pekerjaan berwenang. | Memerlukan role reader dan ACL pada hasil terkait; tidak mendapat ACL atribut referensi. Pencabutan role tidak menghapus ACL ciphertext hasil lama. |
| Operator API/DB/storage | Mengelola konfigurasi, migrasi, job, bukti penerbitan, dan berkas privat. | Backend melihat dokumen/OCR plaintext; FHE tidak membuat keseluruhan aplikasi menjadi enkripsi ujung ke ujung. Tiga kunci layanan dalam backend yang sama tetap satu batas operasional. |
| Penyedia RPC dan Zama | RPC menyediakan state/receipt; Zama menyediakan enkripsi input dan dekripsi berizin. | Chain ID/kode kontrak diperiksa; satu RPC tidak menyediakan kuorum kebenaran. Gangguan harus menghasilkan gagal/menunggu, bukan sukses palsu. |

Lima alamat uji berbeda tercatat pada [deployment record](DEPLOYMENT_RECORD.md): admin `0xCa01…4096`, attestor `0x6512…02b5`, relayer `0xea36…2933`, reader `0x84Bd…8B5e`, dan signer institusi `0x399a…a43e`. Institusi sintetis ber-ID `0xd4aadc1f7b58512ea3b4974d82df569c4cb734aa8049aed5377cb95e8caf62ab`. Role aplikasi ini terpisah dari izin validator Sepolia.

## Model data, lokasi, privasi, dan retensi

| Data/fungsi | Lokasi dan sifat | Akses/kontrol | Retensi dan alasan teknis |
| --- | --- | --- | --- |
| Issuer dan riwayat signer | On-chain: nama institusi, status, periode kewenangan, authorization ID. | Publik dibaca; admin mengubah registry; otorisasi historis tidak dihapus saat rotasi. | Persisten pada chain; diperlukan untuk memeriksa kewenangan saat penerbitan. |
| Credential | On-chain: ID, issuer/signer, waktu/blok terbit/cabut, versi, digest otorisasi, hash profil/nama/handle, empat referensi terenkripsi. | Publik untuk metadata; `private` Solidity membatasi interface, bukan kerahasiaan byte storage. Referensi FHE hanya mendapat `allowThis`. | Persisten; pencabutan mengubah status, tidak menghapus bukti. |
| Comparison | On-chain: request ID, credential ID, upload commitment bersalt, result reader, waktu, handle boolean. | Role relayer + signature attestor diperlukan; ACL hasil diberikan kepada reader. | Persisten; metadata transaksi/request tetap terlihat meski berkas off-chain dihapus. |
| Profil QR yang disahkan | Off-chain snapshot yang diikat `publicDataHash` dan EIP-712: nama, nomor ijazah, prodi, institusi. | API publik hanya menampilkan setelah validasi bukti/state. Tanggal lulus tidak ditampilkan. | Bukti penerbitan dipertahankan untuk pembacaan QR; TTL job unggahan tidak menghapusnya. Atribut profil yang memang publik tidak dirahasiakan oleh salinan FHE. |
| `credential_drafts`, `signed_credentials` | PostgreSQL JSONB: snapshot, payload/signature, handles/proof, domain, transaksi terbit; `documentDate` privat turut tersimpan. | API kampus memeriksa wallet pemilik dan snapshot immutable; payload tidak bisa diganti untuk ID yang sama. Tabel memakai RLS; backend tetap pihak tepercaya. | Draf memiliki deadline/`expires_at`, tetapi tidak ada purge otomatis tabel draf/bukti yang ditemukan. Signed proof tidak mengikuti cleanup job. Deadline membatasi penerbitan baru, bukan validitas rekaman yang sudah terbit. |
| `credential_documents` dan PDF penerbit | PostgreSQL metadata + blob/disk privat: tanggal lulus dan arsip PDF. | Signer yang saat ini aktif pada institusi yang sama, bukan hanya wallet penerbit asli; rekaman aktif terverifikasi diperlukan; dicabut → HTTP 409. | Arsip sengaja terpisah dari retensi sesi/job; tidak ada TTL/purge otomatis arsip yang ditemukan. Kebijakan retensi institusi dan penghapusan arsip perlu ditentukan pengguna. |
| Upload, OCR, salt, signed outbox | Blob privat/disk lokal per job; OCR plaintext hanya backend/sesi pemilik. | Digest/ukuran berkas dan kepemilikan sesi diperiksa; API bukan endpoint tebakan atribut. Outbox menyimpan transaksi signed sebelum broadcast. | Artefak berakhir 1 jam setelah keputusan, paling lambat 24 jam sejak unggah; akses berhenti menurut timestamp, penghapusan fisik menunggu cleanup. Tombstone mencegah worker/retry membuat ulang artefak terhapus. |
| `verification_state`, job/sesi/kuota | Satu baris PostgreSQL JSONB; status, ownership, idempotensi, reservasi, dan metadata. | Transaksi `FOR UPDATE`; lock timeout 5 detik dan statement timeout 15 detik. | Riwayat/sesi 24 jam; job kedaluwarsa dihapus setelah artefak dihapus. Metadata workflow lokal dan log memiliki lifecycle tersendiri; tidak dibuktikan turut terhapus oleh cleanup berkas. |
| Lease relayer | `verification_relayer_leases` PostgreSQL, owner token + expiry. | Atomic claim, renewal, fencing; worker lama tidak dapat melepas lease penerus. | Expiry memungkinkan pemulihan crash; lease menyerialkan nonce satu akun relayer. |
| Laporan PDF hasil pemeriksaan | Off-chain: OCR plaintext, keputusan per atribut, metadata rekaman, digest berkas, salt dan upload commitment. | Route unduhan memerlukan sesi pemilik; bukan data anonim dan bukan endpoint publik. Evidence UAS hanya memuat laporan fixture sintetis. | Mengikuti masa akses job/artefak pemeriksa; salinan yang telah diunduh berada dalam kendali pengguna. |
| Audit internal dan metadata proses | Audit state berisi event operasional; workflow memiliki metadata/lifecycle tersendiri. | Log diagnostik memakai allowlist event/stage/code; error mentah dan OCR tidak dicetak ke log teknis. Metadata mentah tidak disalin ke handoff. | Audit state dibatasi 1.000 event, bukan TTL waktu. Retensi log/backup/workflow platform belum dibuktikan sebagai TTL unggahan. |
| Log dan evidence UAS | Log teknis, receipt, boolean berizin, fixture/screenshot/video sintetis. | Pemindaian nilai rahasia sebelum commit; tidak memuat key, cookie, proof dekripsi, RPC/database URL. | Evidence dipertahankan di repo; kebijakan log platform/backup belum diverifikasi. Tx hash/alamat/blok publik dapat menghubungkan aktivitas. |

Sumber retensi: [config.ts](../../apps/web/src/server/config.ts), [jobs.ts](../../apps/web/src/server/jobs.ts), [db/schema.ts](../../apps/web/src/server/db/schema.ts), [credentials-repository.ts](../../apps/web/src/server/credentials-repository.ts), [storage.ts](../../apps/web/src/server/storage.ts), [workflow-jobs.ts](../../apps/web/src/server/workflow-jobs.ts). `enableRLS()` tidak membuktikan administrator/operator database tidak dapat membaca data.

Route publik [GET /api/credentials/{id}](../../apps/web/src/app/api/credentials/%5Bid%5D/route.ts) mengembalikan profil/status beserta bundle `signedCredential` yang lolos validasi dan status terkonfirmasi; respons PENDING tidak memuat bundle. `documentDate` disimpan terpisah pada row backend dan tidak disertakan. Penulisan [POST proof](../../apps/web/src/app/api/credentials/%5Bid%5D/proof/route.ts) memerlukan sesi wallet pemilik. RLS atas tabel tidak berarti seluruh isi bukti bertanda tangan dirahasiakan melalui API.

## Fitur Solidity yang benar-benar digunakan (B.5)

Seluruh pemetaan berikut merujuk [VerifikasiIjazah.sol](../../contracts/src/VerifikasiIjazah.sol); bukan daftar fitur yang harus ditambahkan.

| Fitur | Pemakaian aktual |
| --- | --- |
| Function/visibility | Mutasi registry `external`, `issueCredential`, `verify`, `revoke`; view getter/paginasi `public`/`external`; helper `_heldRole` dan `_recover` `private`, override role `internal`. Hash helper memakai `pure`/`view` sesuai kebutuhan. |
| Struktur dan koleksi | `Issuer`, `SignerAuthorization`, `CredentialAuthorization`, `Credential`, `Verification`, `Comparison`; mappings registry/nonce/request/credential, dynamic array ID kredensial per issuer, fixed array empat `euint256`/`ebool`. |
| Modifier | `onlyRole` OpenZeppelin untuk registry dan relayer. Kewenangan signer/issuer diperiksa eksplisit; tidak ada modifier buatan sendiri. |
| Event/error | `IssuerUpdated`, `SignerUpdated`, `CredentialIssued`, `ComparisonRequested`, `CredentialRevoked`; custom errors termasuk `RoleConflict`, `LastAdminRemoval`, `IssuerNameChanged`, `SignerAlreadyActive`. Event final terbukti pada receipt. |
| Inheritance/interface | Mewarisi `ZamaEthereumConfig`, `AccessControl`, `EIP712`; override `_grantRole`/`_revokeRole`; memakai interface yang dibawa dependensi, tanpa interface aplikasi buatan sendiri. |
| Library/kriptografi | `ECDSA.tryRecoverCalldata`, EIP-712 `_hashTypedDataV4`, `keccak256`, `abi.encode`; `FHE.fromExternal`, `FHE.eq`, `FHE.and`, `FHE.allowThis`, `FHE.allow`. Algoritma tanda tangan berasal dari pustaka teruji. |
| Kontrol bisnis | Admin/role saling eksklusif; signer aktif satu institusi; nonce/request anti-replay; nama institusi terikat payload; ID diturunkan dari chain+kontrak+issuer+signer+nonce; paginasi maksimal 100, loop empat atribut. |
| Batas implementasi | Tidak ada enum aplikasi, token/NFT, proxy upgradeable, multisig, atau timelock. Fitur tersebut tidak diwajibkan sebagai jumlah fitur pada soal. Tidak ada `makePubliclyDecryptable` untuk referensi/hasil. |

## Keputusan yang diterapkan (B.6)

| Keputusan | Mekanisme dan konsekuensi yang dapat diperiksa |
| --- | --- |
| E-sign data EIP-712 | Profil publik dan komitmen input berada dalam payload yang sama. Domain v2 mengikat chain/alamat; signature tx saja tidak menggantikan pengesahan data. Ini bukan PKI/PAdES untuk seluruh PDF. |
| ID dan nama dalam binding | `credentialIdFor` dan `issuerNameHash` menangani S-03/S-04; perubahan snapshot memerlukan ID/penerbitan baru. Perubahan protokol v1 → v2 memerlukan redeploy dan pembaca v1 terpisah. |
| Digest 256 bit + FHE | Empat digest kanonis dienkripsi sebagai `euint256`; equality memakai FHE, bukan handle/ciphertext byte equality. Normalisasi deterministik; OCR ambigu/tidak layak → INCONCLUSIVE. Referensi tidak mendapat ACL akun. |
| QR berbeda dari unggahan | QR memberikan `VERIFIED_RECORD`, `RECORD_ONLY`, `documentDecision=null`, tanpa tx baru. MATCH mensyaratkan dokumen layak, FHE/dekripsi dan baca ulang status. Salinan dokumen dengan empat atribut sama dapat tetap MATCH. |
| OCR tepercaya di backend | MuPDF/zxing/tesseract.js memproses halaman yang dirender, termasuk PDF dengan teks tersembunyi; confidence/QR/atribut pada halaman sama divalidasi. WASM/worker dan batas parser tidak setara isolasi proses OS. |
| DB dan state atomik | PostgreSQL/Drizzle mempertahankan atomic ownership, kuota, dan retry; satu row lock serta lease relayer membatasi skala. Refactor besar tidak dilakukan karena tes lokal tidak menunjukkan lost update. |
| Peran dan biaya relayer | Tiga kunci layanan berbeda dari signer/admin; role dicek sebelum operasi sensitif. Anggaran global default 30 pencocokan/jam, konfigurabel melalui `MAX_COMPARISONS_PER_HOUR`; reservasi atomic, saldo dicek, retry memakai outbox lama. Batas ini tidak menghilangkan oracle tebakan bila backend dikuasai. |
| Penyimpanan privat dan hosting | Bukti/publik profile disimpan terpisah dari artefak pemeriksa. Kode menyediakan Netlify, Vercel, S3, dan lokal; run nyata memakai lokal. Mengubah hosting produksi membutuhkan tindakan pengguna. |

Rujukan: [catatan S-01–S-15](CATATAN_TEMUAN_DAN_RETEST.md), [domain](../../packages/domain/src), [credentials](../../packages/credentials/src), [chain](../../packages/chain/src), [OCR](../../packages/ocr/src). Perilaku ACL pustaka dirujuk pada [dokumentasi resmi Zama](https://docs.zama.org/protocol/solidity-guides/smart-contract/acl), sementara implementasi yang dilaporkan mengikuti versi terkunci `@fhevm/solidity 0.11.1`.

## Tujuh aspek fakta implementasi E.1

| Aspek | Fakta implementasi dan bukti | Batas pengamatan |
| --- | --- | --- |
| Identitas | Wallet EOA kampus/admin, challenge sesi, registry issuer, role layanan, signer authorization historis; [deployment record](DEPLOYMENT_RECORD.md), [portal](../../apps/web/src/features/portal/PortalPage.tsx). | Pengesahan identitas institusi dilakukan operator onboarding; blockchain tidak memvalidasi nama/fakta akademik sendiri. |
| Permissioning | Publik membaca QR/chain; mutasi dibatasi role dan signature; dekripsi dibatasi ACL. [Kontrak](../../contracts/src/VerifikasiIjazah.sol). | Hak aplikasi tidak menentukan hak menjadi validator jaringan. |
| Konsensus | Sepolia adalah testnet Ethereum publik dengan validator berizin yang dikendalikan tim klien/pengujian; [ethereum.org](https://ethereum.org/developers/docs/networks/). Aplikasi menunggu minimal dua konfirmasi. | Tidak menjalankan validator sendiri atau mengukur finalitas konsensus. Dua konfirmasi merupakan kebijakan aplikasi, bukan klaim finalitas absolut. |
| Privasi | Metadata chain/profil publik terbuka; referensi FHE dan hasil ber-ACL; PDF/OCR/tanggal privat off-chain. | Backend menerima plaintext. Publikasi data dan retensi memerlukan kebijakan operator; tidak ada klaim kepatuhan hukum. |
| Throughput | Run final tiga `verify`; benchmark row lock lokal 78,7–108,7 mutasi/detik; satu relayer lease. | Angka DB bukan TPS jaringan atau kapasitas produksi; pengukuran UI mempunyai sampel kecil dan dependensi layanan. |
| Governance | Admin tunggal saat deployment, role tooling, last-admin guard, kontrak non-upgradeable, whitelist v1 + cutoff; [tooling](../../contracts/scripts/lib/roles.cjs). | Tidak ada governance konsorsium, node bersama, kebijakan sengketa, atau multisig yang terbukti. |
| Biaya | Gas/fee receipt dalam Sepolia; relayer membayar pencocokan, signer membayar terbit/cabut, QR hanya read. | SepETH bukan harga rupiah; tidak mengukur harga mainnet, tagihan Netlify/Supabase, atau biaya operator produksi. |

Tidak ada deployment/pengujian Fabric. Tabel ini menyediakan sisi implementasi proyek; perbandingan Fabric, rekomendasi public/permissioned/database, dan evaluasi tertulis disusun ChatGPT.

## Gas dan biaya transaksi nyata

Data mentah: [deployment/registry receipt](evidence/sepolia/receipts-deploy-and-registry.json) dan [15 receipt run parsial/final](evidence/sepolia/receipts-e2e.json). Tabel di bawah memisahkan registry awal dari tujuh transaksi run final. Semua status receipt yang dicantumkan sukses.

| Fungsi/skenario | Gas | Blok | Tx (rujukan lengkap di receipt/deployment record) |
| --- | ---: | ---: | --- |
| Deployment v2 | 3.041.734 | 11841227 | `0x4340dd1a…c20258` |
| `setIssuer` | 73.555 | 11841411 | `0x04cf8989…0ba46f` |
| `setSigner` | 130.593 | 11841414 | `0x40cea2ff…50f59d` |
| `issueCredential` A | 791.073 | 11842844 | `0xc38bcf8b…afa860` |
| `issueCredential` B | 791.109 | 11842849 | `0x4c688154…a8a4d0` |
| `issueCredential` C | 791.097 | 11842856 | `0x33898cec…01ba0` |
| `verify` MATCH A | 1.002.250 | 11842862 | `0x2a57f0ac…3c1a84` |
| `verify` nama berubah | 1.002.298 | 11842867 | `0x62e1d27d…1c1ec5` |
| `verify` QR B + atribut A | 1.002.286 | 11842874 | `0x3878ea29…dc3a92` |
| `revoke` C | 40.277 | 11842877 | `0x48daa72f…cad501` |

Tiga penerbitan final: median 791.097, rentang 791.073–791.109 gas. Tiga pencocokan dengan input berbeda: median 1.002.286, rentang 1.002.250–1.002.298 gas; bukan benchmark fungsi yang inputnya identik. `feeWei = gasUsed × effectiveGasPriceWei`; komponen tersebut tersedia per receipt dan tidak dikonversi ke rupiah. No-op registry dan tiga upload ditolak tidak mempunyai gas transaksi baru. [Scan event](evidence/sepolia/no-transaction-rejection-confirmation.json) tepat menemukan tiga `ComparisonRequested` pada interval final, sesuai tiga job diterima.

## Durasi tahap UI dan Workflow

Data [sepolia-ui-stage-timings.json](evidence/measurements/sepolia-ui-stage-timings.json): 11 job teramati dari dua run, enam job mempunyai tx perbandingan. Timer server memakai `createdAt` sampai tahap terminal selesai; `checkedAt` rekaman memakai timestamp blok terkonfirmasi dan **tidak** menjadi timestamp selesai pekerjaan. Timer UI mulai sebelum klik verifikasi dan berakhir setelah heading, fetch job, dan screenshot; dibulatkan ke detik serta mencakup overhead evidence.

| Skenario final (ukuran byte) | Antrean ke ekstraksi, s | Ekstraksi, s | Submit/gating, s | Tunggu ke conclude terakhir, s | Conclude terakhir, s | Total server, s | UI, s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| MATCH A (26.549) | 14,080 | 1,215 | 28,188 | 21,962 | 10,958 | 76,434 | 77 |
| Nama berbeda (26.548) | 0,093 | 1,107 | 21,807 | 32,731 | 11,703 | 67,468 | 70 |
| QR B ≠ target A (26.794) | 0,092 | 1,152 | 0,076 | — | — | 1,348 | 3 |
| QR B + atribut A (26.659) | 0,080 | 1,056 | 21,238 | 44,043 | 11,412 | 77,864 | 79 |
| QR origin asing (26.569) | 0,096 | 1,169 | 0,060 | — | — | 1,350 | 2 |
| C dicabut (26.561) | 0,084 | 1,104 | 1,677 | — | — | 2,894 | 5 |

Total juga mencakup jeda penjadwalan ekstraksi → submit (0,025–0,035 detik; lihat JSON). Ekstraksi meliputi baca storage, validasi, render, QR, OCR, dan persistensi; submit meliputi gates/RPC/lease/enkripsi/signing/broadcast; conclude meliputi konfirmasi, dekripsi, baca ulang status, dan persistensi. **Waktu CPU OCR murni, konfirmasi murni, dan dekripsi saat run UI tidak diinstrumentasi terpisah.** Sleep cleanup satu jam setelah keputusan tidak dimasukkan ke total.

Penerbitan A/B/C final: waktu sampai review terenkripsi 20/17/17 detik (median 17, rentang 17–20); waktu dari persiapan sampai heading penerbitan terkonfirmasi 79/67/88 detik (median 79, rentang 67–88). Timer kedua mencakup enkripsi, review/signing/wallet UI, submit, dan konfirmasi; tidak dinamai waktu konfirmasi chain murni.

| Pengulangan kecil, n=2 per skenario | Total server median/rentang, s | UI median/rentang, s |
| --- | --- | --- |
| MATCH A | 80,081 / 76,434–83,728 | 81,5 / 77–86 |
| Nama berubah | 62,041 / 56,614–67,468 | 64,5 / 59–70 |
| QR B + atribut A | 73,5905 / 69,317–77,864 | 75,5 / 72–79 |

Run pembanding memakai `018614f`, run final `f32afe6`. Orang/atribut dan issuer sama, tetapi credential ID, bytes PDF, ciphertext dan waktu jaringan berbeda. Pengulangan bukan sampel identik atau estimasi percentile/throughput representatif. Tidak ada workflow retry pada enam job final; ada tiga/empat/lima polling conclude untuk tiga job FHE.

## Dekripsi follow-up yang benar-benar diukur

[fhe-decryption-confirmation.json](evidence/sepolia/fhe-decryption-confirmation.json) mengukur enam pemanggilan **read-only baru** atas hasil ciphertext dua run; tidak mengirim transaksi. Request/credential/commitment dicek terhadap receipt/event/state, reader berwenang, dan minimal dua konfirmasi. Empat boolean dan agregat cocok dengan hasil UI: MATCH → semua `true`; nama berubah → `false,true,true,true`; QR B + atribut A → semua `false`.

Timer `userDecryptSeconds` mulai tepat sebelum `userDecrypt` hingga promise selesai; mencakup ACL SDK, jaringan/polling Zama, serta pemrosesan lokal. `sdkBootstrapSeconds` terpisah diukur sekitar `createInstance`. Nilai mentah per sampel terdapat di JSON; cache/hasil terdahulu dapat memengaruhi durasi. Angka follow-up tidak menggantikan durasi dekripsi UI yang belum tersedia.

| Ciphertext hasil skenario | Bootstrap SDK / userDecrypt, s, hasil run `018614f` | Bootstrap SDK / userDecrypt, s, hasil run final `f32afe6` |
| --- | --- | --- |
| MATCH A | 6,019555 / 5,046554 | 2,266272 / 3,222218 |
| Nama berubah | 2,352582 / 4,390602 | 2,036196 / 3,264551 |
| QR B + atribut A | 2,172863 / 3,276780 | 2,198089 / 3,125448 |

Keenam follow-up dijalankan 4 Oktober 2026, 22:07 WIB. Kolom source di atas menunjukkan asal ciphertext, bukan waktu timer pada run source.

## Benchmark lokal S-12 dan batas kapasitas

[Benchmark S-12](evidence/measurements/S-12-state-row-benchmark.log), source `e680d5e`, 4 Oktober 2026 16:40:43 WIB: PostgreSQL 16 Docker lokal, 500 sesi + 200 job, state row 8.188 byte, 200 mutasi baca-ubah-tulis per tingkat. Pengujian berlangsung bersama E2E Sepolia sehingga aktivitas mesin dapat memengaruhi angka absolut.

| Konkurensi / pool maksimum | Selesai / error | Mutasi/detik | p50, ms | p95, ms |
| --- | --- | ---: | ---: | ---: |
| 1 / 1 | 200 / 0 | 78,7 | 12,0 | 16,9 |
| 5 / 5 | 200 / 0 | 101,5 | 45,4 | 64,8 |
| 20 / 10 | 200 / 0 | 104,0 | 186,3 | 201,6 |
| 50 / 10 | 200 / 0 | 108,7 | 450,9 | 465,2 |

Counter akhir 800/800, lost update 0. Ini membuktikan serialisasi pada input dan beban lokal tersebut; laju mendatar sekitar 100 mutasi/detik dan latensi bertambah saat antrean meningkat. Ukuran `stateRowBytes` mengikuti metode skrip benchmark, bukan ukuran keseluruhan DB produksi. Paginasi kontrak maksimal 100 dan loop empat atribut membatasi kerja per panggilan, sementara array kredensial tetap tumbuh. Lease relayer/nonce satu wallet, row lock, polling Workflow, parser, saldo, RPC dan Zama menjadi dependensi kapasitas.

## Interoperabilitas, governance, dan prosedur operasional

Interoperabilitas yang tersedia: ABI dihasilkan workspace `contracts`, ethers v6; EIP-712 domain v2; QR URL origin resmi `/c/{credentialId}`; PDF sintetis/template OCR; schema `academic-diploma-v1`, normalizer `academic-normalizer-v1`, encoding `sha256-euint256-v1`. Integrasi bergantung pada FHEVM/SDK Zama dan pemetaan empat field; belum menerapkan W3C Verifiable Credentials atau konektor sistem akademik produksi. Dokumen luar yang tidak memenuhi QR/kelayakan berhenti sebelum tx. Kontrak v1 dibaca dari whitelist server dengan cutoff 11841226; domain lama tidak dianggap berpindah ke v2.

| Perubahan/operasi | Pihak yang secara teknis mampu | Prosedur yang ada / bagian belum ditetapkan |
| --- | --- | --- |
| Registry, signer, nonaktif institusi | Admin kontrak | Portal UI dan `uas:register`; signer aktif tidak dipindah lintas institusi sebelum dinonaktifkan. Snapshot/history tetap diperiksa; onboarding organisasi di luar kode. |
| Rotasi role/admin | Admin / pemegang role untuk renounce | `uas:roles`, preflight chain/role, grant admin baru → verifikasi → revoke/renounce admin lama; last-admin guard. Tes lokal membuktikan urutan; tidak melakukan rotasi admin Sepolia demi screenshot. [Panduan deployment](DEPLOYMENT_RECORD.md). |
| Koreksi ijazah dan pencabutan | Signer aktif institusi sama | Bukti/publik profil immutable; koreksi memerlukan credential ID/pengesahan/penerbitan baru. Pencabutan tersendiri memancarkan event dan menutup PDF. Kebijakan banding/sengketa institusi belum ditentukan. |
| Source dan protokol | Pemilik repo/operator deployment | Git, build/test/coverage, deploy kontrak baru, source verification, selaraskan domain/config. Tidak ada upgrade in-place/proxy atau rollback state chain; whitelist v1 menjaga pembacaan historis. |
| Config API/DB/storage dan recovery | Operator layanan | `.env.example`, migrasi eksplisit, outbox/retry/lease/tombstone; kegagalan layanan tidak menjadi MATCH. Prosedur backup/disaster recovery produksi dan retensi arsip institusi belum diverifikasi/ditetapkan. |
| Provider/node/validator | Operator dapat mengganti RPC; validator ditentukan jaringan | Pemeriksaan chain ID/alamat wajib. Repo tidak menjalankan validator, tidak dapat memberi izin validator melalui `grantRole`, dan tidak memiliki kuorum RPC. |
| Publikasi aplikasi Netlify | Pengguna pemilik hosting | Langkah sinkronisasi v2 di [DEMO](DEMO.md); belum dikerjakan tanpa izin produksi. Perilaku header platform/storage/TTL harus divalidasi di namespace uji hosting. |

Role mengikuti pustaka [OpenZeppelin AccessControl](https://docs.openzeppelin.com/contracts/5.x/access-control); guard konflik/last-admin merupakan aturan tambahan proyek. Kunci backend yang berbeda bukan organisasi/operator independen.

## Fakta F.4, dependensi, dan pekerjaan lanjutan

Fakta yang relevan untuk pembahasan ChatGPT: nama/nomor ijazah/prodi/institusi dipublikasikan oleh signer; tanggal lulus, unggahan, OCR dan arsip tetap privat off-chain; metadata blockchain permanen; backend/operator storage dipercaya; biaya dan ketersediaan bergantung pada saldo SepETH, PostgreSQL, runtime hosting, RPC, Zama dan parser. Kehilangan bukti off-chain menghalangi validasi QR meski state chain masih ada. QR dapat dibaca saat OCR gagal, selama DB proof/RPC tersedia. Tidak ada klaim keaslian kertas, seluruh tampilan PDF, atau kepatuhan regulasi yang diuji.

Stack terkunci: Next.js 16.3.6/React 19.3.0/TypeScript 5.9.3, pnpm 10.19.0; hardhat 2.28.6, solc 0.8.28 viaIR/cancun, OpenZeppelin 5.6.1, `@fhevm/solidity 0.11.1`, relayer-sdk 0.4.1, ethers 6.16.0. [Dependency guard](evidence/final/dependency-guard.json) mencatat denylist pengguna tanpa hit dan tanpa perubahan manifest/lockfile sejak `7757f76`; pemeriksaan ini bukan jaminan keamanan seluruh dependensi.

| Pekerjaan lanjutan | Alasan dan ketergantungan |
| --- | --- |
| Sinkronisasi dan retest Netlify v2 | Membutuhkan tindakan/izin pengguna; membuktikan konfigurasi role, header tepercaya, storage/cleanup pada hosting aktual. |
| Kebijakan arsip, backup, sengketa institusi | Arsip/bukti tidak mempunyai autopurge; memerlukan keputusan pemilik data/organisasi dan uji recovery yang sah. |
| Instrumentasi tahap lebih rinci | Timestamp broadcast/confirmed/userDecrypt diperlukan bila ingin waktu konfirmasi/dekripsi UI murni. Pengukuran saat ini menyediakan batas composite yang jujur. |
| Pecah aggregate DB / relayer tambahan bila beban menuntut | Benchmark membuktikan bottleneck; desain baru harus mempertahankan atomic quota, owner fencing, outbox/idempotensi dan nonce. Tidak diperlukan untuk meluluskan demo sekarang. |
| Kuorum RPC, multisig/timelock, pengaman oracle tambahan | Risiko residual S-02/S-06/S-07; keputusan membutuhkan kebutuhan trust/biaya operator, bukan penambahan fitur otomatis. |
| Identitas/kontribusi anggota dan pemahaman demo | Riwayat commit tersedia; nama/NPM dan bukti kontribusi nonkode belum diberikan. Kelulusan tes tidak mengukur pemahaman manusia. |
