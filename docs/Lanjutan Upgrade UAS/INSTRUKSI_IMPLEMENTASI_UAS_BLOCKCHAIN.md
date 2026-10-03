# Instruksi penyempurnaan aplikasi Verifikasi Ijazah untuk UAS Blockchain

## 1 Tujuan dan batas pengerjaan

Kerjakan penyempurnaan aplikasi fullstack Verifikasi Ijazah yang sudah ada di repositori sampai implementasi, pengujian, remediasi keamanan, dan integrasinya dapat dibuktikan sesuai pedoman UAS Blockchain Universitas Siliwangi TA 2026/2027 Ganjil. Pertahankan use case sebelum UTS. Tugas ini merupakan instruksi implementasi yang harus dijalankan, sehingga pekerjaan tidak berhenti pada audit, rencana, atau daftar saran.

Penulis laporan tugas adalah ChatGPT dalam percakapan pengguna ini, setelah aplikasi selesai. Agent yang bekerja di repositori hanya bertugas menyempurnakan aplikasi, menjalankan pengujian dan audit teknis, memperbaiki temuan, serta mengumpulkan data dan bukti. Agent tidak bertugas menulis laporan tugas, termasuk draf laporan dalam Markdown.

| Pelaksana | Tanggung jawab |
| --- | --- |
| Agent di repositori | Kode fullstack, pengujian, audit teknis dan remediasi, deployment uji, README operasional, catatan faktual, data pengukuran, screenshot, serta arsip bukti. |
| ChatGPT dalam percakapan pengguna | Mengolah bahan dari agent menjadi laporan tugas sesuai bagian UAS template dosen, termasuk penulisan akademik, pembahasan, evaluasi enterprise, kesimpulan, dan dokumen audit formal. Slide final juga menunggu permintaan pengguna di percakapan ini. |

Jangan membuat `Laporan_UAS_Blockchain.docx`, `Laporan_UAS_Blockchain.pdf`, `Security_Audit.pdf`, laporan evaluasi nonfungsional 2 sampai 3 halaman, atau draf akademik penggantinya dalam format lain. Jangan mengisi template, menulis bab laporan, ringkasan akademik, landasan teori, pembahasan akhir, kesimpulan akademik, atau literature review. Pemetaan template pada bagian 12 hanya menunjukkan data yang harus dikumpulkan untuk ChatGPT.

Audit teknis dan penjelasan hasil tes tetap wajib dilakukan agar perbaikan dapat dibuktikan. Hasilnya berupa catatan temuan, risiko, perubahan, retest, dan bukti yang terstruktur. Larangan penulisan laporan tugas tidak berlaku pada fitur aplikasi yang menghasilkan PDF ijazah atau PDF hasil verifikasi, sehingga kedua fitur tersebut tetap harus dikerjakan dan diuji. Rekaman demonstrasi nyata boleh dikumpulkan sebagai evidence dan calon video cadangan.

Semua kewajiban PDF tetap dipetakan dalam dokumen ini, termasuk kewajiban yang hasil akhirnya disusun kemudian. Status aplikasi siap, bahan laporan siap, dan paket pengumpulan UAS lengkap harus dinilai secara terpisah. Jangan menyatakan seluruh tugas UAS selesai ketika laporan, slide, atau video cadangan wajib masih belum tersedia.

Gunakan TypeScript sebagai bahasa utama aplikasi serta React dan Next.js yang sudah dipakai. Solidity tetap digunakan untuk smart contract. Pertahankan pola monorepo, package manager, framework, dan alur produk yang telah berjalan. Ganti teknologi hanya jika ditemukan hambatan nyata yang tidak dapat diselesaikan dengan perubahan yang lebih kecil, lalu catat bukti hambatan, dampak migrasi, dan hasil verifikasinya.

## 2 Acuan dan cara menafsirkan persyaratan

### 2.1 Sumber yang harus digunakan

| Sumber | Fungsi |
| --- | --- |
| `Soal_UAS_Blockchain_TA_2026_2027_Ganjil(2).pdf` atau salinan setara di repositori | Sumber utama kewajiban, luaran, bobot, dan ketentuan akademik. Dokumen berisi 6 halaman. |
| `LAPORAN_KEKURANGAN_APLIKASI_UAS_BLOCKCHAIN.md` | Peta awal kondisi repo dan kandidat pekerjaan. Setiap klaim kode, deployment, dan pengujian harus dicocokkan dengan kondisi saat pengerjaan. |
| `Template_Laporan_Kegiatan_Blockchain_2026_2027 (2).docx` | Acuan struktur laporan nanti. Pilih bagian UAS beserta bagian umum yang relevan. Pemetaan lengkapnya tersedia pada bagian 12 instruksi ini. |
| Kode, manifest, lockfile, tes, konfigurasi tanpa rahasia, dan dokumentasi repositori | Bukti implementasi aktual dan aturan teknis proyek. |

Cari berkas dengan `rg --files` dan pencarian nama yang toleran terhadap spasi, nomor salinan, serta perbedaan folder. Jangan mengasumsikan path pada laporan masih sama. Baca `AGENTS.md`, `CLAUDE.md`, PRD, dan aturan repositori yang berlaku. Perubahan kebutuhan pengguna yang eksplisit serta pedoman UAS menjadi acuan ketika dokumentasi proyek lama sudah tertinggal.

Jika template DOCX tidak disalin ke repo, gunakan pemetaan pada bagian 12 untuk menyiapkan data. Ketiadaan template tersebut tidak menghalangi implementasi aplikasi. Jika PDF atau laporan kekurangan tidak ditemukan, gunakan persyaratan terperinci yang sudah disalin secara substantif di sini untuk melanjutkan pekerjaan yang jelas, lalu catat kebutuhan pemeriksaan sumber tersebut tanpa mengklaim telah membacanya.

Identitas sumber yang dipakai untuk menyusun instruksi ini:

| Berkas | SHA-256 |
| --- | --- |
| PDF pedoman | `e865f7fcdc406a3ac5b8c4114077106ffb0d98c546b6dce1801a0a58823fd07e` |
| Template DOCX | `645ed5caaabea7e2dfb03ef233cd6dd69cd51e43fbf6e416802f0b8a1a7a5ea1` |
| Laporan kekurangan | `0efb0b16843f3e7a83decd37903ea77ff67265ff08ad01edfafa3e52a9159e2f` |

Hash membantu mengenali revisi. Perbedaan hash tidak otomatis berarti isi salah. Jika sumber berubah, baca perbedaannya sebelum mengubah cakupan.

### 2.2 Klasifikasi pekerjaan

Pisahkan tiga dasar pekerjaan pada matriks kepatuhan:

1. `WAJIB_PDF`, yaitu kewajiban yang dinyatakan pada soal, misalnya pengujian kasus batas, audit, perbaikan temuan valid, dan bukti deployment.
2. `IMPLEMENTASI_PROYEK`, yaitu keputusan teknis untuk memenuhi kebutuhan aplikasi atau menangani risiko yang terbukti. Contohnya pemisahan kunci layanan, skrip rotasi peran, pengaman biaya relayer, dan tautan transaksi pada UI.
3. `OPSIONAL`, yaitu pengembangan yang tidak diperlukan untuk menutup kewajiban atau temuan valid pada lingkup ini.

PDF tidak menetapkan kewajiban membuat multisig, timelock, pause, proxy upgradeable, portal lulusan, token, NFT, implementasi Fabric, enum buatan sendiri, maupun modifier dan interface buatan sendiri. Jangan menambahkannya untuk mengejar jumlah fitur. Fitur Solidity pada B.5 digunakan sesuai kebutuhan proyek. PDF juga tidak menentukan jumlah minimal tes, persentase coverage minimum, atau durasi video tertentu.

### 2.3 Koreksi yang wajib diterapkan pada laporan awal

| Pernyataan awal | Perlakuan yang benar saat implementasi |
| --- | --- |
| Semua role dan signer berada pada satu alamat, sehingga private key pasti tersimpan di hosting | Verifikasi pemegang role melalui chain. Lokasi penyimpanan kunci merupakan temuan terpisah dan harus didukung pemeriksaan konfigurasi yang aman. Jangan menyimpulkannya hanya dari transaksi. |
| `ECDSA.recover` harus diganti karena error OpenZeppelin adalah masalah keamanan | Bedakan penolakan signature yang sudah benar dari ketidakkonsistenan error aplikasi. Perubahan ke `tryRecover` merupakan perbaikan diagnostik kecuali ada dampak keamanan yang dibuktikan. |
| Tiga skenario FHE semuanya harus memiliki tx hash | Skenario yang ditolak sebelum pengiriman transaksi harus membuktikan tidak ada transaksi baru. Bukti penolakan tersebut tetap sah. |
| QR kredensial lain selalu berarti `INCONCLUSIVE` | Periksa apakah ID tujuan telah ditetapkan. QR yang melanggar binding tujuan ditolak sebelum transaksi. QR valid yang memilih rekaman lain dapat menghasilkan `MISMATCH` terhadap atribut OCR. |
| Seluruh E2E wallet lulus atau CI pasti gagal | Catat hasil per suite dan eksekusi aktual. Laporan awal mencatat 19 E2E lulus dan 3 gagal. Status CI jarak jauh tidak boleh disimpulkan tanpa bukti run. |
| Sepolia merupakan jaringan permissionless tanpa pembatasan validator | Jelaskan bahwa Sepolia adalah testnet publik dengan validator berizin. Bedakan karakteristiknya dari Ethereum mainnet ketika menyusun evaluasi arsitektur. |
| Dependensi aman karena tidak tercantum pada denylist | Nyatakan ruang lingkup pemeriksaan denylist. Jangan mengubah hasil tersebut menjadi jaminan keamanan seluruh dependensi. |
| Satu commit kontrak membuktikan tidak pernah ada perbaikan | Nyatakan bahwa bukti perubahan sebelum dan sesudah belum ditemukan dalam riwayat yang diperiksa. Jangan membuat klaim sejarah di luar bukti. |
| Semua rekomendasi berlabel P0 merupakan kewajiban eksplisit dosen | Nilai ulang prioritas berdasarkan kewajiban PDF, dampak, bukti, dan ketergantungan. Temuan informasional tidak otomatis menjadi penghambat demo. |

## 3 Pemeriksaan awal dan cara bekerja

Laporan awal mengacu pada commit `efa663b690ac12a2cbe8b1dffa29b5a9cdf22add`, dengan 353 tes unit dan kontrak lulus yang mencakup 12 tes kontrak menggunakan FHEVM mock. Angka itu adalah baseline historis, bukan hasil yang boleh disalin sebagai hasil akhir. Laporan juga menyebut 7 penerbitan, 4 transaksi pencocokan, dan belum ada event pencabutan pada deployment yang diperiksa.

1. Periksa branch, HEAD, perubahan kerja, manifest, lockfile, jaringan, dan struktur repo. Jangan melakukan reset, menghapus berkas pengguna, mengganti riwayat, atau memaksa checkout. Jika diperlukan, gunakan worktree yang tidak mengganggu pekerjaan pengguna.
2. Catat commit awal sebelum mengubah kode. Jalankan pemeriksaan dasar dan simpan exit code sebenarnya. Jika perbaikan tes E2E diperlukan sebelum audit, catat commit perbaikan tes dan tetapkan baseline audit setelahnya. Jangan menggabungkan hasil dari dua commit menjadi satu baseline tanpa penjelasan.
3. Periksa fitur aktual pada `/penerbit`, `/c/{credentialId}`, `/verifikasi`, `/riwayat`, dan `/panduan`, beserta kontrak, chain adapter, OCR, penyimpanan, database, dan eksekusi latarnya.
4. Buat matriks kepatuhan yang menghubungkan setiap butir bagian 4 dengan kode, pengujian, bukti, status, serta lokasi bahan laporan. Perbarui matriks sepanjang pengerjaan.
5. Jalankan pekerjaan yang jelas tanpa menanyakan ulang apakah pengguna ingin audit, implementasi, atau laporan. Pilihan sudah ditetapkan, yaitu implementasi dan pengumpulan bahan laporan.
6. Pilih hosting uji yang sudah aktif dan dapat direproduksi sebagai default. Menurut laporan awal, Netlify adalah hosting aktual dan dokumentasi lama masih menyebut Vercel. Verifikasi kondisi sekarang, lalu selaraskan dokumentasi. Jangan memindahkan hosting semata-mata untuk menyamakan dokumen lama.
7. Gunakan akun khusus pengujian dan local chain atau testnet yang diizinkan. Jangan menggunakan mainnet, aset nyata, private key utama, atau seed phrase pribadi. Jangan mencetak rahasia, menaruhnya dalam evidence, atau mengirimnya ke layanan luar.
8. Jika kredensial, tanda tangan wallet, izin jaringan, atau layanan eksternal benar-benar menghalangi langkah tertentu, selesaikan semua bagian yang tidak bergantung padanya terlebih dahulu. Sampaikan satu daftar kebutuhan minimum beserta langkah yang tertahan. Jangan menandai pekerjaan tertahan sebagai lulus.
9. Pengujian serangan dilakukan hanya pada fixture, akun, kontrak, dan lingkungan milik proyek yang disediakan untuk uji. Jangan menguras faucet, menguji beban pada RPC publik, atau mencabut kredensial pengguna untuk menghasilkan evidence.
10. Ikuti izin kerja repo untuk commit dan deployment. Simpan perubahan yang dapat ditelusuri melalui commit yang sah atau diff beserta identitas baseline. Jangan mengarang penulis, kontribusi, persetujuan dosen, maupun status CI.

## 4 Matriks seluruh kewajiban pedoman PDF

Nomor butir B sampai F mengikuti soal. Penanda A dan J pada instruksi ini adalah label kerja untuk klausul terkait. Luaran G dipetakan tersendiri pada bagian 13.

### 4.1 Skenario dan Project 1

| Butir dan halaman | Kewajiban | Hasil yang disiapkan pada tahap ini |
| --- | --- | --- |
| A, halaman 1 | Gunakan use case sebelum UTS yang disetujui atau pengganti yang ditetapkan dosen. | Pertahankan Verifikasi Ijazah. Catat dasar pemilihan yang benar tanpa mengarang persetujuan. |
| A, halaman 1 | Solusi dapat diuji, diaudit, didemonstrasikan, direproduksi, serta dipertanggungjawabkan. | Implementasi berfungsi, bukti, keputusan desain, dan evaluasi yang saling sesuai. |
| A dan J, halaman 1 dan 6 | Gunakan local blockchain atau test network serta akun pengujian. | Pemeriksaan chain ID, akun uji, dan pengamanan konfigurasi. |
| B.1, halaman 2 | Tentukan aktor, aset atau data, transaksi, dan kebutuhan trust. | Inventaris aktor, data, alur, serta batas kepercayaan aktual. |
| B.2, halaman 2 | Diagram frontend, wallet/provider, smart contract, jaringan, serta off-chain. | Diagram arsitektur dan diagram alur transaksi yang sesuai implementasi final. |
| B.3, halaman 2 | Tentukan data on-chain dan off-chain beserta alasannya. | Tabel data, lokasi, sifat publik atau privat, akses, retensi, dan alasan. |
| B.4, halaman 2 | Rancang role, kontrol akses, dan aturan bisnis kontrak. | Matriks akses, implementasi yang sesuai, dan tes penolakan akses. |
| B.5, halaman 2 | Gunakan fitur Solidity yang relevan sesuai kebutuhan. | Pemetaan function, visibility, struktur data, modifier, event, inheritance, interface, library, error, dan akses yang benar-benar digunakan. |
| B.6, halaman 2 | Jelaskan keputusan desain dan trade-off. | Catatan alasan EIP-712, FHE, trust pada backend, penyimpanan, dan pilihan deployment. |
| Luaran B, halaman 2 | Diagram arsitektur dan alur, kontrak dapat dikompilasi, dokumen desain singkat. | Sumber diagram beserta PNG atau PDF, build kontrak, dan dokumentasi desain teknis. |

### 4.2 Project 2

| Butir dan halaman | Kewajiban | Hasil yang disiapkan pada tahap ini |
| --- | --- | --- |
| C.1, halaman 2 | Unit test positif, negatif, batas, dan kontrol akses. | Tes bermakna untuk kontrak dan integrasi terkait, dengan hasil aktual. |
| C.2, halaman 2 | Compile dan debugging sekurang-kurangnya satu kegagalan atau kondisi tidak valid. | Satu kasus nyata yang dapat direproduksi, penyebab, perbaikan kode atau input, serta verifikasi ulang. |
| C.3, halaman 2 | Deployment ke local chain atau testnet yang diizinkan. | Kontrak final pada jaringan uji, dengan identitas build dan receipt. |
| C.4, halaman 2 | Catat alamat, jaringan, hash transaksi relevan, dan reproduksi deployment. | Deployment record yang lengkap dan skrip atau langkah yang dapat diulang. |
| C.5, halaman 2 | Integrasikan frontend/client, wallet/provider, dan kontrak. | Alur frontend serta backend yang berinteraksi dengan kontrak final. |
| C.6, halaman 2 | Demonstrasikan sekurang-kurangnya satu event atau perubahan state yang dapat diverifikasi. | Receipt, event, dan pembacaan state yang cocok dengan transaksi demo. |
| Luaran C, halaman 2 | Folder tes dan hasil, deployment record, frontend/client atau script integrasi, README reproduksi. | Semua artefak teknis tersebut tersedia dan menunjuk versi yang diuji. |
| OBE C, halaman 3 | Cakupan compile, debugging, test coverage, test network, dan integrasi. | Pengukuran coverage aktual dengan metode, cakupan file, dan pengecualian yang dijelaskan. |

### 4.3 Project 3

| Butir dan halaman | Kewajiban | Hasil yang disiapkan pada tahap ini |
| --- | --- | --- |
| D pengantar, halaman 3 | Audit kontrak sendiri, peer audit bila ditetapkan dosen. | Audit internal selalu dikerjakan. Peer audit hanya dijalankan jika ada penetapan dan kontrak target yang sah. |
| D.1, halaman 3 | Threat model aset, aktor, trust boundary, penyalahgunaan. | Threat model spesifik aplikasi final. |
| D.2, halaman 3 | Reentrancy, access control, ordering, oracle, DoS, validasi input, error handling sesuai relevansi. | Ketujuh aspek diperiksa, masing-masing disertai bukti dan argumentasi. |
| D.3, halaman 3 | Klasifikasi dampak dan kemungkinan secara argumentatif. | Temuan dengan tingkat risiko yang sebanding dengan skenario eksploitasi. |
| D.4, halaman 3 | Perbaiki temuan valid dan jelaskan perubahan kode. | Remediasi yang ditautkan ke temuan dan perubahan aktual. |
| D.5, halaman 3 | Tambah atau perbarui unit test pembuktian perbaikan. | Tes regresi beserta bukti kegagalan pada baseline bila dapat direproduksi dan keberhasilan setelah perbaikan. |
| D.6, halaman 3 | Tabel temuan, bukti, risiko, mitigasi, status verifikasi. | Tabel audit lengkap yang membedakan kode, konfigurasi, dan risiko desain. |
| Luaran D, halaman 3 | Audit, versi sebelum/sesudah atau commit, serta tes remediasi. | Catatan temuan teknis dan evidence diserahkan kepada ChatGPT untuk penulisan laporan audit formal. |

### 4.4 Project 4

| Butir dan halaman | Kewajiban | Hasil yang disiapkan pada tahap ini |
| --- | --- | --- |
| E.1, halaman 3 | Bandingkan Ethereum/public dengan Fabric atau permissioned pada identitas, permissioning, konsensus, privasi, throughput, governance, biaya. | Agent mencatat fakta implementasi pada tujuh aspek. ChatGPT menyusun perbandingan dan pembahasannya nanti. Tidak memerlukan aplikasi Fabric kedua. |
| E.2, halaman 3 | Evaluasi skalabilitas, interoperabilitas, dan bottleneck. | Data gas, waktu proses, dependensi, format integrasi, kontensi, dan hasil diagnosis teknis untuk evaluasi oleh ChatGPT. |
| E.3, halaman 3 | Evaluasi privasi dan data yang tidak seharusnya terbuka di chain. | Peta data dan akses pada chain, API, OCR, database, blob, log, serta metadata. |
| E.4, halaman 3 | Tata kelola perubahan kontrak, node, role, upgrade, sengketa. | Prosedur tanggung jawab, perubahan, rotasi, pemulihan, migrasi, dan sengketa. |
| E.5, halaman 3 | Tentukan kapan public, permissioned, atau database lebih tepat. | Agent mencatat kebutuhan trust dan kondisi operasional aktual. ChatGPT menyusun rekomendasi arsitektur akhir. |
| Luaran E, halaman 3 dan 4 | Matriks, evaluasi nonfungsional 2 sampai 3 halaman, rekomendasi akhir. | Agent menyerahkan data dan bukti. Seluruh penulisan evaluasi dilakukan oleh ChatGPT pada tahap laporan. |

### 4.5 Project 5 serta ketentuan akademik

| Butir dan halaman | Kewajiban | Hasil yang disiapkan pada tahap ini |
| --- | --- | --- |
| F.1, halaman 4 | Masalah, stakeholder, alasan blockchain, kriteria keberhasilan. | Bahan faktual demo dan pengantar laporan. |
| F.2, halaman 4 | Demo end-to-end wallet/client, pemanggilan kontrak, transaksi, event/state, verifikasi hasil. | Skenario yang dijalankan, rekaman hasil, dan bukti transaksi final. |
| F.3, halaman 4 | Tampilkan tes, deployment, audit, perbaikan, keterbatasan yang masih ada. | Ringkasan hasil dan batas validitas yang didukung bukti. |
| F.4, halaman 4 | Etika, regulasi, risiko, keberlanjutan, dampak dunia nyata. | Fakta data pribadi yang diproses, kontrol akses, retensi, dependensi, biaya, dan kegagalan untuk pembahasan oleh ChatGPT. |
| F.5, halaman 4 | Semua anggota memahami sistem serta menjelaskan kontribusi dari commit/dokumen. | Riwayat kontribusi nyata dan catatan perilaku sistem untuk bahan defense yang disusun kemudian. Tidak ada kontribusi fiktif. |
| F.6, halaman 4 | Roadmap realistis. | Pekerjaan lanjutan beralasan beserta manfaat dan ketergantungan. |
| Luaran F, halaman 4 | Maksimal 10 slide, demo atau video cadangan, laporan akhir, repo final. | Demo dan repo disiapkan sekarang. Bahan slide dan laporan disiapkan untuk tahap berikutnya. |
| H dan I, halaman 5 dan 6 | Bobot P1 20, P2 20, P3 25, P4 15, P5 20. | Gunakan sebagai prioritas kualitas. Jangan mengarang skor atau persentase kepatuhan sebagai jaminan nilai. |
| J.1 dan J.2, halaman 6 | Jaringan dan akun uji, tanpa rahasia dalam repo. | Konfigurasi aman, chain guard, dan evidence yang disanitasi. |
| J.3 dan J.4, halaman 6 | Evidence dapat ditelusuri, kualitas lebih penting daripada jumlah screenshot. | Index bukti dengan hubungan ke commit, log, transaksi, hasil observasi, dan interpretasi. |
| J.5, halaman 6 | Tanpa plagiarisme, kontribusi palsu, atau manipulasi evidence. | Atribusi library dan kode pihak lain, hasil asli, serta jejak kontribusi sah. |
| J.6 dan J.7, halaman 6 | Pemahaman seluruh sistem dan cadangan saat demo gagal. | Bahan defense serta video atau bahan perekaman ulang yang jelas statusnya. |

Bagian K adalah pengesahan dokumen soal. Jangan membuat tanda tangan, stempel, atau klaim pengesahan baru atas nama dosen.

## 5 Perilaku aplikasi yang harus dipertahankan

Verifikasi aturan berikut pada kode saat ini sebelum mengubahnya. Jika ditemukan perilaku yang berbeda, telusuri penyebabnya dan gunakan kebutuhan produk yang sah sebagai dasar, lalu dokumentasikan keputusan tersebut.

1. Halaman QR `/c/{credentialId}` dapat dibuka tanpa login, wallet, unggahan, OCR, atau transaksi baru. Cakupannya tetap `RECORD_ONLY` dan `documentDecision` tetap `null`.
2. Verifikasi rekaman berbeda dari pencocokan atribut dokumen. UI harus menjelaskan cakupan hasil. Jangan memberi label keaslian seluruh dokumen hanya karena QR menunjuk rekaman yang valid.
3. `VERIFIED_RECORD` mensyaratkan pembacaan chain, bukti penerbitan, signature, binding, dan kewenangan historis yang valid. Jangan menampilkan profil seolah terverifikasi ketika status `INVALID_PROOF`, `PENDING`, atau `ERROR`.
4. `MATCH` hanya muncul setelah rekaman aktif terverifikasi, OCR memenuhi syarat, dan hasil FHE empat atribut cocok. Baca ulang status setelah dekripsi agar pencabutan atau penonaktifan institusi selama proses tidak menghasilkan sukses palsu.
5. Empat atribut yang dibandingkan adalah nama, nomor ijazah, program studi, dan tanggal lulus dengan aturan normalisasi serta encoding yang konsisten. Perubahan algoritma harus memiliki versi dan strategi kompatibilitas yang jelas.
6. Penerbitan tetap memerlukan signature payload EIP-712. Domain chain ID dan alamat kontrak berasal dari konfigurasi tepercaya, tidak diambil sebagai otoritas dari QR atau payload pengguna.
7. Nonce, request ID, deadline, binding ciphertext, dan perlindungan replay harus tetap berlaku. Deadline pengajuan tidak membatalkan kredensial yang sudah diterbitkan.
8. Rotasi signer mempertahankan validitas historis penerbitan. Pencabutan kredensial adalah transisi bisnis tersendiri dan tidak boleh digantikan dengan penghapusan riwayat signer.
9. Jangan menaruh plaintext atribut privat atau digest referensi privat yang memungkinkan penebakan langsung dalam calldata, event, storage publik, atau log. Hash pengikat profil publik dan digest otorisasi yang memang bagian protokol boleh tetap tersedia, dengan penjelasan fungsi yang tepat.
10. Tanggal lulus tetap tidak muncul pada profil publik, QR, respons publik, atau payload otorisasi publik. PDF privat dan OCR memproses nilai tersebut sesuai hak akses serta retensi yang ditetapkan.
11. Jangan memakai `makePubliclyDecryptable` atau membuka hasil FHE kepada pihak yang tidak berwenang. Akses reader pada hasil dan akses terhadap referensi harus dipisahkan.
12. Gangguan RPC, Zama, database, atau bukti off-chain harus menghasilkan status gagal atau menunggu yang tepat. `NOT_FOUND` hanya digunakan setelah pembacaan yang berhasil memastikan rekaman tidak ada.
13. Outbox menyimpan transaksi bertanda tangan sebelum broadcast dan menggunakannya kembali saat retry yang sesuai. Timeout bukan alasan untuk langsung membuat transaksi kedua.
14. Penghapusan dan retensi harus menjaga tombstone agar proses terlambat tidak menghidupkan kembali artefak. TTL unggahan tidak boleh menghapus bukti penerbitan yang masih diperlukan untuk verifikasi.
15. Pertahankan alur PDF penerbit terbaru tanpa pemeriksaan OCR/FHE sebagai syarat penerbitan PDF, kecuali ada perubahan kebutuhan yang eksplisit. Unggahan pemeriksa tetap melalui OCR dan FHE.
16. Pertahankan batas ukuran, halaman, MIME, parser, confidence, dan format template OCR yang sah. Jangan menurunkan ambang hanya agar demo lulus. Fixture yang dipakai harus sesuai dukungan aktual.
17. Mode demo dan mock diberi penjelasan yang jelas. Hasil mock tidak boleh dipresentasikan sebagai eksekusi FHE nyata atau transaksi testnet.
18. Pertahankan satu lockfile, dependensi workspace, gaya UI, bahasa antarmuka, dan struktur paket. Perubahan backend harus terhubung ke frontend sampai hasilnya dapat digunakan.

## 6 Pekerjaan implementasi

Lokasi di bawah berasal dari laporan awal dan berfungsi sebagai petunjuk. Periksa simbol serta alur pemanggilan aktual, jangan bergantung pada nomor baris. Prioritas pertama adalah perilaku produk, kontrol keamanan yang valid, dan bukti yang diwajibkan PDF.

### 6.1 Perbarui E2E penerbitan PDF

Periksa `apps/web/tests/e2e/wallet.spec.ts`, `CredentialDocument.tsx`, endpoint dokumen, dan mock API terkait. Laporan awal menyebut label tanggal berubah menjadi `Tanggal lulus sesuai data penerbitan`, fase `Memeriksa dokumen` dihapus, dan fixture masih menggunakan status `VERIFYING`.

Sesuaikan tes dengan alur aktual, termasuk kondisi tanggal sudah dibekukan dan kondisi tanggal perlu diberikan. Periksa bahwa data penerbitan, pengesahan, transaksi, dan PDF yang diterima memang benar. Pertahankan pengujian tampilan pada ukuran viewport yang sudah dipakai. Jangan membuat produksi kembali ke alur lama hanya agar selector lama cocok, menghapus tes bermakna, menambah timeout tanpa diagnosis, atau mengganti assertion menjadi pemeriksaan halaman terbuka saja.

Penerimaan: seluruh skenario tersebut lulus karena alur berhasil, perubahan tes dapat dijelaskan, dan tidak ada tahap OCR penerbitan PDF yang ditambahkan tanpa kebutuhan.

### 6.2 Pisahkan kewenangan admin, signer, dan layanan

Dasar: B.4 dan audit D.2 sampai D.5, dengan pilihan mitigasi khusus proyek. Empat alamat role terpisah dan signer terpisah adalah kebijakan yang dipilih untuk mengurangi dampak kebocoran, bukan angka yang diperintahkan PDF.

Periksa `contracts/src/VerifikasiIjazah.sol`, skrip deployment, `packages/chain/src/server.ts`, `shared.ts`, serta konfigurasi server. Baca pemegang role melalui `hasRole` dan riwayat event dari deployment block. `AccessControl` biasa tidak menyediakan enumerasi seluruh anggota secara otomatis, sehingga jangan mengandalkan fungsi enumerasi yang tidak ada.

Implementasikan pekerjaan berikut:

1. Sediakan tooling yang dapat membaca role, memberi role, mencabut role, dan memindahkan admin. Mode awal hanya membaca. Operasi tulis memiliki parameter eksplisit, pemeriksaan chain ID, tujuan, dan receipt. Gunakan pola skrip yang kompatibel dengan repo, dengan TypeScript untuk logika baru jika didukung.
2. Validasi alamat hasil derivasi konfigurasi layanan tanpa mencetak private key. Tolak kunci duplikat berdasarkan kebijakan proyek dan cegah layanan menggunakan alamat yang memiliki kewenangan admin atau signer aktif. Bedakan validasi lokal alamat dari pemeriksaan role yang membutuhkan RPC.
3. Periksa kewenangan aktual sebelum operasi sensitif. Jika pemeriksaan RPC gagal, hentikan operasi terkait dengan error konfigurasi atau jaringan yang jelas. Jangan menandai konfigurasi aman hanya karena pemeriksaan dilewati.
4. Pada deployment baru, tetapkan admin, attestor, relayer, reader, dan signer institusi sesuai pemisahan yang terdokumentasi. Jangan menaruh kunci admin atau signer pengguna pada konfigurasi layanan backend.
5. Pemindahan admin harus memberi kewenangan kepada alamat baru, memverifikasi penerima dan keberhasilan grant, kemudian mencabut atau melepaskan admin lama. Jangan meninggalkan kontrak tanpa admin karena urutan yang salah. Hindari pergantian admin nyata hanya untuk screenshot.
6. Jika pembatasan role ditegakkan on-chain, periksa kedua arah. `setSigner` harus menolak alamat layanan sesuai kebijakan dan pemberian role layanan harus memeriksa signer yang sudah ada. Periksa juga pemberian admin kepada layanan yang telah terdaftar. Uji konstruktor, grant, revoke, dan rotasi agar aturan tidak dapat dilewati melalui jalur lain.
7. Dokumentasikan bahwa tiga kunci berbeda dalam backend yang sama masih berada dalam satu batas kepercayaan operasional. Pemisahan tersebut tidak sama dengan tiga operator independen.

Penerimaan: konfigurasi salah ditolak sebelum pengiriman transaksi, role baru berfungsi, role yang dicabut gagal untuk operasi baru, dan prosedur rotasi dapat direproduksi. Jangan mengklaim pencabutan role reader menghapus seluruh izin dekripsi FHE atas ciphertext lama. Evaluasi ACL historis secara terpisah.

### 6.3 Validasi dan remediasi smart contract

Audit kontrak secara menyeluruh menggunakan bagian 9. Jangan membatasi audit pada daftar temuan awal, tetapi jangan mengarang bug untuk memenuhi tugas perbaikan.

| Kandidat | Tindakan |
| --- | --- |
| Izin referensi `FHE.allow(referenceValue, msg.sender)` | Periksa apakah signer memerlukan dekripsi referensi. Jika tidak, batasi izin tersebut dengan tetap menjaga izin kontrak yang diperlukan. Tambahkan tes negatif dekripsi referensi oleh signer dan tes positif pencocokan. Periksa perilaku `fromExternal` serta ACL pada versi FHEVM yang terpasang, bukan hanya menghapus satu baris berdasarkan asumsi. |
| Penolakan signature | Pastikan signature rusak, signer salah, domain salah, malleability, replay, dan binding tidak valid ditolak. Bila pemetaan custom error diperlukan, gunakan `tryRecover` secara benar dengan memeriksa kode error dan alamat hasil. Jangan menerima alamat nol atau signature tidak valid. |
| Validasi registry | Periksa ID nol, alamat nol, nama kosong, batas nama dalam byte, institusi belum terdaftar, dan aktivasi signer. Perbaiki validasi yang benar-benar kurang. Bedakan perbaikan validasi dari penggantian nama error. |
| Pemanggilan idempoten `setSigner` | Tentukan perilaku yang konsisten. Operasi tanpa perubahan dapat mengembalikan hasil idempoten yang jelas atau ditolak dengan error yang tepat. Jangan mewajibkan revert baru hanya untuk menghasilkan temuan. UI tidak boleh mengklaim perubahan state yang tidak terjadi. |
| Perebutan `credentialId` oleh signer lain | Reproduksi dalam pengujian lokal jika relevan. Jika nyata, tangani dengan namespace atau binding yang sesuai, atau mitigasi terukur beserta alasan risiko residual. Perubahan skema ID harus memperbarui browser, signature, QR, dan tes yang terkait. |
| Perubahan nama institusi ketika transaksi menunggu | Periksa konsistensi snapshot profil bertanda tangan dengan nama yang digunakan kontrak. Jika perubahan admin dapat membuat kredensial sah tidak dapat diverifikasi, pilih mitigasi yang menjaga konsistensi. Jika tipe EIP-712 berubah, versi domain atau skema serta migrasinya harus jelas. |

Kelompokkan perubahan menjadi commit atau diff yang menjelaskan masalah, perbaikan, dan tesnya. Bangun ulang ABI melalui perintah repo, jangan mengedit ABI hasil generate secara manual. Pertahankan pengamanan yang sudah benar.

Penerimaan: temuan valid memiliki remediasi serta retest. Temuan yang tidak terbukti, informasional, atau merupakan risiko desain dicatat dengan alasan yang sebanding. Risiko desain yang diterima harus memiliki batas penggunaan dan mitigasi yang jelas. Jangan menggunakan label risiko diterima untuk mengabaikan celah valid yang memengaruhi alur utama dan dapat diperbaiki.

### 6.4 Perkuat deployment dan kompatibilitas kredensial

Kontrak pada laporan awal tidak upgradeable. Jika kode Solidity berubah, perubahan tersebut tidak memperbarui kontrak lama. Gunakan deployment uji baru untuk demonstrasi versi final setelah tes terkait lulus.

1. Perbaiki skrip deployment agar memeriksa chain ID, alamat, dan kebijakan pemisahan peran sebelum transaksi. Gunakan compiler dan pengaturan yang dapat direproduksi dari repo.
2. Simpan record non-rahasia secara persisten. Isinya sekurang-kurangnya network, chain ID, alamat, tx deploy, blok, role, compiler, optimizer, viaIR, target EVM, versi dependensi penting, identitas source atau build, commit, dan waktu.
3. Sediakan langkah registrasi institusi serta signer yang dapat diulang dengan aman. Catat hash transaksi dan state hasilnya. Skrip tidak boleh menerbitkan data duplikat diam-diam ketika dijalankan kembali.
4. Upayakan verifikasi source pada explorer dengan pengaturan build yang tepat. Ini mendukung keterlacakan, tetapi bukan kewajiban eksplisit tambahan pada PDF. Jika layanan verifikasi terhalang, simpan build-info dan bukti pencocokan yang benar tanpa mengklaim status verified.
5. Jangan menyebut bytecode identik sepenuhnya jika ada perbedaan metadata. Periksa sumber, versi compiler, setting, library, constructor args, dan metadata sesuai metode verifikasi yang digunakan.
6. Setelah redeploy, selaraskan ABI, alamat, deployment block, domain EIP-712, jaringan wallet, worker, backend, dan hosting. Periksa konfigurasi build-time dan runtime bila keduanya dipakai. Catat commit serta identitas deployment aplikasi yang benar-benar berjalan.
7. Simpan catatan kontrak lama. Jangan menghapus bukti atau kredensial lama. Untuk rekaman versi lama, pilih dukungan pembacaan melalui daftar kontrak yang dipercaya server atau tampilkan alasan versi lama yang akurat. Jangan mempercayai alamat kontrak dari input pengguna dan jangan menyebut data lama palsu hanya karena alamat kontrak aktif berubah.
8. Gunakan kredensial sintetis baru untuk uji kontrak final. Signature lama tidak boleh dianggap berpindah ke domain baru tanpa penerbitan yang sah.

Penerimaan: deployment dapat direproduksi, aplikasi memakai kontrak final, transaksi relevan dapat diperiksa, dan perilaku kredensial lama terdokumentasi serta diuji.

### 6.5 Tampilkan jejak transaksi yang berguna

Dasar: penguatan keterlacakan C.4, C.6, dan F.2. Fitur ini dipilih untuk memudahkan demonstrasi, sementara PDF tetap mengizinkan pembuktian melalui client atau script.

Periksa `packages/chain/src/types.ts`, `shared.ts`, `packages/domain/src/schema.ts`, `apps/web/src/server/credentials.ts`, `CredentialRecord.tsx`, dan `PortalPage.tsx`.

Tampilkan hash serta tautan transaksi penerbitan, pencabutan, dan perubahan registry yang baru dilakukan. Untuk pencabutan, ambil event pada blok yang relevan, cocokkan alamat kontrak dan ID kredensial, lalu periksa receipt atau log yang sesuai. Tambahkan waktu atau nomor blok bila tersedia dan bermakna.

Bangun URL explorer dari chain ID yang dipercaya aplikasi serta tx hash yang tervalidasi. Jangan menggunakan URL arbitrer dari QR atau respons pengguna. Jika pencarian log gagal, pertahankan status pencabutan yang telah diperoleh dari state tepercaya dan tampilkan informasi transaksi sebagai tidak tersedia. Jangan mengubah `REVOKED` menjadi valid atau menampilkan hash tebakan.

Penerimaan: transaksi yang ditampilkan cocok dengan operasi aktual, tautan mengarah ke jaringan yang benar, status tetap aman ketika log gagal dibaca, dan jalur QR tetap tidak membuat transaksi baru.

### 6.6 Kendalikan penggunaan relayer dan sumber rate limit

Periksa `apps/web/src/server/http.ts`, `jobs.ts`, `pipeline.ts`, konfigurasi server, penyimpanan kuota, serta `packages/chain/src/server.ts`. Verifikasi nilai konfigurasi efektif dengan aman. Jangan menganggap `TRUST_PROXY` aktif atau mati tanpa bukti.

1. Tentukan IP atau identitas sumber dari informasi yang benar-benar ditetapkan platform. Rujuk dokumentasi resmi hosting dan uji apakah header kiriman klien ditimpa. Jangan langsung mempercayai elemen pertama `X-Forwarded-For`.
2. Hindari fallback yang membuat semua pengunjung memakai bucket sumber `local` di hosting. Hindari pula hanya memakai sesi baru sebagai pertahanan karena sesi dapat dibuat ulang. Sediakan kebijakan yang eksplisit untuk sumber tidak diketahui, pembatasan pembuatan sesi, batas per kredensial, dan anggaran global.
3. Terapkan anggaran transaksi pencocokan dengan penyimpanan persisten dan reservasi atomik. Batas harus berlaku antar-instance serverless dan aman terhadap dua pekerjaan yang berjalan bersamaan. Pemeriksaan terpisah dari pembaruan counter dapat menimbulkan race dan tidak memenuhi penerimaan.
4. Atur kapan kuota dipesan, digunakan, atau dilepas. Retry dengan request ID yang sama tidak boleh dihitung sebagai transaksi baru jika menggunakan outbox yang sama. Pembatalan sebelum broadcast dan pemulihan setelah crash harus memiliki perilaku yang diuji.
5. Periksa saldo serta estimasi biaya sebelum menandatangani atau menyiarkan transaksi baru. Hitung kebutuhan berdasarkan estimasi gas, parameter fee, dan biaya protokol relevan bila ada. Tangani perubahan biaya atau saldo setelah pemeriksaan tanpa membocorkan kunci atau kehilangan state pekerjaan.
6. Jika kuota atau saldo tidak mencukupi, hasil tidak boleh `MATCH`. Berikan status dan alasan yang sesuai skema domain. Retry yang sah tidak boleh menggandakan transaksi atau merusak pengelolaan nonce.
7. Pertahankan akses baca QR ketika layanan pencocokan dibatasi. Jelaskan bahwa kuota mengurangi laju serangan dan biaya, sedangkan serangan penebakan atribut privat masih perlu dianalisis sebagai risiko residual.

Penerimaan: kuota global tidak dapat dilewati melalui concurrency sederhana, spoofing header tidak mengubah identitas tepercaya, saldo kurang tidak menyiarkan transaksi baru, dan retry tetap idempoten. Gunakan tes lokal terkontrol untuk skenario penyalahgunaan, bukan beban serangan pada layanan publik.

### 6.7 Selesaikan integrasi penyimpanan dan proses latar

Jalankan pengujian PostgreSQL pada database lokal sekali pakai atau service pengujian CI yang sesuai aturan repo. Jangan mengganti database pengguna atau menurunkan guard yang mencegah tes destruktif terhadap host nonlokal.

Periksa migrasi, transaksi state, lease relayer, penguncian, kegagalan worker, retry, dan pemulihan outbox. Untuk jalur hosting yang dipakai, buktikan satu siklus unggah, pembacaan, hasil, penghapusan, dan retensi pada namespace uji. Pastikan akses antar-sesi tetap ditolak serta penghapusan terlambat tidak memulihkan artefak.

Satu baris JSONB dan satu lease global pada laporan awal perlu dianalisis sebagai bottleneck. Jangan melakukan refactor database besar hanya untuk membuat arsitektur terlihat lebih kompleks. Perbaiki jika ditemukan masalah kebenaran, keamanan, atau kegagalan pada beban demo yang relevan, lalu ukur pengaruhnya.

### 6.8 Selaraskan dokumentasi dengan implementasi final

Periksa README, dokumentasi testnet, acceptance, PDF ijazah, hosting, PRD, serta instruksi operasional yang masih menyebut worker Python, belum adanya transaksi, atau tahap OCR penerbitan PDF yang sudah dihapus. Perbarui bagian yang salah berdasarkan hasil aktual.

Jangan menghapus dokumentasi historis atau bukti UTS secara massal. Beri konteks versi jika dokumen perlu dipertahankan. Catat sumber desain atau kode pihak lain, lisensi yang relevan, serta penggunaan OpenZeppelin dan Zama. Periksa denylist pengguna sebelum perubahan dependensi dan gunakan versi yang kompatibel dengan lockfile. Coverage dan plugin verifikasi merupakan tambahan tooling, bukan alasan migrasi seluruh stack.

## 7 Pengujian yang harus dijalankan dan dilengkapi

### 7.1 Perintah dasar

Temukan perintah sebenarnya melalui manifest. Menurut laporan awal, repo memiliki perintah berikut:

```text
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm test:db
pnpm build
pnpm test:e2e
```

Compile kontrak secara eksplisit melalui script repo. Simpan nama perintah, direktori kerja, commit, versi tool, waktu, exit code, dan ringkasan. Jika output disalurkan ke logger, pastikan exit code perintah asli tidak tertutup oleh keberhasilan logger. Pada PowerShell dan shell lain, gunakan mekanisme exit code yang benar untuk lingkungan tersebut.

Jangan menghapus berkas pengguna yang menyebabkan pemeriksaan struktur gagal. Jika ada file kerja di luar cakupan source, tentukan pengecualian sempit atau jalankan verifikasi pada salinan bersih yang benar-benar merepresentasikan revisi final. Catat perbedaannya. Jangan melemahkan lint atau aturan struktur untuk menyembunyikan masalah source.

### 7.2 Cakupan tes kontrak

Tambahkan tes hanya untuk perilaku yang belum dibuktikan atau untuk regresi yang perlu dilindungi. Gunakan tabel berikut sebagai checklist, lalu tautkan setiap baris ke tes yang ada atau tes baru.

| Kelompok | Kasus yang diperiksa |
| --- | --- |
| Positif | Registrasi, signer aktif, penerbitan, empat field cocok, pencocokan, pembacaan, pencabutan, dan event beserta argumennya. |
| Akses | Registry tanpa admin, penerbitan dan pencabutan tanpa kewenangan, `verify` tanpa relayer, attestor salah atau dicabut, reader tanpa role, signer institusi lain, dan kombinasi role yang dilarang. |
| Signature dan binding | Payload wajib, signer berbeda dari pemanggil, signature rusak, domain chain atau kontrak salah, versi domain salah, urutan handle ditukar, hash payload dimanipulasi, serta signature malleable jika relevan. |
| Replay | Nonce penerbitan, nonce attestation, request ID, pemanggilan ulang, serta rollback ketika input proof gagal. |
| Deadline | Sebelum, tepat pada, dan sesudah deadline untuk penerbitan serta attestation, sesuai operator pembanding kontrak. Kendalikan timestamp secara deterministik. |
| Nilai nol dan versi | Alamat konstruktor nol, issuer ID nol, credential ID nol, publicDataHash nol, schema version tidak didukung, string versi encoding atau normalizer yang salah. |
| Nama institusi | Kosong, tepat batas byte, melebihi batas, serta Unicode yang panjang byte-nya berbeda dari jumlah karakter. Gunakan batas aktual setelah aturan desain ditetapkan. |
| Paginasi | Offset nol, total kosong, offset sama atau melebihi total, limit nol jika diizinkan, limit tepat maksimum, dan limit di atas maksimum. Periksa perilaku clamp atau revert yang dirancang. |
| Status bisnis | Institusi nonaktif, signer nonaktif, kredensial tidak ada, sudah dicabut, pencabutan berulang, dan penonaktifan selama verifikasi. |
| Rotasi | Signer historis tetap valid, perpindahan signer lintas institusi mengikuti aturan, admin tidak hilang, role lama ditolak untuk operasi baru, serta reader baru mendapat izin hasil baru. |
| FHE dan ACL | Perbandingan penuh 256 bit termasuk perubahan bit tinggi, perubahan tiap field, akses reader sah, penolakan reader tidak sah, dan kebijakan dekripsi referensi setelah remediasi. |
| Ordering | Perebutan ID dan perubahan nama institusi ketika transaksi menunggu, jika alur memungkinkan. Reproduksi lokal tanpa melakukan front-running pada jaringan publik. |

Tetap bedakan FHEVM mock dari FHE nyata. Tes kontrak lokal yang memang dirancang untuk mock harus mempertahankan pemeriksaan lingkungan mock dan tidak berjalan secara tidak sengaja pada jaringan publik.

### 7.3 Tes aplikasi dan integrasi

Uji keputusan domain, normalisasi, validasi QR, OCR, metadata chain, API, sesi, CSRF, otorisasi portal, rate limit, retry, kuota atomik, outbox, database, penyimpanan, dan UI yang berubah. Lindungi setidaknya kasus berikut:

1. RPC gagal tidak menjadi `NOT_FOUND` atau sukses palsu, dan bukti penerbitan hilang tidak menjadi rekaman terverifikasi.
2. QR hanya menerima origin dan format yang ditetapkan, serta tidak melakukan fetch terhadap URL arbitrer.
3. Rekaman dicabut tetap `REVOKED` ketika pencarian hash pencabutan gagal.
4. UI registry dan pencabutan menampilkan hasil transaksi aktual, termasuk pembatalan wallet dan transaksi gagal.
5. OCR confidence rendah, format tidak didukung, QR ambigu, dan file tidak layak berhenti dengan status yang tepat tanpa transaksi yang tidak diperlukan.
6. Mode demo tidak memalsukan hasil FHE nyata. Gangguan dekripsi tidak menjadi `MATCH`.
7. Akses pekerjaan atau dokumen sesi lain ditolak, penghapusan dan TTL bekerja, serta arsip penerbitan yang sah tetap tersedia sesuai hak akses.
8. Kuota yang diuji dengan request bersamaan tetap benar, pembuatan sesi baru tidak menghapus pembatasan lain, dan retry tidak membuat transaksi ganda.
9. Kunci layanan duplikat ditolak secara lokal sebelum operasi chain, sedangkan role yang salah ditolak setelah pemeriksaan chain yang berhasil.
10. Kredensial kontrak lama tidak dianggap valid pada domain baru dan mendapat penjelasan kompatibilitas yang tepat.

### 7.4 Coverage dan debugging

Ukur coverage kontrak dengan tooling yang kompatibel dengan Hardhat dan FHEVM terpasang. Verifikasi dukungan terhadap dokumentasi atau template resmi sebelum menambahkan plugin. Ukur coverage TypeScript dengan provider yang sesuai versi Vitest pada setiap workspace. Jangan mencampur versi provider atau mengecualikan file sulit hanya untuk menaikkan angka.

Laporkan statement, branch, function, dan line coverage bila tool menyediakannya, beserta konfigurasi dan file yang dikecualikan. Jika instrumentasi FHE tidak kompatibel, diagnosis dan coba solusi yang sah dalam stack yang sama. Jika tetap terhalang, simpan error serta cakupan alternatif yang benar-benar diukur, dan jangan mengklaim coverage kontrak telah selesai. Jangan mengganti FHE produksi dengan logika biasa hanya untuk menghasilkan persentase.

Untuk C.2, dokumentasikan sekurang-kurangnya satu kondisi invalid yang benar-benar dijalankan. Misalnya otorisasi kedaluwarsa atau akses tanpa role. Rekam input uji non-rahasia, perintah, error atau revert yang didekode, penyebab, perubahan input atau kode, dan hasil ulang. Kondisi invalid yang sengaja diuji tidak otomatis merupakan kerentanan aplikasi.

Untuk remediasi keamanan, utamakan tes yang mereproduksi masalah baseline dan menunjukkan perbaikan. Jika perbaikan merupakan konfigurasi deployment, sertakan bukti konfigurasi sebelum dan sesudah beserta tes otorisasi yang sesuai. Jangan membuat output kegagalan palsu atau menanam bug ke baseline.

## 8 Pembuktian end-to-end pada deployment final

Menurut laporan awal, alamat kontrak historis adalah `0x39de125002edA28c886d9125AE5d61BB5BE04903` pada Sepolia dengan chain ID `11155111`. Gunakan nilai tersebut hanya sebagai petunjuk pemeriksaan, bukan konfigurasi final yang otomatis dipercaya. Cocokkan jaringan, source, receipt, dan versi aplikasi saat ini. Sepolia merupakan pilihan yang telah dipakai proyek, sedangkan izin jaringan ujian tetap mengikuti ketentuan dosen.

Siapkan akun uji terpisah sesuai kebijakan, institusi sintetis, serta setidaknya dua kredensial fixture dengan atribut berbeda dan satu kredensial khusus pencabutan. Kebutuhan fixture ini berasal dari desain pengujian proyek. Jangan memakai data ijazah asli yang tidak diizinkan. Jalankan melalui UI untuk membuktikan integrasi produk, lalu verifikasi hasil melalui API dan chain. Script boleh membantu setup serta pemeriksaan, tetapi jangan menggantikan semua bukti interaksi UI dengan script.

| Skenario | Hasil yang diharapkan | Bukti yang harus dikumpulkan |
| --- | --- | --- |
| Wallet/client terhubung ke jaringan yang benar | Akun dan chain benar, penolakan jaringan salah bekerja. | Tampilan, konfigurasi non-rahasia, dan hasil pembacaan provider. |
| Registrasi institusi dan signer | Registry serta akses sesuai kebutuhan. | Tx hash, receipt, event, dan pembacaan state. |
| Penerbitan dengan otorisasi sah | Kredensial aktif setelah konfirmasi yang ditentukan. | Domain dan versi non-rahasia, tx penerbitan, event `CredentialIssued`, serta hasil `getCredential`. |
| Membuka QR kredensial tersebut | `VERIFIED_RECORD`, cakupan `RECORD_ONLY`, tanpa transaksi baru. | Respons, tampilan, serta bukti tidak adanya pengiriman tx oleh jalur QR. |
| Membuat dan mengunduh PDF penerbit | PDF konsisten dengan data kredensial dan QR. | PDF sintetis, screenshot, hasil akses sah dan penolakan akses tidak sah. Tidak mensyaratkan OCR dalam alur penerbitan PDF. |
| Mengunggah PDF yang atributnya cocok | `MATCH` setelah OCR layak dan dekripsi FHE nyata berhasil. | Request ID, OCR, tx `verify`, event `ComparisonRequested`, hasil per field yang diizinkan, keputusan, dan waktu tiap tahap. |
| Mengubah satu atribut tanpa merusak kelayakan OCR | `MISMATCH` pada atribut yang berubah setelah dekripsi. | Fixture asli dan berubah, hasil OCR yang menjelaskan nilai terbaca, tx pencocokan, hasil FHE, dan laporan hasil aplikasi. |
| QR berbeda dari `expectedCredentialId` yang ditetapkan | `INCONCLUSIVE` atau status penolakan binding yang memang ditetapkan domain, tanpa tx pencocokan baru. | Input tujuan, QR hasil baca, alasan penolakan, dan pemeriksaan tidak ada broadcast baru. |
| QR valid memilih kredensial B pada dokumen dengan atribut A | Jika rekaman B valid dan OCR layak, perbedaan atribut menghasilkan `MISMATCH`. Jangan memaksa `INCONCLUSIVE` hanya karena QR diganti. | Fixture, ID yang benar-benar dipilih pipeline, OCR, dan hasil pencocokan. Sesuaikan dengan desain binding yang diverifikasi. |
| Dokumen tidak layak atau QR ambigu | `INCONCLUSIVE` sesuai alasan, tanpa transaksi yang tidak diperlukan. | Respons dan alasan, serta tidak adanya tx baru. |
| Mencabut kredensial uji khusus melalui portal | State dicabut dan event `CredentialRevoked` tersedia. | Tx hash pencabutan, receipt, state, tampilan, dan tautan explorer jika tersedia. |
| Mengakses QR dan mengunggah dokumen setelah pencabutan | Jalur QR dan keputusan dokumen mencerminkan `REVOKED`. Tidak ada pencocokan baru yang tidak sah. Unduhan PDF ditolak sesuai aturan produk. | Respons kedua jalur, portal, hasil akses PDF, dan pemeriksaan tidak ada tx `verify` baru. |
| Pencabutan atau institusi nonaktif ketika pekerjaan sedang berjalan | Pemeriksaan akhir tidak menghasilkan `MATCH`. | Uji integrasi terkontrol atau mock untuk timing deterministik, serta label tingkat bukti yang benar. |
| Gangguan RPC, dekripsi, kuota, atau saldo | Status gagal atau menunggu yang tepat, tanpa sukses palsu dan tanpa transaksi ganda saat retry. | Tes terkontrol, diagnostik yang disanitasi, dan pemeriksaan outbox. |
| Riwayat, laporan hasil, dan penghapusan | Hanya sesi pemilik dapat membaca, PDF hasil konsisten, artefak terhapus sesuai aturan. | Respons, screenshot, dan satu siklus storage uji. |

Keberhasilan tx `verify` tidak membuktikan hasil dekripsi berhasil. Simpan bukti boolean hasil yang menjadi dasar keputusan, dengan akses dan penyamaran data sesuai fixture. Jangan memulihkan hasil lama yang tidak tersedia dengan mengarang hasil berdasarkan receipt.

Jika dokumen disalin dengan keempat atribut yang sama, sistem pencocokan atribut dapat tetap menghasilkan `MATCH`. Jangan menjanjikan deteksi keaslian kertas, tanda tangan visual, atau seluruh byte PDF yang tidak menjadi cakupan algoritma. Bedakan batas tersebut dari kegagalan mendeteksi atribut yang berubah.

Local chain atau testnet memenuhi bentuk lingkungan yang diizinkan PDF, tetapi mock FHE lokal tidak membuktikan dekripsi layanan Zama di Sepolia. Jika layanan eksternal tertahan, pertahankan dua status terpisah, yaitu integrasi lokal yang terbukti dan integrasi layanan nyata yang belum selesai. Jangan menghapus fungsi FHE untuk menyatakan aplikasi siap.

## 9 Audit keamanan dan bukti perbaikan

### 9.1 Threat model dan aspek wajib

Tuliskan aset yang dilindungi, termasuk integritas registry dan kredensial, atribut privat, kunci, bukti penerbitan, dokumen unggahan, hasil OCR, sesi, saldo uji relayer, dan ketersediaan layanan. Jelaskan kewenangan pemeriksa anonim, signer institusi, admin, attestor, relayer, reader, operator storage, penyedia RPC, serta layanan FHE.

Petakan batas browser ke API, API ke database dan blob, wallet ke kontrak, layanan backend ke kontrak, serta aplikasi ke RPC dan Zama. Identifikasi skenario penyalahgunaan yang mungkin melalui setiap batas. Backend yang melihat OCR plaintext tetap merupakan pihak tepercaya, meskipun perbandingan dilakukan dengan FHE.

| Aspek D.2 | Pemeriksaan minimum yang relevan |
| --- | --- |
| Reentrancy | Panggilan eksternal, urutan effects dan interactions, kontrak sistem FHE, serta rollback saat proof gagal. Ketiadaan transfer ETH saja tidak cukup untuk menyimpulkan aman. |
| Access control | Registry, penerbitan, pencabutan, role layanan, ACL FHE, rotasi, dan otorisasi API. Bedakan role pada kode dari konfigurasi pemegang role saat deployment. |
| Front-running dan ordering | Replay, domain dan pengikatan pemanggil, ID kredensial, perubahan registry saat transaksi menunggu, serta asumsi konfirmasi. |
| Oracle risk | Kepercayaan terhadap OCR dan attestor, RPC, layanan dekripsi, dan bukti off-chain. Periksa akibat data atau respons yang salah. |
| DoS | Loop dan paginasi, biaya FHE, saldo relayer, kuota, parser dokumen, antrean, lease, dan kontensi database. |
| Validasi input | Nilai nol, ukuran dan byte string, versi, deadline, nonce, handle, proof, file, QR, dan konsistensi data lintas lapisan. |
| Error handling | Revert, rollback, error konfigurasi, timeout, retry, status pengguna, serta penanganan kegagalan tanpa sukses palsu. |

Gunakan kalimat seperti tidak ditemukan jalur eksploitasi dalam cakupan yang diuji bila itulah hasilnya. Hindari jaminan tidak rentan secara mutlak hanya dari pembacaan kode singkat.

### 9.2 Seluruh temuan awal harus mendapat keputusan

Pertahankan relasi ID dari laporan awal ke temuan final agar tidak ada temuan yang hilang tanpa penjelasan. Tambahkan temuan baru hanya jika ada bukti yang jelas.

| ID awal | Pokok temuan | Keputusan yang harus dihasilkan |
| --- | --- | --- |
| S-01 | Satu alamat memegang seluruh role dan signer | Verifikasi chain serta konfigurasi efektif, lalu terapkan pemisahan yang sesuai bagian 6.2. Jangan mengklaim lokasi private key tanpa bukti. |
| S-02 | Admin tunggal dan perpindahan admin | Dokumentasikan trust dan prosedur transfer yang aman. Multisig atau timelock tetap opsional kecuali analisis kebutuhan membuktikan keharusannya. |
| S-03 | Perebutan ID kredensial | Reproduksi lokal, perbaiki bila merupakan celah valid pada lingkup, atau jelaskan mitigasi dan risiko desain residual secara spesifik. |
| S-04 | Perubahan nama institusi saat penerbitan | Uji konsistensi signature dan snapshot, kemudian perbaiki atau mitigasi penyebab inkonsistensi yang terbukti. |
| S-05 | ACL referensi diberikan kepada signer | Validasi kebutuhan izin dan perilaku library. Terapkan least privilege serta tes akses yang benar jika izin berlebih terbukti. |
| S-06 | Penebakan atribut privat melalui layanan pencocokan | Analisis pemeriksa anonim dan backend yang dikuasai secara terpisah. Kuota off-chain tidak melindungi dari pihak yang menguasai layanan itu sendiri. Menghilangkan hasil per field juga tidak otomatis menghilangkan oracle tebakan dari hasil agregat. |
| S-07 | Kepercayaan pada satu RPC | Dokumentasikan provider dan kegagalan yang ditangani. API key bukan bukti kebenaran data. Kuorum provider merupakan opsi tambahan dan bukan otomatis wajib. |
| S-08 | Saldo relayer dan rate limit | Validasi ancaman, implementasikan pengaman yang relevan, lalu uji kuota, spoofing, saldo, serta retry. |
| S-09 | Error signature dari OpenZeppelin | Nilai sebagai konsistensi error jika penolakan signature sudah benar. Hindari menaikkan tingkat risiko tanpa dampak. |
| S-10 | Error registry dan operasi tanpa perubahan | Perbaiki ketidakjelasan perilaku atau validasi yang terbukti, dengan kebijakan idempotensi yang konsisten. |
| S-11 | Source explorer dan metadata build | Tingkatkan reproduksibilitas serta verifikasi source jika dapat dilakukan. Transparansi berbeda dari eksploitabilitas kontrak. |
| S-12 | Penguncian satu baris JSONB | Ukur dampak pada beban uji yang wajar. Perbaiki masalah kebenaran yang muncul dan masukkan batas skala ke evaluasi P4. |
| S-13 | Reentrancy | Catat pemeriksaan dan asumsi trust, meskipun tidak ditemukan temuan. |
| S-14 | DoS gas kontrak | Uji batas paginasi dan loop, lalu jelaskan hasil. |
| S-15 | Deadline tanpa batas maksimum on-chain | Bandingkan kebutuhan produk, kontrol API, dan perilaku pemanggil langsung. Jangan menambah batas arbitrer tanpa aturan bisnis. |

Tabel audit final harus memuat ID, lokasi atau fungsi, aset terdampak, prasyarat, bukti reproduksi, kemungkinan, dampak, tingkat risiko, mitigasi, identitas perubahan, tes, hasil retest, dan risiko residual. Bedakan `TERBUKTI`, `RISIKO_DESAIN`, `INFORMASIONAL`, `TIDAK_TERBUKTI`, dan `TIDAK_RELEVAN` beserta alasan. Untuk status perbaikan gunakan keadaan nyata seperti diperbaiki dan teruji, terhalang, atau perlu verifikasi deployment.

Audit aplikasi di luar kontrak mendukung kelengkapan fullstack, tetapi tidak menggantikan pemeriksaan smart contract yang diminta Project 3. Catatan teknis harus memuat hasil pemeriksaan dan retest yang cukup agar ChatGPT dapat menulis laporan audit tanpa mengarang atau mengulang eksperimen. Agent tidak menulis laporan audit formal.

## 10 Pengumpulan data untuk penulisan Project 4 dan Project 5 oleh ChatGPT

### 10.1 Fakta arsitektur

Catat fakta implementasi pada tujuh aspek E.1: identitas, permissioning, konsensus, privasi, throughput, governance, dan biaya operasional. Gunakan tabel nilai, mekanisme aktual, lokasi kode, dan bukti. Catat keputusan yang sudah diterapkan serta alasan teknis yang memang tersedia di repo.

Perbandingan Ethereum dengan Fabric atau permissioned, pembahasan trade-off, dan rekomendasi akhir akan ditulis oleh ChatGPT. Agent tidak perlu menulis esai perbandingan atau melakukan literature review. Jika dokumentasi resmi digunakan selama implementasi, simpan URL dan versi yang dirujuk. Jangan mengklaim telah menguji Fabric jika tidak menjalankannya.

Dalam metadata implementasi, catat Sepolia sebagai testnet publik dengan validator berizin dan bedakan role aplikasi dari izin menjadi validator. Pisahkan hasil pengamatan testnet dari informasi mengenai alternatif produksi.

Serahkan fakta kebutuhan antar-institusi, pengelola identitas, akses pembacaan, ketergantungan operator, serta biaya yang dapat dibuktikan. Fakta tersebut akan dipakai ChatGPT untuk membahas kapan public blockchain, permissioned blockchain, atau database lebih tepat.

### 10.2 Pengukuran nonfungsional yang proporsional

Kumpulkan data dari eksekusi yang memang dilakukan:

| Data | Metode dan interpretasi |
| --- | --- |
| Gas deployment, registry, penerbitan, pencocokan, pencabutan | Ambil dari receipt transaksi aktual dan bedakan setiap fungsi. Gas bukan durasi dan bukan langsung biaya rupiah. |
| Durasi OCR, antrean, submit, konfirmasi, dekripsi, total | Gunakan timestamp atau timer tahap yang konsisten, dengan definisi awal dan akhir. Pisahkan waktu menunggu layanan dari komputasi lokal. |
| Sampel berulang | Gunakan fixture dan konfigurasi yang sama untuk pengulangan kecil yang wajar. Catat jumlah sampel, ukuran dokumen, hasil gagal, cache, dan lingkungan. Jumlah pengulangan adalah keputusan metode proyek. |
| Ringkasan hasil | Sajikan nilai aktual, median dan rentang jika sampel memadai. Jangan membuat percentile atau klaim throughput representatif dari satu sampel. |
| Batas kapasitas | Analisis lease relayer, nonce satu akun, lock database, polling, timeout, parser, serta layanan FHE. Uji concurrency lokal secara terbatas untuk correctness. |
| Interoperabilitas | Jelaskan ABI, EIP-712, format QR/PDF, versi encoding, perpindahan kontrak, dependensi FHE, dan integrasi sistem kampus. Jangan mengklaim W3C Verifiable Credentials jika tidak diterapkan. |

Pengukuran ini menjadi masukan bagi evaluasi 2 sampai 3 halaman yang akan ditulis ChatGPT. Agent hanya menyerahkan metode pengukuran, data mentah, ringkasan angka, dan penjelasan teknis atas observasi. Jangan melakukan benchmark tak terbatas atau menghabiskan saldo testnet demi jumlah sampel. Pisahkan pengukuran yang dilakukan dari yang tertahan.

### 10.3 Privasi dan governance

Catat dalam tabel informasi yang tampil melalui profil QR dan API publik, hash di chain, atribut terenkripsi, dokumen privat, hasil OCR, log, serta metadata transaksi. Sertakan pihak yang dapat mengakses, dasar kontrol akses, retensi, dan bukti. Catat bahwa backend menerima dokumen plaintext dan pihak yang memiliki izin dapat mendekripsi sesuai ACL. Evaluasi akademik mengenai privasinya akan ditulis ChatGPT.

Catat siapa yang secara teknis boleh mengubah registry, signer, role, konfigurasi, source, deployment, dan node yang dipakai. Simpan prosedur operasional yang benar-benar tersedia untuk perubahan, uji, rollback, koreksi penerbitan, pencabutan, serta penerbitan ulang. Jika kebijakan organisasi atau sengketa belum ditentukan, catat fakta itu tanpa mengarang prosedur atas nama institusi. ChatGPT akan mengolah data tersebut menjadi pembahasan governance dan rekomendasi.

### 10.4 Bukti demo dan kontribusi

Catat langkah teknis untuk mengulang koneksi wallet, penerbitan, event atau state, verifikasi QR, pencocokan dokumen, pencabutan, serta tes dan remediasi. Gunakan transaksi atau fixture yang mudah ditelusuri. Agent tidak menulis naskah presentasi akademik atau slide.

Jika alat perekaman tersedia, rekam demo nyata tanpa menampilkan rahasia atau data pribadi asli. Video hasil simulasi UI tidak boleh disebut video testnet. Jika perekaman belum dapat dilakukan, siapkan langkah serta daftar tampilan yang dibutuhkan dan tandai luaran G.9 belum selesai. Jangan membuat file video kosong atau mengklaim screenshot menggantikan video cadangan.

Untuk bahan F.4, serahkan fakta publikasi data ijazah, kontrol akses, retensi, pihak tepercaya, kegagalan OCR yang diamati, biaya yang tercatat, ketergantungan RPC/Zama/hosting, serta bagian layanan yang berhenti jika operator tidak tersedia. ChatGPT yang akan menulis pembahasan etika, regulasi, risiko, keberlanjutan, dan dampak. Agent tidak melakukan kajian hukum atau menyatakan kepatuhan hukum aplikasi.

Ambil kontribusi dari riwayat yang nyata serta informasi anggota yang diberikan. Satu penulis commit tidak membuktikan tidak ada kontribusi nonkode, sehingga catat kontribusi lain jika ada bukti. Jangan membuat commit, tanggal, identitas, atau pembagian kerja fiktif. Data identitas yang belum diberikan tidak menghalangi implementasi teknis.

Pastikan catatan teknis cukup untuk menjelaskan pembagian on-chain/off-chain, EIP-712, perbedaan QR dan pemeriksaan dokumen, FHE, oracle, gas, pencabutan, serta rotasi. Naskah tanya jawab defense disusun kemudian oleh ChatGPT berdasarkan catatan ini, bukan oleh agent repo pada tahap sekarang.

Catat backlog teknis yang benar-benar ditemukan beserta dampak dan ketergantungannya untuk bahan roadmap yang akan ditulis ChatGPT. Fitur opsional seperti multisig atau dukungan wallet ERC-1271 boleh dicatat jika relevan, tanpa dimasukkan sebagai kewajiban pengerjaan sekarang.

## 11 Artefak teknis dan bahan yang harus diserahkan

Gunakan folder dokumentasi yang sesuai aturan repo. `docs/uas/` berikut merupakan usulan lokasi, bukan alasan mengubah struktur yang telah diatur. Gabungkan informasi yang berulang melalui tautan ke sumber kanonis. Jangan menghasilkan banyak salinan laporan dengan angka yang berbeda.

| Artefak | Isi minimum |
| --- | --- |
| `README.md` | Deskripsi use case, prasyarat dan versi, instalasi, konfigurasi tanpa rahasia, migrasi database, build, tes, deployment, registrasi, jalur demo, batas mode mock, serta reproduksi dari checkout bersih. |
| `docs/uas/KEPATUHAN_UAS.md` | Seluruh butir A sampai J yang relevan, dasar kewajiban, keadaan awal, perubahan, tes, bukti, status sekarang, dan pemisahan luaran yang ditunda. |
| `docs/uas/FAKTA_ARSITEKTUR_DAN_PENGUKURAN.md` | Tabel aktor, model data, akses, on-chain/off-chain, fitur Solidity, keputusan yang diterapkan, data mentah dan ringkasan pengukuran, serta catatan dependensi. Tidak berisi bab laporan atau esai evaluasi enterprise. |
| `docs/uas/CATATAN_TEMUAN_DAN_RETEST.md` | Catatan threat model, pemeriksaan ketujuh aspek D.2, temuan, risiko, perubahan, commit atau diff, tes, retest, dan bukti. Ini catatan kerja audit teknis untuk ChatGPT, bukan laporan audit akademik. |
| `docs/uas/DEPLOYMENT_RECORD.md` serta record mesin bila dibuat | Jaringan, alamat, block, transaksi, versi build dan aplikasi, roles, langkah reproduksi, kontrak lama dan baru, serta verifikasi event/state. Record tidak berisi kunci. |
| `docs/uas/TEST_RESULTS.md` | Matriks kategori tes, hasil per suite, jumlah lulus/gagal/skipped, coverage, debugging, regresi sebelum/sesudah, E2E, dan status CI berdasarkan run aktual. |
| `docs/uas/DEMO.md` | Langkah reproduksi demo, fixture, akun berdasarkan peran tanpa private key, ekspektasi, hasil, bukti, langkah saat gangguan, dan lokasi video jika benar-benar direkam. Tidak berisi naskah presentasi. |
| `docs/uas/BAHAN_LAPORAN_UAS.md` | Inventaris faktual untuk diserahkan kepada ChatGPT, berisi perubahan, versi, hasil tes, angka pengukuran, temuan, dan tautan bukti beserta maknanya. Tidak ditulis sebagai bab laporan akademik. |
| `docs/uas/evidence/` | Log tersanitasi, receipt atau event yang relevan, hasil API uji, data pengukuran, coverage, screenshot nyata, dan rekaman jika tersedia. |
| `docs/uas/diagrams/` | Sumber diagram yang dapat disunting, `Architecture_Diagram.png` atau PDF, serta diagram alur transaksi yang sesuai versi final. |

### 11.1 Index evidence untuk template

Template meminta kode bukti B-01, B-02, dan seterusnya. Sediakan index di dalam bahan laporan atau berkas CSV dengan kolom berikut:

| Kolom | Makna |
| --- | --- |
| Kode bukti | ID unik yang stabil, misalnya B-01. |
| Judul observasi | Nama hasil yang jelas, misalnya penolakan penerbitan oleh signer nonaktif. |
| Sumber dan lokasi relatif | File atau artefak asli yang dapat dibuka kembali. |
| Waktu dan zona waktu | Waktu pengambilan sebenarnya dengan zona eksplisit. Gunakan WIB untuk penyajian pengguna dan pertahankan UTC mentah bila berasal dari blockchain. |
| Versi | Commit, identitas build, deployment ID, atau alamat kontrak yang relevan. |
| Metode | Perintah, input fixture, jaringan, dan kondisi pengamatan. |
| Tingkat bukti | Kode, mock, komponen nyata lokal, chain lokal, atau testnet. |
| Hasil | Nilai, status, jumlah, receipt, atau respons yang benar-benar diperoleh. |
| Interpretasi | Apa yang dibuktikan dan batas klaim yang memengaruhi hasil. |
| Rujukan tugas dan template | Butir PDF dan bagian laporan yang didukung. |
| Caption | Penjelasan singkat untuk gambar, tabel, atau rekaman. |

Kode B-01 membantu keterlacakan, tetapi uraian hasil tetap harus menjelaskan substansi observasi. Jangan membuat paragraf yang hanya berisi deretan ID bukti atau nama log tanpa makna.

### 11.2 Kualitas dan keamanan evidence

1. Simpan bukti yang cukup untuk mereproduksi kesimpulan. Screenshot harus berasal dari eksekusi aktual, terbaca, dan sesuai commit atau deployment yang dilaporkan.
2. Bedakan fixture sintetis, mock, dan data testnet. Jangan memakai screenshot UI mock sebagai bukti transaksi nyata.
3. Jangan menyimpan private key, seed phrase, access token, cookie sesi, kredensial database, URL RPC bertoken, atau konfigurasi rahasia dalam dokumen maupun arsip.
4. Gunakan metadata yang diizinkan dan nilai publik. Jika error mengandung rahasia, sanitasi bagian sensitif tanpa mengubah pesan substantif, exit code, atau hasil. Catat bahwa bagian rahasia disembunyikan.
5. Jangan mengganti hasil gagal dengan hasil lulus atau menghilangkan kegagalan yang memengaruhi kesimpulan. Bedakan hasil baseline, hasil diagnosis, dan run final.
6. Source code, lockfile, test, dan script reproduksi adalah bagian evidence. Jangan hanya mengumpulkan gambar.
7. Rekam perubahan dengan commit atau diff yang dapat ditelusuri. Perubahan terakhir setelah pengujian harus diuji ulang pada area terdampak sebelum diberi label final.
8. Jika membuat ZIP handoff, gunakan daftar berkas yang diizinkan. Sertakan dokumen teknis, index, bukti, dan sumber diagram yang relevan. Jangan memasukkan seluruh repo secara buta, `.env`, dependency terpasang, storage pengguna, atau cache browser.
9. Nama ZIP yang disarankan adalah `BAHAN_LAPORAN_UAS_BLOCKCHAIN.zip`. Arsip tersebut merupakan bahan penulisan tahap berikutnya dan tidak boleh disebut paket UAS lengkap jika luaran final masih ditunda.

## 12 Pemetaan ke template laporan UAS

Bagian ini hanya memetakan data yang dibutuhkan ChatGPT untuk menulis laporan di percakapan pengguna. Agent repo mengumpulkan fakta dan bukti untuk setiap baris, tanpa menulis narasi bab, mengisi tabel pada DOCX, atau mengedit template. Semua penulisan laporan dilakukan oleh ChatGPT setelah pengguna menyerahkan hasil implementasi.

### 12.1 Pemilihan template

Pilih `UAS kelompok` pada identitas ketika laporan akhir nanti dibuat. Pertahankan bagian umum dan bagian `5 Bagian Khusus UAS`. Bagian `4 Bagian Khusus UTS` beserta 4.1 sampai 4.5 tidak digunakan dalam laporan UAS. Karena itu, jangan menambahkan mini-blockchain, Merkle tree, eksperimen Bitcoin/UTXO, atau kasus UTS sebagai pekerjaan baru untuk memenuhi template UAS.

Pertahankan nama serta susunan bagian template yang relevan. Jangan menggantinya dengan susunan BAB I sampai V buatan sendiri. Nomor 5 dan 6 pada pemetaan berikut mengikuti template asli dan bukan hasil penomoran baru. Jangan mengubah font, layout, tabel, atau penomoran template sekarang.

Anjuran 10 sampai 15 halaman pada petunjuk template berlaku untuk UTS. Jangan menjadikannya batas laporan UAS. PDF UAS menetapkan maksimal 10 slide dan evaluasi nonfungsional 2 sampai 3 halaman, tanpa menetapkan batas keseluruhan halaman laporan utama pada sumber yang digunakan di sini.

### 12.2 Bahan per bagian

| Bagian template yang dipakai | Bahan yang harus tersedia |
| --- | --- |
| Identitas | Jenis UAS kelompok, judul proyek aktual, nama dan NPM yang diberikan, anggota dan kontribusi nyata, kelas, semester 7, mata kuliah Blockchain, kode KP70067008, dosen Dr. Ir. Nur Widiyasono, M.Kom., dan tanggal kegiatan sebenarnya. |
| Ringkasan Kegiatan | Fakta masalah, tujuan, metode, hasil terpenting, rekomendasi, serta keterbatasan yang berpengaruh. Ringkasan akhir 1 sampai 2 paragraf baru disusun setelah hasil final. |
| 1 Pendahuluan | Konteks use case dan tujuan berdasarkan kebutuhan verifikasi ijazah. |
| 1.1 Latar belakang dan tujuan | Masalah utama, pertanyaan yang dijawab, alasan blockchain dan FHE, serta kriteria keberhasilan yang dapat diuji. |
| 1.2 Ruang lingkup | Empat atribut, jenis dokumen, QR dan unggahan, role, jaringan, data sintetis, serta batas klaim yang benar. |
| 2 Data, Alat, dan Reproduksibilitas | Use case atau fixture beserta sumber, tanggal, versi, lingkungan, chain ID, tool dan versi, repo atau commit, artefak awal, serta langkah reproduksi. |
| 3 Catatan Pelaksanaan | Tahap dan tanggal sebenarnya, tindakan yang dilakukan, hasil, dan index bukti dengan sumber, waktu, caption, observasi, serta interpretasi. |
| 5 Bagian Khusus UAS | Pengikat kelima Project sesuai PDF. |
| 5.1 Desain solusi dan smart contract (Project 1) | Aktor, aset, transaksi, trust, diagram, model data, role, aturan bisnis, penggunaan Solidity, keputusan, dan trade-off. |
| 5.2 Pengujian, deployment, dan integrasi (Project 2) | Tabel tes, coverage, satu debugging nyata, compile, deployment, network, chain ID, address, tx hash, integrasi, event/state, dan README. |
| 5.3 Audit keamanan dan perbaikan (Project 3) | Threat model, tujuh aspek audit, temuan, risiko, perubahan, commit atau diff, serta retest. |
| 5.4 Enterprise, privasi, dan nonfungsional (Project 4) | Matriks public/Ethereum dan permissioned/Fabric, semua aspek E.1, pengukuran, bottleneck, interoperability, privasi, role/node/upgrade/sengketa, dan alternatif database. |
| 5.5 Showcase dan kontribusi (Project 5) | Alur demo, tes dan remediasi, batasan yang relevan, etika/regulasi/risiko/keberlanjutan/dampak, roadmap, video cadangan, dan kontribusi. |
| 6 Kesimpulan, Daftar Pustaka, dan Lampiran | Jawaban tujuan dari hasil, sumber yang benar-benar digunakan, serta daftar artefak UAS. Kesimpulan final ditulis saat laporan diminta. |

### 12.3 Kolom tabel template yang perlu dipersiapkan

Sediakan data yang dapat langsung mengisi tabel berikut pada tahap penulisan. Jangan mengubah struktur tabel dosen untuk menyesuaikan data yang kurang.

| Tabel | Kolom sesuai template |
| --- | --- |
| Identitas | Identitas, Isian. |
| Bagian 2 | Komponen, Keterangan / rujukan. |
| Bagian 3 | Tanggal/tahap, Kegiatan yang dilakukan, Hasil dan rujukan bukti. |
| Bagian 5.1 | Data / fungsi, On-chain atau off-chain, Aktor / hak akses, Alasan teknis. |
| Bagian 5.2 | ID tes, Skenario positif/negatif/batas/akses, Ekspektasi, Hasil, Bukti. |
| Bagian 5.3 | ID temuan, Bukti dan dampak, Kemungkinan / risiko, Perbaikan / commit, Retest dan status. |
| Bagian 5.4 | Aspek, Public/Ethereum, Permissioned/Fabric, Keputusan untuk kasus. |
| Bagian 5.5 | Anggota, Tugas/kontribusi, Commit / bukti, Bagian yang dipresentasikan. |

Pada tabel 5.4, siapkan baris identitas dan izin, konsensus dan throughput, privasi dan biaya, serta governance dan upgrade. Tambahkan penjelasan skalabilitas, interoperabilitas, bottleneck, dan alternatif database dalam bahan pendukung agar seluruh PDF tetap tercakup.

### 12.4 Bentuk bahan laporan yang dapat dipakai kembali

`BAHAN_LAPORAN_UAS.md` berupa inventaris fakta dan tabel hasil. Untuk setiap pengujian, catat objek, input, konfigurasi, perintah, hasil aktual, penjelasan teknis singkat, dan bukti. Untuk setiap perubahan, catat masalah, fungsi terdampak, perubahan kode, serta hasil retest. Jelaskan istilah atau mekanisme spesifik repo secukupnya agar data tidak kehilangan konteks.

Sertakan data mentah dan metadata yang memungkinkan ChatGPT memeriksa angka, menyusun tabel, serta menulis pembahasan. Simpan URL dokumentasi resmi dan versi yang memang dipakai selama implementasi. Literature review, pencarian referensi akademik, kajian regulasi, perumusan argumen laporan, dan penulisan kesimpulan menjadi pekerjaan ChatGPT nanti.

Jangan menyusun Ringkasan Kegiatan, Pendahuluan, Landasan Teori, Pembahasan, Kesimpulan, atau bab 5.1 sampai 5.5 sebagai draf laporan di berkas bahan ini. Cantumkan nomor bagian template hanya sebagai kolom tujuan penggunaan data. Catatan teknis harus menjelaskan arti hasil tanpa berubah menjadi laporan akademik dan tanpa dipenuhi cerita proses agent.

## 13 Seluruh produk akhir PDF dan pembagian tahap

Daftar berikut mengikuti G.1 sampai G.10 pada halaman 4. Jangan menghilangkan item yang pengerjaannya ditunda oleh pengguna.

| Butir | Produk akhir yang diminta PDF | Tindakan sekarang | Status yang boleh diberikan sebelum tahap pelaporan |
| --- | --- | --- | --- |
| G.1 | `README_Final.pdf` atau `README.md` | Selesaikan README reproduksi. | Selesai jika isi final sesuai kode dan telah dipakai untuk reproduksi. |
| G.2 | `Laporan_UAS_Blockchain.pdf` | Kumpulkan fakta dan bukti sesuai bagian UAS template, lalu serahkan kepada pengguna. | Ditulis oleh ChatGPT di percakapan pengguna nanti. Agent repo tidak membuat draf atau file laporan. |
| G.3 | Source smart contract dan frontend/client | Selesaikan implementasi dan integrasi. | Selesai setelah penerimaan teknis serta pengujian relevan terpenuhi. |
| G.4 | Folder test dan bukti unit testing | Simpan tes serta hasil versi final. | Selesai jika hasil dapat ditelusuri dan direproduksi. |
| G.5 | `Deployment_Record.pdf` atau file ekuivalen | Buat record Markdown atau JSON yang dapat dibaca dengan seluruh informasi dan bukti. | Selesai jika informasi wajib tersedia dan dapat diverifikasi. PDF bukan satu-satunya format yang diizinkan untuk item ini. |
| G.6 | `Security_Audit.pdf` dan bukti perbaikan | Jalankan audit teknis, remediasi, dan retest, lalu simpan catatan serta bukti. | Laporan audit formal ditulis oleh ChatGPT dari hasil agent. |
| G.7 | `Architecture_Diagram.pdf/png` | Buat diagram final dan sumber yang dapat disunting. | Selesai jika diagram sesuai implementasi dan hasil render terbaca. |
| G.8 | `Slide_Presentasi.pdf` atau `.pptx` | Kumpulkan hasil dan bukti yang relevan tanpa menulis slide atau naskah presentasi. | Disusun oleh ChatGPT jika diminta pengguna, dengan maksimal 10 slide. |
| G.9 | `Video_Demo.mp4` atau tautan sesuai ketentuan dosen | Rekam demo nyata jika tersedia alat dan akses, atau siapkan skenario perekaman yang jelas. | Selesai hanya bila video atau tautan nyata tersedia dan dapat diputar. |
| G.10 | Riwayat kontribusi/commit yang dapat ditelusuri | Pertahankan riwayat dan catat kontribusi nyata. | Selesai sejauh bukti serta identitas nyata tersedia. Jangan mengarang kontribusi anggota. |

Selain sepuluh item paket, dokumen desain singkat, matriks enterprise, rekomendasi arsitektur, dan evaluasi nonfungsional 2 sampai 3 halaman tetap merupakan kewajiban luaran B dan E. Agent menyiapkan fakta serta pengukurannya. ChatGPT yang menulis dokumen dan pembahasannya setelah aplikasi selesai, sehingga kewajiban ini tidak dihapus dan tidak dialihkan kepada agent repo.

## 14 Kriteria selesai dan penanganan hambatan

### 14.1 Implementasi teknis siap

Gunakan checklist ini berdasarkan hasil, bukan sekadar keberadaan berkas:

- [ ] Versi final, kondisi repo, dan perubahan dapat ditelusuri.
- [ ] Alur penerbitan, QR, unggahan, pencocokan, pencabutan, riwayat, serta PDF berjalan sesuai cakupan produk.
- [ ] Frontend, API, kontrak, database, penyimpanan, dan proses latar memakai konfigurasi final yang konsisten.
- [ ] Perangkapan kewenangan yang bermasalah ditangani dan prosedur rotasi diuji.
- [ ] Semua temuan awal S-01 sampai S-15 mendapat keputusan dengan bukti, serta temuan valid telah ditangani dan diuji sesuai dampaknya.
- [ ] Unit test mencakup positif, negatif, batas, kontrol akses, dan regresi yang relevan.
- [ ] Lint, typecheck, compile, build, database test, serta E2E final berhasil atau hambatan spesifiknya dicatat tanpa klaim sukses.
- [ ] Coverage diukur pada cakupan yang dinyatakan dan pengecualian dijelaskan.
- [ ] Satu kasus debugging nyata telah direproduksi dan didokumentasikan.
- [ ] Deployment final memiliki network, address, hash transaksi, receipt, event/state, konfigurasi build, serta langkah reproduksi.
- [ ] Hasil dekripsi FHE nyata untuk kasus cocok dan berbeda terbukti jika kesiapan Sepolia diklaim.
- [ ] Pencabutan dan akibatnya terbukti, serta penolakan sebelum transaksi tidak dipaksa menghasilkan tx baru.
- [ ] Keputusan gagal, timeout, retry, dan pembatasan tidak menimbulkan sukses palsu atau transaksi ganda.
- [ ] Kredensial lama ditangani sesuai versi tanpa menghapus bukti atau mempercayai domain dari pengguna.
- [ ] README dapat digunakan dari checkout bersih dengan konfigurasi uji yang sah.

Kotak yang belum terpenuhi tidak boleh diberi tanda selesai. Hambatan eksternal dapat membatasi kesiapan deployment nyata meskipun kode dan pengujian lokal selesai. Jelaskan pengaruhnya secara spesifik, selesaikan pekerjaan independen, dan berikan kebutuhan minimum untuk menuntaskannya.

### 14.2 Bahan laporan siap

- [ ] Setiap butir matriks PDF mempunyai bukti atau status yang jelas.
- [ ] Fakta arsitektur, catatan audit, hasil pengujian, deployment, pengukuran, akses data, prosedur operasional, dan backlog teknis tersedia untuk diolah ChatGPT.
- [ ] Semua kolom tabel template UAS mempunyai data yang sah atau kebutuhan identitas yang disebut secara spesifik.
- [ ] Index B-01 dan seterusnya menghubungkan observasi dengan sumber, waktu, caption, hasil, serta interpretasi.
- [ ] Angka dalam bahan, log, tabel, dan receipt saling sesuai.
- [ ] Screenshot dan video yang tersedia berasal dari eksekusi aktual serta tidak memuat rahasia.
- [ ] Sumber teknis dan atribusi dapat ditelusuri.
- [ ] Paket handoff tidak berisi rahasia atau data pengguna yang tidak diperlukan.
- [ ] G.2, G.6 dalam format PDF, G.8, dan item lain yang ditunda tetap tercatat untuk tahap berikutnya.

Kesiapan bahan laporan tidak berarti penilaian UAS otomatis penuh. Pemahaman anggota, kualitas presentasi, dan penilaian dosen tidak dapat digantikan oleh kelulusan tes otomatis.

### 14.3 Keadaan yang tidak boleh disembunyikan

Jika ada layanan FHE yang tidak tersedia, saldo uji tidak cukup, database pengujian tidak dapat dijalankan, tanda tangan wallet diperlukan, atau bukti testnet belum dihasilkan, catat operasi yang tertahan beserta error yang sudah disanitasi. Jangan membeli aset, mengganti ke mainnet, menonaktifkan pengamanan, atau memalsukan hasil agar checklist terlihat selesai.

Jangan berhenti pada seluruh pekerjaan hanya karena nama anggota, template DOCX lokal, atau data administrasi belum tersedia. Lanjutkan implementasi, tes, audit, dan penyiapan bukti yang dapat dikerjakan.

## 15 Urutan pengerjaan dan handoff akhir

Kerjakan secara berurutan dengan menguji bagian yang berubah sebelum beralih ke pekerjaan berikutnya:

1. Identifikasi versi dan sumber, simpan baseline, baca aturan repo, lalu isi matriks awal.
2. Perbaiki tes E2E yang usang dan verifikasi perilaku produk yang harus dipertahankan.
3. Validasi audit, tulis tes reproduksi, lalu remediasi kontrak dan konfigurasi yang benar-benar bermasalah.
4. Lengkapi tooling role, deployment, jejak transaksi, pengaman relayer, serta integrasi backend yang diperlukan.
5. Jalankan tes kontrak, aplikasi, database, coverage, dan debugging. Selesaikan kegagalan yang relevan sebelum deployment final.
6. Deploy versi uji final jika diperlukan, selaraskan konfigurasi, lalu jalankan skenario nyata pada bagian 8.
7. Kumpulkan data nonfungsional dan bukti demo yang proporsional untuk bahan penulisan P4 dan P5 oleh ChatGPT.
8. Perbarui README, diagram, matriks kepatuhan, catatan temuan dan retest, serta inventaris `BAHAN_LAPORAN_UAS.md`. Verifikasi konsistensi fakta tanpa menyusun laporan akademik.
9. Buat arsip handoff yang aman jika fasilitas tersedia, lalu berikan lokasi berkas dan instruksi singkat untuk pengguna.

Respons akhir agent harus menyebutkan perubahan utama yang benar-benar dikerjakan, commit atau diff final, hasil tes beserta jumlahnya, status coverage, jaringan dan kontrak final jika ada, bukti alur FHE serta pencabutan, temuan audit yang terselesaikan, hambatan yang masih memengaruhi kesiapan, serta lokasi bahan laporan. Bedakan operasi yang hanya diuji dengan mock dari yang berjalan pada layanan nyata.

Tutup pekerjaan dengan menyerahkan bahan kepada pengguna untuk dibawa kembali ke ChatGPT dalam percakapan ini. Sebutkan bahwa laporan tugas dengan bagian UAS template dosen, laporan audit formal, evaluasi tertulis, dan slide final akan disusun oleh ChatGPT setelah pengguna memintanya. Jangan menawarkan untuk langsung menulis laporan di agent repo dan jangan meminta pengguna memilih ulang jenis pekerjaan.

## 16 Rujukan teknis untuk pemeriksaan versi

Utamakan source dan dokumentasi resmi yang sesuai versi paket terpasang. URL berikut membantu menemukan penjelasan mekanisme, bukan bukti bahwa semua kombinasi versi repo otomatis kompatibel:

| Sumber | Informasi yang diperiksa |
| --- | --- |
| https://ethereum.org/developers/docs/networks/ | Karakteristik jaringan publik, testnet, dan validator Sepolia. |
| https://docs.openzeppelin.com/contracts/5.x/access-control | Model role, admin, grant, revoke, dan opsi governance. |
| https://docs.openzeppelin.com/contracts/5.x/api/utils/cryptography | Perilaku `ECDSA.recover`, `tryRecover`, error signature, dan EIP-712. |
| https://docs.zama.org/protocol/solidity-guides/smart-contract/acl | Izin ciphertext, perbedaan akses permanen dan sementara, serta dekripsi. |
| https://github.com/zama-ai/fhevm-hardhat-template | Pola tooling dan pengujian FHEVM yang harus dicocokkan dengan versi repo. |
| https://docs.netlify.com/ | Konfigurasi hosting, fungsi latar, storage, dan informasi sumber permintaan yang dipercaya. |
| https://vercel.com/docs/headers/request-headers | Perilaku header platform jika jalur Vercel digunakan. |
| https://hyperledger-fabric.readthedocs.io/ | Identitas, permissioning, arsitektur, privasi, konsensus, dan operasi Fabric untuk evaluasi P4. |

Jika dokumentasi terkini berbeda dari versi yang terkunci di repo, periksa tag, release notes, atau source versi yang digunakan. Jangan menyalin contoh API lama atau terbaru tanpa mencocokkan tanda tangan fungsi dan konfigurasi protokol.

Mulai dari pemeriksaan repo dan baseline, lalu lanjutkan implementasi sampai seluruh pekerjaan yang dapat dijalankan pada tahap ini selesai dan buktinya tersimpan.
