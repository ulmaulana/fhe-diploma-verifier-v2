# Menjalankan alur Sepolia

Integrasi ini belum pernah melakukan transaksi testnet dalam sesi implementasi. Jangan menganggap tes FHEVM mock sebagai bukti dekripsi melalui protokol Zama sungguhan.

1. Untuk hosting Vercel, siapkan Services, Blob privat, Workflow, dan Supabase mengikuti [panduan deployment](vercel.md). Jalankan `pnpm db:migrate` memakai `DATABASE_MIGRATION_URL` direct/session pooler port 5432; runtime memakai `DATABASE_URL` transaction pooler port 6543. Untuk lokal, PostgreSQL Docker juga didukung setelah migrasi. Isi RPC Sepolia (`CHAIN_ID=11155111`), token worker acak, wallet deployer dengan test ETH, serta wallet berbeda untuk admin, attestor, relayer, dan result reader. Kunci layanan hanya di backend. Kampus memakai wallet browser dan tidak menyerahkan private key kepada form.
2. Cocokkan `ADMIN_ADDRESS`, `ATTESTOR_ADDRESS`, `RELAYER_ADDRESS`, `RESULT_READER_ADDRESS` dengan wallet yang akan digunakan. Relayer Zama Sepolia terbuka dan tidak membutuhkan API key; SDK browser maupun backend memakai `SepoliaConfig` tanpa `auth`. API key pada layanan Zama-hosted diperlukan untuk mainnet. Lihat [dokumentasi autentikasi Zama](https://docs.zama.org/protocol/sdk/guides/authentication) dan [Relayer API keys](https://docs.zama.org/protocol/sdk/guides/relayer-api-keys). Kunci wallet relayer aplikasi tetap diperlukan untuk menandatangani transaksi pencocokan di Sepolia.
3. Deploy kontrak setelah semua alamat benar:

```powershell
node --env-file=.env node_modules/tsx/dist/cli.mjs contracts/scripts/deploy-entry.ts
```

Alternatif dari workspace contracts dengan environment yang sudah diekspor: `pnpm --filter @verifikasi/contracts deploy:sepolia`. Script mencetak alamat, tx hash, dan blok yang benar-benar dikembalikan jaringan; tidak ada alamat fixture deployment.

4. Simpan alamat sebagai `CREDENTIAL_CONTRACT_ADDRESS` dan blok sebagai `CONTRACT_DEPLOYMENT_BLOCK`. Isi tiga private key backend. Pada Vercel, pasang konfigurasi di environment deployment, gunakan `APP_MODE=testnet`, dan deploy kedua service melalui konfigurasi root; `OCR_SERVICE_URL` berasal dari binding, bukan URL publik yang diisi manual. Pada lokal, mulai ulang web dan jalankan worker polling atau layanan HTTP sesuai `JOB_EXECUTION`. Pastikan `APP_ORIGIN` memakai origin kanonis tempat aplikasi diakses sebelum menerbitkan QR. `CHAIN_CONFIRMATIONS` minimal 2; pembacaan memakai blok `head - (confirmations - 1)` dan penerbitan yang baru ada pada tip ditandai `PENDING`.
5. Administrator membuka `/penerbit`, memilih **Hubungkan wallet** pada dialog RainbowKit, beralih ke Sepolia bila diminta, lalu menandatangani pesan masuk. Untuk koneksi HP/QR, isi `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` dari Reown Dashboard sebelum build; lihat [konfigurasi login wallet](../README.md#login-wallet-kampus). Wallet ekstensi dapat digunakan tanpa ID tersebut. Menghubungkan wallet saja belum membuat sesi login atau memberikan kewenangan. Daftarkan institusi dengan ID `bytes32` yang tetap, nama terverifikasi dari onboarding, dan status aktif melalui `setIssuer(issuerId, name, active)`. Kemudian daftarkan wallet pejabat melalui `setSigner(issuerId, wallet, true)`. Keduanya transaksi yang berbeda; mendaftarkan institusi saja belum memberi wallet kewenangan menerbitkan. ID institusi acak dapat dibuat secara lokal:

```powershell
node -e "console.log('0x' + require('node:crypto').randomBytes(32).toString('hex'))"
```

Simpan ID tersebut untuk administrasi dan rotasi berikutnya. Saat rotasi, nonaktifkan wallet lama dengan `setSigner(issuerId, oldWallet, false)` lalu aktifkan wallet baru untuk **ID institusi yang sama**. Riwayat kewenangan signer lama tetap tersimpan; menonaktifkan wallet lama tidak mencabut seluruh kredensial historis. Status kampus diubah melalui `setIssuer`, sedangkan pencabutan kredensial memakai `revoke(credentialId)` oleh signer kampus yang masih berwenang.

6. Kampus masuk dengan wallet terdaftar dan mengikuti **Isi data → Tinjau data publik → Sahkan kredensial → Kirim penerbitan → Unduh ijazah**. Untuk pengujian pertama gunakan nama `ANDI PRATAMA`, nomor `CONTOH/2026/0042`, program `INFORMATIKA`, tanggal `2026-08-15`. Profil publik memuat nama, nomor ijazah, program studi, dan nama kampus; tanggal lulus tetap privat. Atribut dienkripsi sekali sebelum peninjauan. Wallet mengesahkan pesan EIP-712 `CredentialAuthorization`, kemudian menyetujui transaksi `issueCredential(authorization, signature, handles, inputProof)` secara terpisah. Mengubah data atau handle memerlukan persiapan dan pengesahan baru.

Payload dan signature disimpan sebagai bukti persisten sebelum transaksi dikirim. QR baru tersedia setelah konfirmasi yang disyaratkan dan pemeriksaan bukti terhadap kontrak berhasil. Jika pengiriman sudah menghasilkan tx hash lalu penantian konfirmasi gagal, gunakan pemeriksaan konfirmasi pada portal; jangan menerbitkan ulang hanya karena UI belum menerima receipt. Deadline 15 menit membatasi pengajuan baru, bukan masa berlaku kredensial yang sudah diterbitkan.
7. Buat fixture baru memakai credential ID hasil transaksi:

```powershell
uv run --project apps/worker python -m ocr_worker.fixtures --credential-id 0xID_HASIL_PENERBITAN --origin https://DOMAIN_APLIKASI
```

Gunakan nilai yang sama dengan `APP_ORIGIN`; untuk lokal nilainya `http://localhost:3000`. Fixture dengan origin atau credential ID yang berbeda tidak mewakili penerbitan yang sedang diuji.

8. Pindai QR memakai kamera HP atau buka URL `/c/{credentialId}`. Halaman harus langsung memverifikasi signature, hash snapshot publik, ikatan on-chain, kewenangan historis, serta status terkini. Hasil `VERIFIED_RECORD` bercakupan `RECORD_ONLY`, `documentDecision: null`, tanpa unggahan, login, wallet pemeriksa, OCR, atau transaksi baru. Matikan worker OCR dan hapus konfigurasi private key relayer dari lingkungan uji pembacaan terpisah: QR tetap dapat diperiksa selama database bukti dan RPC tersedia. QR Andi pada dokumen Budi tetap menampilkan rekaman Andi; belum ada klaim bahwa isi kertas cocok.
9. Pilih **Periksa dokumen lebih lanjut**, unggah fixture PDF dan scan, lalu pastikan keputusan berasal dari FHE. Catat tx hash penerbitan dan pencocokan secara terpisah, blok pembacaan status, hasil per field, serta laporan PDF bercakupan `CHECKED_ATTRIBUTES`. Jalankan setiap perubahan field, QR tertukar, identitas tujuan tidak cocok, dan kualitas OCR rendah. Rekaman `INVALID_PROOF`, `PENDING`, atau `ISSUER_INACTIVE` tidak boleh menghasilkan transaksi pencocokan baru atau `MATCH`.
10. Cabut melalui portal; kedua jalur verifikasi ulang harus menunjukkan dicabut. Uji pencabutan/deaktivasi selama pekerjaan berjalan, perubahan snapshot/signature tersimpan setelah submit FHE, rotasi wallet setelah penerbitan, serta pembacaan setelah deadline pengajuan. Empat hasil FHE yang cocok tidak boleh mengalahkan status rekaman akhir yang tidak valid. Uji akses dekripsi referensi tanpa ACL. Setelah menghapus unggahan atau melewati TTL pekerjaan, profil publik dan bukti penerbitan harus tetap dapat dibaca. Catat hasil aktual dalam `docs/acceptance.md`.

## Beralih dari kontrak sebelum v1.2

Kontrak lama dengan `issue(bytes32, handles, proof)` dan registry berdasarkan alamat wallet tidak kompatibel dengan ABI baru. Kontrak ini bukan proxy yang dapat di-upgrade. Deploy kontrak v1.2 baru, bangun ulang ABI melalui `pnpm --filter @verifikasi/contracts build`, jalankan migrasi database, ubah alamat/blok deployment, lalu daftarkan institusi dan signer pada kontrak baru.

Tidak ada migrasi otomatis yang menjadikan kredensial lama bertanda tangan EIP-712. Bukti e-sign harus dibuat melalui tindakan pejabat, terikat ke kontrak baru, dan dicocokkan dengan penerbitan yang baru. Untuk menerbitkan ulang, buat ID acak baru dan ganti QR dokumen dengan URL hasil penerbitan baru. Pertahankan arsip deployment/data lama sesuai kebutuhan; migrasi database tidak menghapusnya atau mengarang signature historis. QR lama yang diarahkan ke aplikasi dengan konfigurasi kontrak baru tidak otomatis menunjuk rekaman resmi pada kontrak baru.

Pada hosting Vercel, uji pula dispatch yang gagal lalu dipulihkan, pengunggahan ulang yang idempoten, pekerjaan yang dihapus ketika OCR/chain masih berjalan, dan cron maintenance. Periksa bahwa hasil OCR dan transaksi bertanda tangan tetap berada di Blob privat, bukan argumen/output langkah Workflow atau log.

Pencocokan memiliki biaya test ETH dan akses layanan Zama. Gangguan RPC, kuota SDK, wallet tanpa dana, atau dekripsi ditampilkan sebagai menunggu/retry/ERROR, tidak diubah menjadi MATCH. RPC dibatasi 20 detik dan operasi proof/dekripsi 60 detik per panggilan. Pengujian lokal terhadap Docker, PostgreSQL, dan mock tidak membuktikan koneksi Supabase/Blob atau alur chain pada Vercel. Belum ada deployment cloud atau transaksi testnet yang dilakukan dalam sesi perubahan ini.
