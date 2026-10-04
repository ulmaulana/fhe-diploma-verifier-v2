# Deployment Record — VerifikasiIjazah (UAS, G.5 / C.3–C.4)

Catatan faktual deployment. Record mesin yang menjadi sumber kebenaran: [`contracts/deployments/sepolia/0x65b1C8C7B59D9651F8619F287Bc1c309FaE094e0.json`](../../contracts/deployments/sepolia/0x65b1C8C7B59D9651F8619F287Bc1c309FaE094e0.json). Record tidak berisi kunci privat; pemindaian semua bukti terhadap nilai rahasia yang terkonfigurasi menghasilkan 0 temuan.

## 1. Jaringan

| Butir | Nilai |
| --- | --- |
| Jaringan | Ethereum Sepolia (testnet publik) |
| Chain ID | `11155111` |
| Explorer | <https://sepolia.etherscan.io> |
| Catatan karakteristik | Sepolia adalah testnet publik: siapa pun dapat membaca dan mengirim transaksi, tetapi set validatornya berizin (dikelola tim klien/penyedia), berbeda dari mainnet. Peran aplikasi (admin, signer, relayer, dll.) adalah kontrol akses di level kontrak, bukan izin menjadi validator. |
| Akses RPC | Satu penyedia RPC melalui `RPC_URL` (berkunci, tidak dicatat). |

## 2. Kontrak aktif (protokol v2, hasil remediasi)

| Butir | Nilai |
| --- | --- |
| Alamat | [`0x65b1C8C7B59D9651F8619F287Bc1c309FaE094e0`](https://sepolia.etherscan.io/address/0x65b1C8C7B59D9651F8619F287Bc1c309FaE094e0) |
| Tx deployment | [`0x4340dd1a4f5c8e87f7e0f0865a6400e1230fd96f13a17605dabb484c42c20258`](https://sepolia.etherscan.io/tx/0x4340dd1a4f5c8e87f7e0f0865a6400e1230fd96f13a17605dabb484c42c20258) |
| Blok | 11841227 (`0xac03468b…564c809`), 2026-10-04T08:58:48Z (15:58:48 WIB) |
| Gas terpakai | 3.041.734 gas, harga efektif 1.193.096.193 wei (≈1,19 gwei) |
| Konfirmasi ditunggu | 2 |
| Deployer | `0xCa01c8C68840cd1C9fdF06F124723a5339224096` |
| Domain EIP-712 | name `VerifikasiIjazah`, version `"2"` |
| Commit sumber | `714a2af0a6bf51f0f7a2ad88d73579891714b7e5` (0 berkas terlacak berubah). Sumber kontrak identik sejak `131dcbb`. |
| SHA-256 `src/VerifikasiIjazah.sol` | `05e13e94fad101b487e70def7e70033c9933309a0b4e7446a4d1bf248398c4b8` |
| Compiler | solc 0.8.28 (`0.8.28+commit.7893614a`, solc-js lokal), optimizer aktif 200 runs, `viaIR: true`, EVM `cancun` |
| Build-info | `4f6da20f1bbc826e68430cd60a8da0be` |
| Keccak creation / deployed bytecode (artefak) | `0x984b734e…f35d15` / `0xa4d9e6c6…2858db` |
| Dependensi penting (lockfile) | hardhat 2.28.6, @openzeppelin/contracts 5.6.1, @fhevm/solidity 0.11.1, @fhevm/hardhat-plugin 0.4.2, @zama-fhe/relayer-sdk 0.4.1, ethers 6.16.0, solc 0.8.28. Record mesin deployment ini mencatat `ethers: null` dan tidak mencantumkan plugin karena bug pembacaan versi yang diperbaiki di `fc0b158`. |
| Verifikasi source | Sourcify API v2: **exact_match** untuk creation dan runtime bytecode (verifikasi `63b17621-844f-4845-a0fd-e16c4c0cb34e`, <https://repo.sourcify.dev/11155111/0x65b1C8C7B59D9651F8619F287Bc1c309FaE094e0>). Percobaan pertama melalui hardhat-verify 2.1.3 gagal HTTP 404 (endpoint lama Sourcify) dan tetap tercatat. Etherscan tidak dicoba (tidak ada API key). |

### 2.1 Pemegang peran (diverifikasi melalui event dan `hasRole` setelah deployment)

| Peran | Alamat | Catatan |
| --- | --- | --- |
| `DEFAULT_ADMIN_ROLE` | `0xCa01c8C68840cd1C9fdF06F124723a5339224096` | Wallet admin/deployer milik pengguna. `adminCount = 1`. |
| `ATTESTOR_ROLE` | `0x6512e69e2aDb0bba5cF96548546809b9B6f702b5` | Wallet uji baru, hanya menandatangani attestation off-chain. |
| `RELAYER_ROLE` | `0xea36d9628c7CaCa078FbD0a9164A5cF0FAc52933` | Wallet uji baru, membayar tx `verify`. |
| `RESULT_READER_ROLE` | `0x84Bd1D6C317554Ff3539Ec62Da6B2F8f882c8B5e` | Wallet uji baru, hanya mendekripsi hasil. |
| Signer institusi (aktif) | `0x399a8A182631de9389B3fB3488537c9461d3a43e` | Institusi sintetis `0xd4aadc1f7b58512ea3b4974d82df569c4cb734aa8049aed5377cb95e8caf62ab`, authorizationId 1; dipakai ulang pada run final. |

Kunci privat wallet uji disimpan di luar repositori (`%USERPROFILE%\.uas-verifikasi\sepolia-test-wallets.env`). Kontrak menolak penggabungan peran (`RoleConflict`) dan pencabutan admin terakhir (`LastAdminRemoval`).

### 2.2 Transaksi pendukung

| Transaksi | Hash | Blok | Keterangan |
| --- | --- | --- | --- |
| Pendanaan relayer 0,25 SepETH | [`0xa4e60f83…e7e42f`](https://sepolia.etherscan.io/tx/0xa4e60f836e348d29a3e121e0528625ad60768b81783ff442fd6dc9bf93e7e42f) | 11841231 | dari deployer |
| Pendanaan signer 0,1 SepETH | [`0x255cc61e…aadd59c`](https://sepolia.etherscan.io/tx/0x255cc61e1527de5a397f2c7e4094a7ff812993c1c1a8ee26a6d4b0ed8aadd59c) | 11841233 | dari deployer |
| `setIssuer` institusi sintetis (portal admin, UI) | [`0x04cf8989…0ba46f`](https://sepolia.etherscan.io/tx/0x04cf89896ceeee79834d1944058545b0ba675ffc90616aca3fe3fc2ab30ba46f) | 11841411 | 73.555 gas; event `IssuerUpdated(0xd4aadc1f…62ab, "Universitas Sintetis UAS (Uji)", true)` |
| `setSigner` signer `0x399a…a43e` (portal admin, UI) | [`0x40cea2ff…50f59d`](https://sepolia.etherscan.io/tx/0x40cea2ff0296f435f4a09f720b1eddc149d1979d1f84acfcc70641daad50f59d) | 11841414 | 130.593 gas; event `SignerUpdated(…, authorizationId 1, true)`. Aktivasi ulang ditolak `SignerAlreadyActive` tanpa transaksi. |
| Penerbitan A (UI final) | [`0xc38bcf8b…afa860`](https://sepolia.etherscan.io/tx/0xc38bcf8b0fa2632d92e95aba2f2eb450af7fbbce5d14e15b04380a5184afa860) | 11842844 | 791.073 gas; `CredentialIssued` |
| Penerbitan B (UI final) | [`0x4c688154…a8a4d0`](https://sepolia.etherscan.io/tx/0x4c6881540938ee63bfc746bd03c953cb93b6d500da4eccb4ef70a97c08a8a4d0) | 11842849 | 791.109 gas; `CredentialIssued` |
| Penerbitan C (UI final) | [`0x33898cec…01ba0`](https://sepolia.etherscan.io/tx/0x33898cecc4a2c0cf090e157dd9cafda926af61a030c3dd114e261d876c201ba0) | 11842856 | 791.097 gas; `CredentialIssued` |
| FHE MATCH A | [`0x2a57f0ac…3c1a84`](https://sepolia.etherscan.io/tx/0x2a57f0ac259c2ee52aa5c948ce6f30e26c1ae533a7abdd95d3a6e180bc3c1a84) | 11842862 | 1.002.250 gas; empat hasil dekripsi `true`, agregat `true` |
| FHE nama berubah | [`0x62e1d27d…1c1ec5`](https://sepolia.etherscan.io/tx/0x62e1d27dd1257c7b5ffaaf192e666da63a312a16870d11b24af860e8e71c1ec5) | 11842867 | 1.002.298 gas; `false,true,true,true`, agregat `false` |
| FHE QR B + atribut A | [`0x3878ea29…dc3a92`](https://sepolia.etherscan.io/tx/0x3878ea29e95e0093e86d4e5379ba69c010d290881869727f62fbe00595dc3a92) | 11842874 | 1.002.286 gas; empat hasil `false`, agregat `false` |
| Pencabutan C (UI final) | [`0x48daa72f…cad501`](https://sepolia.etherscan.io/tx/0x48daa72f6252339d3c768b4c8e04a1005752c901ccbadfb1ab485ea92dcad501) | 11842877 | 40.277 gas; `CredentialRevoked`, QR dan unggahan REVOKED, PDF HTTP 409 |

Receipt dan event terdekode untuk deployment dan registry: [`evidence/sepolia/receipts-deploy-and-registry.json`](evidence/sepolia/receipts-deploy-and-registry.json). Konstruktor memancarkan empat `RoleGranted` (admin, attestor, relayer, reader) ke empat alamat berbeda.

Run UI final pada source `f32afe6`, 4 Oktober 2026 pukul 21:53–22:02 WIB: **12/12 lulus**, memakai PostgreSQL Docker lokal, bukan Supabase. Bukti [run final](evidence/sepolia/e2e-run-2026-10-04T14-53-27-678Z/sepolia-e2e-evidence.json), [15 receipt dari run parsial dan final](evidence/sepolia/receipts-e2e.json), [dekripsi ulang read-only oleh result reader](evidence/sepolia/fhe-decryption-confirmation.json), dan [tepat tiga event perbandingan pada interval run](evidence/sepolia/no-transaction-rejection-confirmation.json). QR baca, no-op registry, QR berbeda dari target, QR origin asing, dan unggahan C yang dicabut tidak mengirim tx baru. Wallet browser hanya mengirim tiga penerbitan dan satu pencabutan; tiga tx `verify` dikirim relayer backend. Dekripsi follow-up tidak membuat transaksi dan durasinya terpisah dari waktu UI.

## 3. Kontrak lama (protokol v1, hanya baca)

| Butir | Nilai |
| --- | --- |
| Alamat | [`0x39de125002edA28c886d9125AE5d61BB5BE04903`](https://sepolia.etherscan.io/address/0x39de125002edA28c886d9125AE5d61BB5BE04903) |
| Tx deployment | `0xf94424d537ff0cd5fd1fd0a513f6fc9d3dc27ab537714d2cd72a15988784449a`, blok 11774130 |
| Domain EIP-712 | version `"1"` |
| Peran (dibaca 2026-10-04, blok 11839966) | Keempat peran dan satu-satunya signer aktif pada `0xCa01…4096` (bukti: [`evidence/sepolia/S-01-legacy-contract-roles.log`](evidence/sepolia/S-01-legacy-contract-roles.log)) |
| Perlakuan | Tidak dihapus. Rekaman lama dibaca melalui daftar kontrak tepercaya server `LEGACY_CREDENTIAL_CONTRACTS=0x39de125002edA28c886d9125AE5d61BB5BE04903:11841226` (batas migrasi = blok sebelum kontrak v2). Rekaman v1 yang terbit setelah batas tidak dipercaya; pencocokan dokumen FHE tidak tersedia untuk rekaman v1. |
| Peran kontrak lama | Tidak dirotasi. Kontrak lama tidak lagi menerima pencocokan dari aplikasi; batas migrasi mencegah penerbitan baru di sana dianggap resmi. |

## 4. Reproduksi

Semua perintah dijalankan dari `contracts/`. Lingkungan dibaca dari `.env` root (`--env-file`); variabel yang ditulis inline mendahului isi berkas. Tanpa `--execute`, setiap tugas hanya menampilkan rencana dan tidak mengirim transaksi.

```bash
# 1. Build dan tes
pnpm --filter @verifikasi/contracts test

# 2. Preflight (tanpa transaksi): chain ID, empat alamat peran berbeda, signer bukan akun layanan, saldo vs estimasi biaya
ADMIN_ADDRESS=0x... ATTESTOR_ADDRESS=0x... RELAYER_ADDRESS=0x... RESULT_READER_ADDRESS=0x... PLANNED_SIGNER_ADDRESSES=0x... \
  node --env-file=../.env node_modules/hardhat/internal/cli/cli.js uas:deploy --network sepolia --expected-chain-id 11155111

# 3. Deployment (menulis contracts/deployments/sepolia/<alamat>.json dan latest.json)
...sama seperti langkah 2... uas:deploy --network sepolia --expected-chain-id 11155111 --confirmations 2 --execute

# 4. Verifikasi source (Sourcify API v2; Etherscan bila ETHERSCAN_API_KEY ada)
CREDENTIAL_CONTRACT_ADDRESS=0x... node --env-file=../.env node_modules/hardhat/internal/cli/cli.js uas:verify-source --network sepolia

# 5. Registrasi idempoten institusi dan signer (atau melalui portal admin)
CREDENTIAL_CONTRACT_ADDRESS=0x... node --env-file=../.env node_modules/hardhat/internal/cli/cli.js uas:register --network sepolia \
  --issuer-id 0x<bytes32> --name "Nama Institusi" --signer 0x<wallet> --expected-chain-id 11155111 --execute

# 6. Pemeriksaan peran (hanya baca)
CREDENTIAL_CONTRACT_ADDRESS=0x... CONTRACT_DEPLOYMENT_BLOCK=<blok> node --env-file=../.env node_modules/hardhat/internal/cli/cli.js uas:roles --network sepolia
```

Rotasi peran memakai `uas:roles --action grant|revoke|transfer-admin --role <PERAN> --account|--to <alamat> --expected-chain-id 11155111 --execute`. `transfer-admin` memberi peran ke admin baru, memverifikasinya, baru kemudian melepas peran pemanggil. Admin terakhir tidak dapat dicabut (ditolak lokal dan oleh kontrak).

## 5. Konfigurasi aplikasi yang harus diselaraskan

Aplikasi lokal untuk uji Sepolia memakai nilai di bawah ini. **Situs Netlify belum diperbarui** dalam pekerjaan ini (masih kontrak lama dan kunci layanan lama); langkahnya ada di [`DEMO.md`](DEMO.md).

| Variabel | Nilai |
| --- | --- |
| `CHAIN_ID` | `11155111` |
| `CREDENTIAL_CONTRACT_ADDRESS` | `0x65b1C8C7B59D9651F8619F287Bc1c309FaE094e0` |
| `CONTRACT_DEPLOYMENT_BLOCK` | `11841227` |
| `LEGACY_CREDENTIAL_CONTRACTS` | `0x39de125002edA28c886d9125AE5d61BB5BE04903:11841226` |
| `RELAYER_PRIVATE_KEY`, `ATTESTOR_PRIVATE_KEY`, `RESULT_READER_PRIVATE_KEY` | kunci tiga wallet uji baru (berbeda; backend menolak duplikat) |
| `MAX_COMPARISONS_PER_HOUR` | `30` |
| ABI | `contracts/generated/VerifikasiIjazah.json` (dihasilkan `pnpm --filter @verifikasi/contracts build`) |
