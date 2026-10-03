import type { VerificationDecision as Decision, JobStatus, VerificationFieldResult, RecordVerificationStatus } from '@verifikasi/domain';
export type { Decision, JobStatus };
export interface VerificationJob {
  id:string; requestId:string; status:JobStatus; decision?:Decision; reason?:string;
  fileName:string; fileSize:number; createdAt:string; expiresAt:string; artifactsExpireAt:string;
  deletedAt?:string; artifactsDeletedAt?:string; credentialId?:string; issuerName?:string;
  fields:VerificationFieldResult[]; mode:'DOCUMENT'; environment:'demo'|'testnet'; synthetic:boolean; chainId?:number; contractAddress?:string;
  recordVerificationStatus:RecordVerificationStatus|null; documentDecision:Decision|null; scope:'CHECKED_ATTRIBUTES';
  issuanceTxHash?:string|null; txHash?:string; checkedAt?:string; checkedBlock?:number; reportAvailable:boolean;
}
export const decisions: Record<Decision,{label:string;detail:string;tone:string}> = {
  MATCH:{label:'Atribut cocok',detail:'Kredensial aktif',tone:'success'},
  MISMATCH:{label:'Ditemukan ketidaksesuaian',detail:'Periksa atribut yang berbeda',tone:'warning'},
  REVOKED:{label:'Kredensial dicabut',detail:'Rekaman sudah tidak berlaku',tone:'danger'},
  NOT_FOUND:{label:'Rekaman tidak ditemukan',detail:'Tidak tersedia pada platform ini',tone:'warning'},
  INVALID_PROOF:{label:'Bukti kredensial tidak valid',detail:'Pencocokan memerlukan bukti penerbitan yang sah',tone:'danger'},
  INCONCLUSIVE:{label:'Belum dapat diverifikasi',detail:'Pembacaan dokumen belum memadai',tone:'warning'},
  ERROR:{label:'Layanan verifikasi terganggu',detail:'Silakan coba lagi',tone:'danger'}
};
export const stages: Record<JobStatus,string> = {RECEIVED:'Menunggu pembacaan dokumen',EXTRACTING:'Membaca dokumen',AWAITING_CHAIN:'Memeriksa rekaman & mencocokkan atribut',AWAITING_DECRYPTION:'Menyiapkan hasil',COMPLETED:'Selesai',FAILED:'Proses terganggu',EXPIRED:'Pekerjaan kedaluwarsa'};
export const isRunning = (status:JobStatus) => !['COMPLETED','FAILED','EXPIRED'].includes(status);
