export const guideCategories = ['Semua', 'Memulai', 'Cara kerja', 'Blockchain & FHE', 'Dokumen & QR', 'Memahami hasil', 'Data & privasi', 'Penerbit'] as const;
export interface GuideArticle {
  id: string;
  category: Exclude<typeof guideCategories[number], 'Semua'>;
  title: string;
  body: string;
  steps?: string[];
  keywords?: string;
  sources?: { label: string; href: string }[];
}

export const articles: GuideArticle[] = [
  {id:'mulai',category:'Memulai',title:'Bagaimana cara memverifikasi ijazah?',body:'Pindai QR ijazah memakai kamera HP. Halaman rekaman langsung memeriksa e-sign, pengikatan data publik, penerbit, dan status pencabutan tanpa akun, wallet, atau unggahan. Cocokkan nama, nomor ijazah, program studi, dan institusi di halaman dengan dokumen yang Anda periksa. Untuk pencocokan otomatis, pilih Periksa dokumen lebih lanjut.'},
  {id:'qr',category:'Dokumen & QR',title:'Apakah QR saja cukup untuk verifikasi?',body:'QR cukup untuk memeriksa rekaman penerbit. Isi kertas belum dibandingkan otomatis. QR Andi yang ditempel pada ijazah Budi tetap membuka data Andi; bandingkan data yang tampil dengan dokumen Anda. Pilihan unggahan memakai OCR dan FHE untuk mencocokkan empat atribut.'},
  {id:'unggahan',category:'Dokumen & QR',title:'Seperti apa foto atau scan yang dapat dibaca?',body:'Gunakan satu PDF, JPG, atau PNG maksimal 10 MiB dan 5 halaman. Foto harus terang, fokus, tanpa pantulan, dan memperlihatkan seluruh halaman. QR serta nama, nomor ijazah, program studi, dan tanggal lulus wajib berada pada halaman yang sama. Jangan mengunggah PDF berpassword. Pembacaan saat ini mendukung PDF keluaran portal (template D1) serta template uji A1 dan B1. Dokumen dengan tata letak lain dapat berakhir belum dapat diverifikasi.'},
  {id:'rekaman',category:'Memahami hasil',title:'Apa arti Rekaman ijazah terverifikasi?',body:'Signature kredensial valid, data publik sesuai bukti on-chain, kewenangan kampus aktif, dan kredensial belum dicabut pada saat pemeriksaan. Cakupannya RECORD_ONLY: rekaman penerbit. Ini belum merupakan hasil pencocokan otomatis dokumen di tangan Anda.'},
  {id:'hasil',category:'Memahami hasil',title:'Apa arti “Atribut cocok”?',body:'Empat atribut pada unggahan terbaca dengan kualitas memadai dan cocok dengan referensi terenkripsi. Rekaman juga telah disahkan dan aktif pada saat pemeriksaan. Cakupannya CHECKED_ATTRIBUTES. Hasil ini tidak membuktikan keaslian kertas, seluruh unsur visual, atau tanda tangan pada kertas. Salinan dengan atribut yang sama juga dapat cocok.'},
  {id:'esign',category:'Penerbit',title:'Apa yang disahkan oleh e-sign?',body:'Wallet pejabat kampus yang terdaftar menandatangani data kredensial: identitas rekaman, profil publik, dan referensi terenkripsi yang telah ditinjau. Pengesahan pesan dan transaksi penerbitan merupakan dua langkah terpisah. Prototipe ini tidak menambahkan gambar tanda tangan atau sertifikasi tanda tangan PDF.'},
  {id:'berbeda',category:'Memahami hasil',title:'Apa yang dilakukan jika atribut berbeda?',body:'Periksa unggahan dan atribut yang ditandai berbeda. Hubungi institusi penerbit jika ada kesalahan data. Sistem tidak otomatis memberi label palsu dan tidak memperlihatkan nilai referensi privat. Pemeriksa tidak dapat mengubah hasil OCR secara manual.'},
  {id:'bukti',category:'Memahami hasil',title:'Apa arti Bukti kredensial tidak valid?',body:'Payload, signature, atau snapshot publik tidak sesuai dengan bukti penerbitan. Data tersebut tidak ditampilkan sebagai rekaman resmi dan tidak diteruskan untuk pencocokan FHE. Jika penyedia bukti atau jaringan sedang tidak tersedia, statusnya Verifikasi rekaman terganggu, bukan Rekaman tidak ditemukan.'},
  {id:'ocr',category:'Memahami hasil',title:'Mengapa hasil belum dapat diverifikasi?',body:'QR atau atribut belum terbaca memadai, terdapat kandidat ganda, format tidak didukung, tanggal ambigu, atau kewenangan kampus tidak aktif. Periksa alasan yang ditampilkan. Untuk masalah pembacaan, unggah ulang dokumen yang lebih jelas. Confidence OCR bukan probabilitas bahwa bacaan pasti benar.'},
  {id:'pencabutan',category:'Memahami hasil',title:'Apa arti kredensial dicabut?',body:'Penerbit telah mencabut rekaman. Status ini mengalahkan kecocokan atribut dan tidak dapat dibatalkan dalam prototipe. Koreksi memerlukan penerbitan kredensial baru. Pencabutan dan kewenangan penerbit nonaktif tidak dengan sendirinya berarti signature kriptografis rusak. Pemeriksaan berikutnya dapat berubah setelah pencabutan.'},
  {id:'privasi',category:'Data & privasi',title:'Siapa yang dapat membaca data dokumen?',body:'Nama, nomor ijazah, program studi, dan institusi pada profil publik yang disahkan dapat dibaca siapa pun yang membuka tautan QR. Tanggal lulus tidak ditampilkan pada profil publik. Worker OCR tepercaya membaca unggahan di server; referensi untuk perbandingan FHE tetap terenkripsi. Laporan unggahan dan hasil OCR hanya tersedia untuk sesi pemilik.'},
  {id:'hapus',category:'Data & privasi',title:'Kapan data dihapus?',body:'Akses unggahan, hasil OCR, dan laporan berakhir 1 jam setelah pekerjaan selesai, paling lambat 24 jam sejak unggah. Penghapusan berkas berjalan terjadwal dan dapat tertunda saat layanan terganggu. Metadata riwayat tersedia maksimal 24 jam. Anda dapat menghapus lebih awal dari Riwayat Saya. Payload e-sign serta profil publik penerbitan disimpan terpisah agar halaman QR tetap berfungsi. Penghapusan unggahan tidak menghapus rekaman tersebut atau blockchain.'},
  {id:'laporan',category:'Memahami hasil',title:'Apa yang tercantum dalam laporan?',body:'Laporan unggahan mencantumkan cakupan CHECKED_ATTRIBUTES, status rekaman, hasil setiap atribut, identitas berkas dan pekerjaan, waktu, serta transaksi penerbitan dan pencocokan secara terpisah. Halaman QR hanya merangkum bukti rekaman dengan cakupan RECORD_ONLY. Keduanya merupakan hasil pada waktu pemeriksaan; tidak ada hasil OCR atau transaksi yang dikarang.'},
  {id:'gagal',category:'Memulai',title:'Apa yang dilakukan jika layanan terganggu?',body:'Pilih Periksa ulang rekaman pada halaman QR atau Coba lagi pada pekerjaan unggahan selama dokumen masih tersedia. Gangguan OCR tidak menghentikan verifikasi QR jika bukti penerbitan dan jaringan tersedia. Memuat ulang halaman tidak membatalkan pekerjaan unggahan; buka Riwayat Saya untuk melanjutkan.'},
  {id:'penerbit',category:'Penerbit',title:'Bagaimana kampus menerbitkan rekaman?',body:'Institusi dan wallet penandatangan harus sudah diaktifkan oleh administrator. Buka Portal Penerbitan Ijazah Mahasiswa, lalu ikuti langkah berikut. Kunci privat tidak pernah diminta melalui formulir.',steps:['Isi nama mahasiswa, nomor ijazah, program studi, dan tanggal lulus.','Tinjau data publik yang akan disahkan. Perubahan data memerlukan peninjauan ulang.','Sahkan kredensial melalui permintaan tanda tangan pesan di wallet.','Kirim transaksi penerbitan dan tunggu konfirmasi jaringan serta penyimpanan bukti.','Unduh PDF setelah pembuatan, pemeriksaan, dan pengarsipan selesai. Rekaman juga tersedia di tab Data Ijazah Mahasiswa.']},
  {
    id:'alur',category:'Cara kerja',title:'Bagaimana alur verifikasi dokumen di balik layar?',
    body:'Pencocokan otomatis dimulai setelah Anda mengunggah dokumen lengkap. Membuka QR saja hanya memeriksa rekaman penerbit. Jika suatu tahap tidak memenuhi syarat, sistem menampilkan alasannya dan tidak melanjutkan seolah-olah dokumen cocok.',
    keywords:'alur proses langkah teknologi sistem bekerja belakang layar otomatis',
    steps:['OCR membaca tulisan dan QR pada PDF atau gambar, lalu mengambil empat atribut ijazah.','QR menentukan rekaman tujuan. Sistem memeriksa bukti pengesahan, kewenangan penerbit, dan status kredensial.','Hasil bacaan yang memenuhi kualitas diseragamkan formatnya, diubah menjadi hash, lalu dienkripsi.','Smart contract meminta pencocokan empat atribut terenkripsi menggunakan Zama FHEVM.','Layanan berwenang membuka hasil cocok atau berbeda, memeriksa ulang status rekaman, lalu menampilkan hasil dan laporan.'],
  },
  {
    id:'blockchain',category:'Blockchain & FHE',title:'Blockchain apa yang digunakan aplikasi ini?',
    body:'Versi aplikasi ini menggunakan Ethereum Sepolia, jaringan uji Ethereum dengan chain ID 11155111. Smart contract VerifikasiIjazah mencatat kewenangan institusi, penerbitan, pencabutan, serta permintaan pencocokan. Fitur pencocokan terenkripsi menggunakan Zama FHEVM yang diintegrasikan ke kontrak. Penerbitan dan pemeriksaan blockchain memerlukan konfigurasi testnet yang aktif.',
    keywords:'blockchain jaringan ethereum chain network teknologi dipakai digunakan pakai',
    sources:[{label:'Ethereum: jaringan dan testnet',href:'https://ethereum.org/developers/docs/networks/'}],
  },
  {
    id:'sepolia',category:'Blockchain & FHE',title:'Apa fungsi Sepolia dan mengapa memakai testnet?',
    body:'Sepolia menyediakan jaringan uji untuk menjalankan kontrak dan mengonfirmasi transaksi aplikasi ini. Pengembang dapat menguji penerbitan, pencabutan, dan pencocokan sebelum penggunaan produksi. Sepolia terpisah dari Ethereum Mainnet: saldo dan riwayat transaksi keduanya berbeda. ETH Sepolia digunakan untuk biaya transaksi uji; pengujian ini tidak memerlukan ETH Mainnet.',
    keywords:'sepolia testnet mainnet jaringan uji fungsi peran ethereum',
    sources:[{label:'Ethereum: Sepolia',href:'https://ethereum.org/developers/docs/networks/#sepolia'}],
  },
  {
    id:'zama',category:'Blockchain & FHE',title:'Apa fungsi Zama FHE dan FHEVM?',
    body:'Fully Homomorphic Encryption (FHE) memungkinkan perhitungan atas nilai yang tetap terenkripsi. FHEVM adalah teknologi Zama untuk mengintegrasikan kemampuan ini dengan smart contract. Dalam aplikasi ini, hash setiap atribut hasil OCR dienkripsi dan dibandingkan dengan referensi terenkripsi milik penerbit. Hasilnya menunjukkan cocok atau berbeda, bukan membuka nilai referensi privat. OCR tetap membaca unggahan di server sebelum tahap enkripsi.',
    keywords:'zama zamafhe fhe fhevm fungsi kegunaan homomorphic enkripsi terenkripsi rahasia',
    sources:[{label:'Zama: FHE pada blockchain',href:'https://docs.zama.org/protocol/protocol/overview'}],
  },
  {
    id:'peran-jaringan',category:'Blockchain & FHE',title:'Apa perbedaan peran Sepolia dan Zama?',
    body:'Sepolia menjadi jaringan tempat kontrak aplikasi dan transaksi dicatat. Zama menyediakan kemampuan komputasi terenkripsi yang dipakai kontrak untuk pencocokan. Keduanya bekerja bersama: Sepolia mengonfirmasi transaksi, sedangkan infrastruktur Zama menangani operasi FHE dan akses dekripsi sesuai kewenangan. Zama bukan alat pembaca PDF; pembacaan dokumen dilakukan oleh OCR.',
    keywords:'beda perbedaan hubungan sepolia zama peran fungsi jaringan',
    sources:[{label:'Ethereum: Sepolia',href:'https://ethereum.org/developers/docs/networks/#sepolia'},{label:'Zama: protokol FHE',href:'https://docs.zama.org/protocol/protocol/overview'}],
  },
  {
    id:'kontrak',category:'Blockchain & FHE',title:'Apa tugas smart contract VerifikasiIjazah?',
    body:'Smart contract adalah program yang menjalankan aturan aplikasi di blockchain. Kontrak VerifikasiIjazah memeriksa kewenangan penandatangan, menyimpan identitas dan bukti pengikat kredensial, mencatat pencabutan, serta meminta perbandingan atribut terenkripsi. Kontrak tidak membaca tulisan pada gambar atau menilai kualitas foto; tugas tersebut dilakukan sebelum permintaan pencocokan dikirim.',
    keywords:'smart contract kontrak solidity registry aturan program',
  },
  {
    id:'ocr-proses',category:'Cara kerja',title:'Apa fungsi OCR dan data apa yang dibaca?',
    body:'OCR mengubah tulisan pada gambar dokumen menjadi teks. Aplikasi menggunakan Tesseract.js untuk membaca nama lengkap, nomor ijazah, program studi, dan tanggal lulus. PDF dirender terlebih dahulu, dan QR dibaca untuk menentukan rekaman tujuan. Sistem memeriksa kualitas bacaan dan format dokumen. OCR tidak otomatis membetulkan bacaan agar sama dengan referensi penerbit.',
    keywords:'ocr tesseract membaca ekstraksi tulisan teks empat atribut',
  },
  {
    id:'hash',category:'Cara kerja',title:'Mengapa data dinormalisasi, di-hash, lalu dienkripsi?',
    body:'Normalisasi menyeragamkan format teks dan tanggal agar perbedaan penulisan yang diizinkan tidak langsung dianggap berbeda. Setiap atribut kemudian diubah menjadi hash SHA-256 yang juga terikat pada identitas kredensial, lalu hash tersebut dienkripsi untuk pencocokan FHE. Hash dan enkripsi memiliki fungsi berbeda: hash menghasilkan nilai pembanding, sedangkan enkripsi melindungi nilai itu saat diproses. Normalisasi tidak mengganti nama atau tanggal yang salah dengan data penerbit.',
    keywords:'normalisasi hash hashing sha256 sha 256 format tanggal enkripsi pembanding',
  },
  {
    id:'penyimpanan',category:'Data & privasi',title:'Apakah seluruh PDF dan data mahasiswa disimpan di blockchain?',
    body:'Berkas PDF dan gambar unggahan disimpan di penyimpanan privat aplikasi, bukan dimasukkan utuh ke blockchain. Kontrak menyimpan metadata kredensial, hash pengikat bukti, dan referensi nilai terenkripsi. Profil publik yang disahkan, seperti nama dan program studi, disediakan aplikasi melalui halaman QR. Karena itu, penggunaan FHE tidak berarti semua informasi mahasiswa tersembunyi: tanggal lulus bersifat privat, sedangkan atribut profil publik memang dapat dilihat.',
    keywords:'penyimpanan pdf dokumen onchain offchain on chain off chain database storage publik privat',
  },
  {
    id:'relayer',category:'Blockchain & FHE',title:'Apa itu relayer dan siapa yang membuka hasil pencocokan?',
    body:'Relayer aplikasi mengirim transaksi pencocokan untuk pekerjaan unggahan, sehingga pemeriksa tidak perlu menandatangani transaksi lewat wallet pribadi. Layanan pembaca hasil yang diberi kewenangan membuka nilai hasil cocok atau berbeda. Layanan ini bukan membuka kembali nilai referensi ijazah milik penerbit. SDK dan layanan Zama membantu proses enkripsi serta dekripsi sesuai izin kontrak.',
    keywords:'relayer result reader pembaca hasil dekripsi decrypt layanan server',
    sources:[{label:'Zama: izin akses dan dekripsi',href:'https://docs.zama.org/protocol/protocol/overview/hostchain'}],
  },
  {
    id:'gas',category:'Blockchain & FHE',title:'Siapa yang membayar gas dan apakah perlu ETH Sepolia?',
    body:'Transaksi yang dikirim dari wallet penerbit, seperti penerbitan dan pencabutan, memerlukan ETH Sepolia pada wallet pengirim. Untuk pencocokan dokumen unggahan, transaksi dikirim oleh relayer aplikasi dan biaya jaringannya ditanggung wallet relayer. Membuka halaman rekaman QR tidak meminta transaksi dari wallet pemeriksa. Menandatangani pesan pengesahan berbeda dari mengirim transaksi penerbitan.',
    keywords:'gas biaya eth saldo sepolia faucet bayar transaksi dana',
    sources:[{label:'Ethereum: testnet dan ETH uji',href:'https://ethereum.org/developers/docs/networks/#ethereum-testnets'}],
  },
  {
    id:'wallet',category:'Memulai',title:'Apakah pemeriksa dan mahasiswa harus menghubungkan wallet?',
    body:'Membuka rekaman QR dan mengunggah dokumen untuk pemeriksaan tidak memerlukan wallet pribadi. Wallet diperlukan oleh penandatangan institusi untuk masuk ke portal dan melakukan penerbitan atau tindakan yang berwenang. Wallet yang terhubung belum tentu memiliki izin: institusi serta penandatangan harus aktif, dan jaringan harus sesuai. Sesi laporan unggahan terpisah dari sesi wallet penerbit.',
    keywords:'wallet wajib perlu mahasiswa pemeriksa akun login hubungkan koneksi dompet',
  },
  {
    id:'portal',category:'Penerbit',title:'Apa perbedaan tiga tab pada Portal Penerbit?',
    body:'Ketiga tab memisahkan administrasi, penerbitan baru, dan pengelolaan ijazah yang sudah terbit. Pengaturan institusi dan penandatangan hanya tersedia untuk administrator.',
    keywords:'portal tab menu kategori institusi mahasiswa administrasi data ijazah',
    steps:['Portal Kredensial Institusi: atur data institusi, status aktif, dan kewenangan wallet penandatangan.','Portal Penerbitan Ijazah Mahasiswa: isi dan tinjau data, sahkan kredensial, kirim penerbitan, lalu unduh ijazah.','Data Ijazah Mahasiswa: lihat daftar rekaman dan status, buat atau unduh PDF, serta cabut kredensial bila diperlukan.'],
  },
  {
    id:'pdf',category:'Penerbit',title:'Bagaimana membuat dan mengunduh PDF ijazah yang sudah terbit?',
    body:'PDF dibuat dari profil rekaman yang disahkan dan tanggal lulus dari penerbit, lalu disimpan sebagai arsip privat. Unduhan tidak bergantung pada skor OCR. Pembuatan PDF tidak menerbitkan ulang kredensial: ID dan QR tetap sama. Arsip hanya dapat diakses penandatangan aktif dari institusi pemilik. Status siap diunduh bukan hasil verifikasi dokumen unggahan.',
    keywords:'buat cetak unduh pdf ijazah arsip download dokumen siap',
    steps:['Masuk dengan wallet penandatangan aktif dan buka tab Data Ijazah Mahasiswa.','Pada rekaman yang dituju, pilih Buat PDF ijazah. Tanggal diambil dari draf penerbitan privat. Untuk rekaman lama, masukkan tanggal lulus yang sama dengan data penerbitan.','Server memeriksa bukti penerbitan, membuat PDF dari data penerbit, lalu menyimpan arsip privat. Pembuatan PDF tidak memerlukan OCR atau transaksi pencocokan FHE.','Pilih Unduh PDF setelah status siap. Jika penyimpanan terganggu, pilih Coba kembali. Untuk memeriksa isi berkas, unggah PDF melalui halaman verifikasi.'],
  },
  {
    id:'konfirmasi',category:'Memahami hasil',title:'Mengapa proses menunggu konfirmasi atau hasil FHE cukup lama?',
    body:'Pencocokan memerlukan pembacaan dokumen, konfirmasi transaksi, komputasi terenkripsi, dan dekripsi hasil. Durasi bergantung pada dokumen serta ketersediaan RPC, jaringan, dan layanan Zama. Status menunggu bukan berarti dokumen cocok atau gagal. Pesan FHE_UNAVAILABLE menunjukkan kendala layanan pada tahap FHE; coba kembali sesuai petunjuk. Rekaman yang sudah terbit dapat tetap tercatat meskipun pembuatan PDF belum selesai.',
    keywords:'menunggu pending konfirmasi fhe unavailable lama antrian proses transaksi',
  },
  {
    id:'demo',category:'Memulai',title:'Apa perbedaan mode demo dan mode testnet?',
    body:'Contoh hasil pada mode demo memakai data sintetis untuk memperkenalkan tampilan. Unggahan dapat menjalani OCR nyata, tetapi mode demo tidak menyatakan kecocokan blockchain resmi. Mode testnet memakai kontrak dan layanan pencocokan yang dikonfigurasi untuk Sepolia serta Zama. Aplikasi ini masih berupa prototipe; hasil kecocokan empat atribut tidak sama dengan penetapan keaslian seluruh dokumen.',
    keywords:'demo demonstrasi simulasi contoh sintetis testnet prototipe batasan',
  },
  {
    id:'koreksi',category:'Penerbit',title:'Bagaimana memperbaiki data ijazah yang sudah diterbitkan?',
    body:'Data kredensial yang telah diterbitkan tidak diedit langsung melalui formulir penerbitan. Penandatangan berwenang dapat mencabut rekaman yang salah, kemudian menerbitkan kredensial baru dengan data yang benar. Pencabutan bersifat permanen dalam prototipe ini. Membuat ulang PDF dari rekaman lama tidak mengubah data yang sudah disahkan. Jika kesalahan hanya pada pembacaan unggahan, periksa kualitas dokumen terlebih dahulu.',
    keywords:'koreksi edit ubah perbaiki salah data terbit revisi mahasiswa',
  },
  {
    id:'riwayat',category:'Memulai',title:'Di mana melihat kembali pemeriksaan dan laporan saya?',
    body:'Buka Riwayat Saya pada browser dan sesi yang sama untuk melihat pekerjaan pemeriksaan dokumen. Selama masih tersedia, Anda dapat membuka hasil, mengunduh laporan, atau mencoba ulang pekerjaan yang terganggu. Riwayat pemeriksaan berbeda dari tab Data Ijazah Mahasiswa, yang berisi rekaman terbit milik institusi. Menghapus data browser, berganti sesi, atau melewati masa akses dapat membuat laporan lama tidak dapat dibuka.',
    keywords:'riwayat history pemeriksaan sesi browser laporan lanjut hasil lama',
  },
];
