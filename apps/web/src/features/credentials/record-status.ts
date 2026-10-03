import type { RecordVerificationStatus } from '@verifikasi/domain';

export const recordStatuses: Record<RecordVerificationStatus, {label: string; detail: string; tone: string}> = {
  VERIFIED_RECORD: {label: 'Rekaman ijazah terverifikasi', detail: 'Pengesahan data valid · Kredensial aktif', tone: 'success'},
  REVOKED: {label: 'Kredensial dicabut', detail: 'Penerbit telah mencabut kredensial ini.', tone: 'danger'},
  NOT_FOUND: {label: 'Rekaman tidak ditemukan', detail: 'ID ini tidak ditemukan pada jaringan yang digunakan platform.', tone: 'warning'},
  INVALID_PROOF: {label: 'Bukti kredensial tidak valid', detail: 'Data belum dapat dinyatakan sebagai rekaman resmi.', tone: 'danger'},
  ISSUER_INACTIVE: {label: 'Kewenangan penerbit tidak aktif', detail: 'Hubungi institusi penerbit untuk informasi lebih lanjut.', tone: 'warning'},
  PENDING: {label: 'Penerbitan belum selesai', detail: 'Menunggu konfirmasi penerbitan dan kelengkapan bukti.', tone: 'warning'},
  ERROR: {label: 'Verifikasi rekaman terganggu', detail: 'Pemeriksaan belum dapat dituntaskan. Silakan coba lagi.', tone: 'danger'},
};
