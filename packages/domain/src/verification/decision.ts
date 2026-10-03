import { FIELD_KEYS, type FieldComparison, type FieldKey, type VerificationDecision, type RecordVerificationStatus } from "../schema";

export interface DecisionInput {
  uploadPresent: boolean;
  qrValid: boolean;
  targetMatches?: boolean;
  chainReadSucceeded: boolean;
  recordFound: boolean;
  revoked: boolean;
  issuerAuthorized: boolean | null;
  ocrEligible: boolean;
  fieldMatches?: Partial<Record<FieldKey, boolean>>;
  technicalError?: string;
  recordVerificationStatus: RecordVerificationStatus | null;
}
export interface DecisionResult {
  decision: VerificationDecision;
  reason: string;
  fields: Record<FieldKey, FieldComparison>;
}

/** Called with the final confirmed chain snapshot, after decryption when applicable. */
export function decideVerification(input: DecisionInput): DecisionResult {
  const fields = Object.fromEntries(FIELD_KEYS.map((key) => [key, "NOT_COMPARED"])) as Record<FieldKey, FieldComparison>;
  const result = (decision: VerificationDecision, reason: string): DecisionResult => ({ decision, reason, fields });
  if (!input.uploadPresent) return result("INCONCLUSIVE", "Unggah dokumen untuk mencocokkan atribut. QR hanya menunjuk rekaman.");
  if (!input.qrValid || input.targetMatches === false) return result("INCONCLUSIVE", "QR pada dokumen belum valid atau berbeda dengan rekaman tujuan.");
  if (input.chainReadSucceeded && input.recordFound && input.revoked) return result("REVOKED", "Penerbit telah mencabut kredensial ini.");
  if (input.technicalError) return result("ERROR", "Layanan verifikasi terganggu. Silakan coba lagi dengan aman.");
  if (!input.chainReadSucceeded) return result("ERROR", "Status blockchain belum berhasil dibaca. Silakan coba lagi.");
  if (!input.recordFound) return result("NOT_FOUND", "Rekaman tidak ditemukan setelah pemeriksaan blockchain berhasil.");
  if (input.recordVerificationStatus === "INVALID_PROOF") return result("INVALID_PROOF", "Bukti pengesahan rekaman tidak valid. Pencocokan tidak dilanjutkan.");
  if (input.recordVerificationStatus === "ERROR") return result("ERROR", "Bukti rekaman belum dapat diperiksa karena layanan terganggu.");
  if (input.recordVerificationStatus !== "VERIFIED_RECORD") return result("INCONCLUSIVE", "Rekaman belum terverifikasi atau penerbitan masih menunggu konfirmasi.");
  if (input.issuerAuthorized !== true) return result("INCONCLUSIVE", "Kewenangan penerbit belum dapat dikonfirmasi atau telah dinonaktifkan.");
  if (!input.ocrEligible) return result("INCONCLUSIVE", "Empat atribut wajib belum terbaca secara pasti. Unggah dokumen yang lebih jelas.");
  if (!input.fieldMatches || FIELD_KEYS.some((key) => typeof input.fieldMatches?.[key] !== "boolean")) {
    return result("ERROR", "Hasil pencocokan terenkripsi belum lengkap.");
  }
  for (const key of FIELD_KEYS) fields[key] = input.fieldMatches[key] ? "MATCH" : "MISMATCH";
  return FIELD_KEYS.every((key) => input.fieldMatches![key])
    ? result("MATCH", "Keempat atribut cocok dengan rekaman penerbit yang berwenang. Kredensial aktif.")
    : result("MISMATCH", "Setidaknya satu atribut berbeda. Periksa unggahan atau hubungi penerbit.");
}
