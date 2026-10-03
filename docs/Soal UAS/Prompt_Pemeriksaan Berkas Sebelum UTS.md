Saya telah menambahkan PDF pedoman UAS Blockchain dari dosen ke repositori ini.

Periksa aplikasi dan seluruh isi repositori, lalu tentukan secara konkret apakah aplikasi sudah memenuhi pedoman tersebut serta fitur atau bagian implementasi apa yang perlu ditambahkan, diperbaiki, atau dituntaskan.

Use case proyek adalah verifikasi ijazah berbasis blockchain dengan pengesahan digital, QR, OCR, dan pencocokan atribut menggunakan FHE. Cocokkan keterangan ini dengan implementasi aktual. Jangan menganggap seluruh alurnya sudah berjalan hanya karena tercantum dalam dokumentasi.

Tahap ini hanya pemeriksaan dan rekomendasi. Jangan langsung mengubah kode, menambahkan fitur, mengganti dependensi, melakukan migrasi database, deployment, transaksi jaringan eksternal, commit, atau push.

1. Baca pedoman dosen secara lengkap.

Temukan PDF UAS Blockchain berdasarkan judul dan isinya. Pastikan dokumen yang digunakan adalah pedoman UAS yang saya tambahkan, bukan pedoman UTS atau tugas perseorangan sebelumnya.

Baca seluruh halaman, termasuk setiap butir project, luaran, rubrik penilaian, produk akhir, dan ketentuan akademik serta keamanan. Periksa halaman secara visual jika ekstraksi teks menghilangkan tabel atau informasi penting.

Jadikan PDF tersebut sebagai sumber utama persyaratan. Untuk setiap kekurangan, cantumkan bagian, nomor butir, halaman, dan kutipan singkat yang persis dari PDF.

Jangan membawa ketentuan jumlah tes, jumlah ancaman, durasi video, atau format tugas lama jika tidak ditetapkan dalam PDF UAS ini.

2. Periksa kondisi repositori yang sebenarnya.

Baca instruksi repositori yang berlaku, manifest, lockfile, konfigurasi, source code frontend dan backend, smart contract, skema database, penyimpanan, integrasi wallet, skrip deployment, pengujian, dokumentasi, serta riwayat perubahan yang relevan.

Gunakan kode aktual sebagai dasar penilaian implementasi. README, PRD, bahan laporan, screenshot, dan log lama merupakan bukti pendukung yang perlu dicocokkan dengan versi kode sekarang.

Bedakan secara jelas antara:
- Fitur yang baru direncanakan atau didokumentasikan.
- Fitur yang sudah memiliki implementasi.
- Fitur yang diuji menggunakan mock atau stub.
- Fitur yang diuji dengan komponen nyata.
- Alur aplikasi yang sudah terbukti berjalan end-to-end.

Jangan menggunakan jumlah tes dari laporan lama sebagai hasil pengujian versi sekarang.

3. Telusuri alur aplikasi secara menyeluruh.

Periksa hubungan frontend, API/backend, database, penyimpanan, wallet/provider, smart contract, OCR, dan layanan FHE sesuai struktur proyek.

Telusuri penerbitan, pengesahan digital, verifikasi QR, unggahan dokumen, pembacaan atribut, pencocokan FHE, dekripsi hasil, pencabutan, serta perubahan hasil verifikasi setelah pencabutan.

Periksa kontrol akses dan validasi pada lapisan yang berwenang. Tombol yang disembunyikan di frontend tidak cukup membuktikan bahwa operasi terlarang ditolak backend atau smart contract.

Bedakan pemeriksaan rekaman melalui QR dengan pemeriksaan atribut dokumen. Periksa juga bagian proses yang masih membaca data plaintext dan pihak yang dapat mengaksesnya.

Jika suatu alur belum selesai, sebutkan titik yang terputus, komponen atau fungsi terkait, dampaknya terhadap pengguna, dan pekerjaan yang diperlukan. Jangan hanya menulis “perlu integrasi” atau “perlu ditingkatkan”.

4. Jalankan pemeriksaan yang diperlukan untuk menguatkan kesimpulan.

Periksa perintah build, kompilasi kontrak, lint, typecheck, unit test, integration test, dan pengujian end-to-end yang tersedia. Jalankan pemeriksaan relevan yang aman di lingkungan lokal atau terisolasi.

Periksa konfigurasi sebelum menjalankan perintah agar pengujian tidak menulis ke database operasional atau mengirim transaksi jaringan eksternal. Jika pemeriksaan menghasilkan berkas atau mengubah artefak terlacak, gunakan salinan atau direktori sementara yang terisolasi.

Catat versi kode, perintah, lingkungan, hasil, dan cakupan mock yang digunakan. Jangan menyebut pengujian lulus jika tidak dijalankan atau tidak ada bukti yang sesuai.

Jika pemeriksaan terhalang prasyarat, sebutkan prasyarat tersebut secara spesifik dan pisahkan status “belum diuji” dari “gagal”. Jangan menganggap ketiadaan bukti sebagai bukti bahwa fitur tidak diimplementasikan.

5. Periksa audit keamanan sesuai pedoman.

Petakan seluruh aspek keamanan yang diminta PDF ke kontrak dan komponen aplikasi yang relevan. Bedakan kerentanan yang terbukti, risiko desain, kekurangan bukti pengujian, dan aspek yang tidak relevan dengan alasan teknis.

Jika mengusulkan perbaikan, jelaskan skenario pemicu, dampak, lokasi kode, perubahan yang diperlukan, dan tes untuk memverifikasi perbaikannya.

Periksa apakah riwayat repo sudah memiliki perbaikan yang dapat ditelusuri dari kondisi sebelum perbaikan sampai pengujian ulang. Jangan mengarang kerentanan atau sengaja menambahkan bug demi memenuhi bagian remediation.

Audit frontend dan backend boleh mendukung analisis, tetapi tidak menggantikan audit smart contract yang diwajibkan PDF.

6. Tetapkan kekurangan berdasarkan persyaratan yang benar.

Untuk setiap rekomendasi, tentukan apakah rekomendasi tersebut:
- Memenuhi kewajiban yang tertulis langsung dalam PDF.
- Menyelesaikan implementasi use case yang memang sudah menjadi cakupan proyek.
- Memperbaiki temuan audit yang memiliki bukti.
- Merupakan pengembangan opsional di luar kewajiban UAS.

Jangan menganggap multisig, timelock, pause, kontrak upgradeable, portal lulusan, NFT, atau migrasi ke Hyperledger Fabric sebagai fitur wajib kecuali ada dasar eksplisit dalam PDF atau kebutuhan teknis yang dapat dibuktikan.

Instruksi membahas pengelolaan upgrade tidak otomatis berarti harus memakai proxy. Instruksi membandingkan permissioned blockchain tidak otomatis berarti harus membangun implementasi kedua.

Jika fitur sudah memadai dan yang kurang hanya bukti pengujian atau dokumentasi, tuliskan itu secara tepat. Jangan menyarankan pembangunan ulang fitur yang sudah tersedia.

7. Evaluasi dukungan tech stack.

Periksa apakah stack dan kombinasi versi paket sekarang mendukung pekerjaan yang diperlukan. Perhatikan kompatibilitas kontrak, SDK FHE, plugin pengujian, wallet, backend, database, dan lingkungan eksekusi.

Jika kompatibilitas meragukan, gunakan dokumentasi resmi yang relevan. Jangan menyatakan suatu versi kompatibel hanya karena nama paketnya sesuai.

Untuk setiap perubahan teknologi yang diusulkan, jelaskan hambatan nyata, pilihan perbaikan dalam stack sekarang, komponen yang harus berubah, dan dampaknya terhadap kode serta pengujian. Bedakan perubahan konfigurasi, pembaruan dependensi, refactor, dan pergantian stack.

Sajikan hasil pemeriksaan dalam urutan berikut.

1. Jawaban langsung.

Jelaskan apakah aplikasi sudah memenuhi kebutuhan fungsional UAS, bagian apa yang masih kurang, dan apakah stack dapat dipertahankan. Pisahkan kesiapan aplikasi dari kelengkapan keseluruhan paket UAS.

2. Matriks kepatuhan seluruh butir PDF.

Gunakan kolom:
- Butir, halaman, dan kutipan persis dari PDF.
- Kondisi aktual beserta bukti kode atau pengujian.
- Status pemenuhan.
- Tindak lanjut yang diperlukan.
- Jenis pekerjaan, seperti fitur aplikasi, pengujian, deployment, audit, atau dokumentasi.

Gunakan status yang jelas, seperti memenuhi, memenuhi sebagian, belum tersedia, belum dapat dibuktikan, atau berlaku bersyarat. Jangan melewatkan butir hanya karena tidak berhubungan langsung dengan kode.

3. Daftar konkret fitur yang perlu ditambahkan atau di-upgrade.

Ini bagian utama yang saya butuhkan. Untuk setiap item, jelaskan:
- Nama fitur atau alur yang spesifik.
- Kondisi implementasi sekarang.
- Kekurangan yang ditemukan.
- Dasar kebutuhan dari PDF atau temuan teknis.
- Perubahan perilaku yang harus dihasilkan.
- Komponen atau fungsi yang terdampak.
- Kriteria penerimaan dan cara pengujiannya.
- Prioritas pengerjaan.

Pisahkan penambahan fitur baru, perbaikan fitur yang sudah ada, dan penyelesaian integrasi. Jika tidak ada fitur baru yang wajib ditambahkan, katakan demikian dan sebutkan pekerjaan implementasi yang memang tersisa.

4. Kekurangan pengujian dan luaran UAS.

Daftarkan secara terpisah kebutuhan pengujian, debugging, catatan deployment, audit beserta bukti perbaikan, evaluasi arsitektur, diagram, README, laporan, presentasi, demo, dan riwayat kontribusi sesuai PDF. Jangan menyebut pekerjaan dokumentasi sebagai fitur aplikasi.

5. Keputusan tech stack dan urutan pengerjaan.

Berikan keputusan per komponen beserta alasannya. Susun pekerjaan berdasarkan ketergantungan teknis, dampak terhadap fungsi utama, dan bobot penilaian dosen. Utamakan penyelesaian kewajiban sebelum pengembangan opsional.

Tulis dalam bahasa Indonesia yang lugas. Cantumkan path dan baris kode untuk mendukung temuan teknis, tetapi jelaskan isinya agar pembaca tidak harus membuka file untuk memahami masalah. Jangan mengarang hasil, memberi pujian otomatis, atau menyatakan aman hanya karena semua tes lulus.

Hentikan setelah menyampaikan hasil pemeriksaan dan rekomendasi. Tunggu instruksi saya sebelum melakukan perubahan aplikasi.