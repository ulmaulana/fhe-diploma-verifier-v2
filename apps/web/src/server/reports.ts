import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { accessible, publicJob } from './jobs';
import { ApiError } from './config';
import type { Job } from './types';

export async function report(job: Job) {
  if (!accessible(job) || !job.decision) throw new ApiError(410, 'REPORT_UNAVAILABLE', 'Laporan belum tersedia atau sudah dihapus.');
  const view = await publicJob(job);
  const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica); const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595.28, 841.89]); let y = 790;
  // Standard PDF font cannot represent all Unicode. Escape unsupported characters
  // explicitly instead of silently changing names or failing the entire report.
  const printable = (value: string) => Array.from(value).map(char => { try { font.encodeText(char); return char; } catch { return `\\u{${char.codePointAt(0)!.toString(16)}}`; } }).join('');
  function line(value: string, strong = false, size = 10) {
    const words = printable(value).match(/.{1,85}/g) || [''];
    for (const part of words) { if (y < 55) { page = pdf.addPage([595.28, 841.89]); y = 790; } page.drawText(part, { x: 48, y, size, font: strong ? bold : font, color: rgb(.08, .1, .13) }); y -= size + 7; }
  }
  line('verifikasi', true, 24); line('Laporan pemeriksaan ijazah', true, 15); y -= 12;
  if (job.synthetic) { line('DEMONSTRASI - DATA SINTETIS', true, 14); line('Bukan hasil OCR, FHE, atau pemeriksaan dokumen nyata.'); }
  line('Mode: DOCUMENT; cakupan: CHECKED_ATTRIBUTES');
  line(`Status rekaman: ${job.recordVerificationStatus || 'Belum diperiksa'}`);
  line(`Keputusan dokumen: ${job.decision}`, true); line(job.reason || '');
  line(`Request ID: ${job.id}`); line(`Dokumen: ${job.fileName}`); line(`Credential ID: ${job.credentialId || 'Tidak tersedia'}`);
  line(`Penerbit: ${job.issuerName || 'Tidak tersedia'}`); line(`Diperiksa: ${job.checkedAt || job.createdAt}`); line(`Halaman: ${job.verifiedPage || 'Tidak tersedia'}`); y -= 10;
  for (const field of view.fields) { line(`${field.label}: ${field.text || 'Belum terbaca'}`, true); line(`Hasil: ${field.status}; confidence OCR: ${field.confidence.toFixed(3)}`); }
  y -= 10;
  line(`SHA-256 berkas: ${job.digest || 'Tidak tersedia pada contoh'}`); line(`Upload commitment: ${job.commitment || 'Tidak tersedia pada contoh'}`); line(`Salt privat: ${job.salt || 'Tidak tersedia pada contoh'}`);
  line(`Chain ID: ${job.chainId || 'Tidak tersedia'}`); line(`Kontrak: ${job.contractAddress || 'Tidak tersedia'}`); line(`Blok status terakhir: ${job.checkedBlock ?? 'Tidak tersedia'}`);
  line(job.issuanceTxHash ? `Transaksi penerbitan: ${job.issuanceTxHash}` : 'Transaksi penerbitan: tidak tersedia');
  line(job.txHash ? `Transaksi pencocokan: ${job.txHash}` : 'Tidak ada transaksi pencocokan'); line(`Konfigurasi OCR: ${job.ocrConfigVersion || 'Tidak tersedia'}`); y -= 10;
  line('Batas hasil', true); line('Hasil berlaku untuk empat atribut yang diperiksa pada waktu di atas.');
  line('Pengesahan data kredensial diperiksa melalui status rekaman. Hasil tidak membuktikan asal kertas, seluruh unsur visual, atau signature PDF. Status dapat berubah setelah pencabutan.');
  line('Dokumen diproses di server untuk OCR. Nilai referensi tetap terenkripsi. Laporan adalah ringkasan layanan, bukan bukti trustless.');
  line('Karakter di luar font laporan ditulis sebagai kode Unicode \\u{...}.');
  return Buffer.from(await pdf.save());
}
