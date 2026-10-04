# Perubahan kebijakan confidence OCR

Revisi pengguna **5 Oktober 2026 (WIB)**. Catatan implementasi teknis; bukan laporan akademik. Perubahan menggantikan gate lama yang mensyaratkan setiap atribut minimal 90%.

## Aturan yang diterapkan

Empat atribut wajib: nama, nomor ijazah, program studi, dan tanggal lulus. Ambang confidence bersama adalah **0,70**. Proses berhenti karena confidence hanya bila **keempat skor valid semuanya <0,70**. Jika satu atau lebih skor ≥0,70, gate confidence dilalui. Skor tidak dirata-ratakan untuk menentukan kelayakan.

| Confidence nama / nomor / prodi / tanggal | Hasil gate confidence |
| --- | --- |
| 85% / 65% / 60% / 55% | Lanjut |
| 60% / 70% / 50% / 65% | Lanjut, tepat 70% diterima |
| 70% / 0% / 0% / 0% | Lanjut bila keempat teks dan syarat lain valid |
| 60% / 65% / 55% / 69% | `INCONCLUSIVE`, seluruh skor di bawah 70% |

Kelulusan gate confidence masih memerlukan empat teks lengkap, kandidat tunggal, tanggal valid, template didukung, serta QR dan atribut pada halaman yang sama. Skor hilang, bukan angka, nonfinite, negatif, atau >1 ditolak sebagai `INVALID_CONFIDENCE`. Penolakan confidence kelompok memakai satu alasan `LOW_CONFIDENCE`, tanpa menunjuk satu atribut sebagai penyebab kegagalan.

Data akademik tetap mengikuti penerbit berwenang. Parser mempertahankan teks OCR dan nilai confidence valid; sistem tidak mengubah nama, nomor ijazah, prodi atau tanggal untuk mengejar skor. Normalisasi deterministik yang sudah ada tetap berlaku.

## Implementasi dan batas keputusan

- Domain menjadi sumber ambang dan kebijakan bersama. UI memakai ambang yang sama; penanda confidence field rendah hanya informasi.
- Konfigurasi OCR menjadi `tesseract-js-ind-eng-v6`. Hash konfigurasi memasukkan ambang dan kebijakan. Pembacaan ulang area D1 hanya untuk skor valid <70%, dengan kesepakatan teks persis dan confidence minimum token; skor tidak dinaikkan secara buatan.
- Parser tidak menjepit atau menyembunyikan skor invalid di antara token valid. Skor invalid tetap menyebabkan penolakan sebelum pencocokan.
- Area pembacaan ulang yang dimensinya invalid menghasilkan kegagalan teknis `OCR_FAILURE`; skor asli tidak ditimpa dengan 0 untuk menutupi kegagalan crop.
- `MATCH` memerlukan keempat hasil FHE cocok. Minimal satu hasil berbeda menghasilkan `MISMATCH`. Confidence tidak langsung menghasilkan salah satu keputusan itu.
- Penolakan OCR terjadi sebelum reservasi anggaran relayer/pengiriman transaksi. Kuota pembacaan rekaman tetap berlaku.
- Skema atribut, normalisasi, API hasil, protokol EIP-712, dan kontrak tidak memerlukan migrasi atau deployment baru.
- Pekerjaan tersimpan dengan hash OCR lama dan belum memiliki transaksi dibaca ulang dari byte unggahan asli memakai konfigurasi terbaru sebelum submit. Jika transaksi sudah disiapkan, OCR/hash/bukti lama tetap dipertahankan untuk recovery tanpa pengiriman ganda. Hasil terminal historis tetap tersimpan.

Hash konfigurasi v6: `0x84703946bb83afe03a55ab481950ea151af627e85615ad98ead4872d4a99a51d`.

Skor confidence Tesseract menggambarkan keyakinan mesin pada pembacaan, bukan probabilitas dokumen asli atau pengukuran akurasi dataset. Dengan kebijakan baru, teks yang salah terbaca masih dapat diteruskan jika satu field memenuhi ambang; FHE kemudian membandingkan teks yang terbaca itu. `MISMATCH` menjelaskan ketidaksesuaian atribut, bukan memastikan pemalsuan.

Persentase coverage `credentials` dan `OCR` di [TEST_RESULTS](TEST_RESULTS.md) adalah proporsi kode yang dieksekusi tes. Angka tersebut tidak digunakan sebagai ambang confidence dan bukan persentase keberhasilan deteksi dokumen.

## Verifikasi dan evidence

Tes domain menguji kebijakan semua-vs-satu, batas tepat 70%, invalid confidence, dan gate non-confidence. Tes parser/pembacaan ulang menguji nilai minimum token tanpa koreksi skor. Tes pipeline terkontrol menguji `MATCH`/`MISMATCH` dengan satu skor rendah dan penolakan semua skor rendah sebelum transaksi. Tes PDF/OCR lokal menggunakan mesin nyata untuk memeriksa teks dan QR.

Foto A1 sintetis pada run OCR lokal menghasilkan skor nama 94,85%, nomor ijazah 89,96%, prodi 96,06%, dan tanggal 96,54%. Empat teks dan QR tepat; gate confidence baru menerima hasil ini. Ini observasi satu fixture, bukan pengukuran tingkat akurasi dokumen umum.

Run bersih source `1413ebd424a7a914967ad6301c648c5c58842a1d`, 5 Oktober 2026 **00:46:25–00:55:30 WIB**, menghasilkan delapan perintah exit0, **515 unit/kontrak**, **9 DB**, dan **25 E2E lokal** lulus; 12 Sepolia opt-in dilewati. Coverage kode OCR97,31% dan domain94,37%; angka ini bukan confidence. [TEST_RESULTS](TEST_RESULTS.md), [konteks/log](evidence/ocr-policy-70/final/verification-context.json), dan [status](STATUS_INSTRUKSI_UAS.md) memuat hasil lengkap. Bukti Sepolia/video **4 Oktober 2026** tetap evidence historis dari kebijakan lama; jangan menyebutnya bukti pengujian kebijakan 70%. Produksi Netlify belum diubah. Langkah penerapan oleh pengguna ada di [DEMO](DEMO.md).
