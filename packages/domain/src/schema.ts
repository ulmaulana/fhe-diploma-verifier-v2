export const FIELD_KEYS = ["full_name", "diploma_number", "study_program", "graduation_date"] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];
export type DiplomaAttributes = Record<FieldKey, string>;
export type Hex32 = `0x${string}`;
export const FIELD_LABELS: Record<FieldKey, string> = {
  full_name: "Nama lengkap",
  diploma_number: "Nomor ijazah",
  study_program: "Program studi",
  graduation_date: "Tanggal lulus",
};

export const SCHEMA_VERSION = "academic-diploma-v1";
export const NORMALIZER_VERSION = "academic-normalizer-v1";
export const ATTRIBUTE_DOMAIN = "VERIFIKASI_IJAZAH_ATTR_V1";
export const ENCODING_VERSION = "sha256-euint256-v1";
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_PAGES = 5;
export const OCR_CONFIDENCE_THRESHOLD = 0.9;
export const UPLOAD_TERMINAL_TTL_MS = 60 * 60 * 1000;
export const UPLOAD_HARD_TTL_MS = 24 * 60 * 60 * 1000;
export const SESSION_HISTORY_TTL_MS = UPLOAD_HARD_TTL_MS;
export const MAX_ACTIVE_JOBS_PER_SESSION = 5;
export const MAX_CREDENTIAL_CHECKS_PER_HOUR = 20;
export const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;

export const JOB_STATUSES = ["RECEIVED", "EXTRACTING", "AWAITING_CHAIN", "AWAITING_DECRYPTION", "COMPLETED", "FAILED", "EXPIRED"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export const VERIFICATION_DECISIONS = ["MATCH", "MISMATCH", "REVOKED", "NOT_FOUND", "INVALID_PROOF", "INCONCLUSIVE", "ERROR"] as const;
export type VerificationDecision = (typeof VERIFICATION_DECISIONS)[number];
export type FieldComparison = "MATCH" | "MISMATCH" | "NOT_COMPARED";
export const DECISION_LABELS: Record<VerificationDecision, string> = {
  MATCH: "Atribut cocok",
  MISMATCH: "Ditemukan ketidaksesuaian",
  REVOKED: "Kredensial dicabut",
  NOT_FOUND: "Rekaman tidak ditemukan",
  INVALID_PROOF: "Bukti kredensial tidak valid",
  INCONCLUSIVE: "Belum dapat diverifikasi",
  ERROR: "Layanan verifikasi terganggu",
};
export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  RECEIVED: "Dokumen diterima",
  EXTRACTING: "Membaca dokumen",
  AWAITING_CHAIN: "Memeriksa rekaman dan mencocokkan atribut",
  AWAITING_DECRYPTION: "Menyiapkan hasil",
  COMPLETED: "Pemeriksaan selesai",
  FAILED: "Proses terganggu",
  EXPIRED: "Pekerjaan kedaluwarsa",
};

export function isFieldKey(value: unknown): value is FieldKey {
  return typeof value === "string" && (FIELD_KEYS as readonly string[]).includes(value);
}

export function isCredentialId(value: unknown): value is Hex32 {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

export function requireHex32(value: string, name = "value"): Hex32 {
  if (!isCredentialId(value)) throw new Error(`${name} harus berupa 32 byte heksadesimal.`);
  return value.toLowerCase() as Hex32;
}

export function isTerminalStatus(status: JobStatus): boolean {
  return status === "COMPLETED" || status === "FAILED" || status === "EXPIRED";
}

/** A terminal result never extends the original 24-hour hard limit. */
export function artifactExpiresAt(createdAt: number, terminalAt?: number | null): number {
  return Math.min(createdAt + UPLOAD_HARD_TTL_MS, terminalAt == null ? Infinity : terminalAt + UPLOAD_TERMINAL_TTL_MS);
}

export interface OcrField {
  text: string | null;
  confidence: number;
  /** One-based page number of the visible rendered document. */
  page: number;
  candidates?: string[];
  boundingBox?: { x: number; y: number; width: number; height: number };
}

export interface OcrExtraction {
  fields: Partial<Record<FieldKey, OcrField>>;
  qrCandidates: string[];
  templateId: string | null;
  pageCount: number;
  ocrConfigVersion: string;
  ocrConfigHash: Hex32;
  reason?: string;
}

export interface VerificationFieldResult {
  key: FieldKey;
  label: string;
  text: string | null;
  confidence: number | null;
  status: FieldComparison;
}

/** Public session-owned DTO; never includes issuer reference values or keys. */
export interface VerificationJobDto {
  id: string;
  requestId: string;
  status: JobStatus;
  decision: VerificationDecision | null;
  reason: string | null;
  fileName: string | null;
  fileSize: number | null;
  createdAt: string;
  expiresAt: string;
  credentialId: string | null;
  issuerName: string | null;
  fields: VerificationFieldResult[];
  mode: "DOCUMENT";
  environment: "demo" | "testnet" | "unconfigured";
  scope: "CHECKED_ATTRIBUTES";
  recordVerificationStatus: RecordVerificationStatus | null;
  documentDecision: VerificationDecision | null;
  issuanceTxHash: string | null;
  chainId: number | null;
  contractAddress: string | null;
  txHash: string | null;
  checkedAt: string | null;
  checkedBlock: number | null;
  deletedAt: string | null;
}

export const RECORD_VERIFICATION_STATUSES = ["VERIFIED_RECORD", "REVOKED", "NOT_FOUND", "INVALID_PROOF", "ISSUER_INACTIVE", "PENDING", "ERROR"] as const;
export type RecordVerificationStatus = (typeof RECORD_VERIFICATION_STATUSES)[number];
export const RECORD_STATUS_LABELS: Record<RecordVerificationStatus, string> = {
  VERIFIED_RECORD: "Rekaman ijazah terverifikasi",
  REVOKED: "Kredensial dicabut",
  NOT_FOUND: "Rekaman tidak ditemukan",
  INVALID_PROOF: "Bukti kredensial tidak valid",
  ISSUER_INACTIVE: "Kewenangan penerbit tidak aktif",
  PENDING: "Penerbitan belum selesai",
  ERROR: "Verifikasi rekaman terganggu",
};

/** Only the explicitly approved public snapshot; never graduation date or OCR. */
export interface PublicCredentialProfile {
  schemaVersion: number;
  disclosurePolicyVersion: number;
  issuerId: Hex32;
  issuerDisplayName: string;
  fullName: string;
  diplomaNumber: string;
  studyProgram: string;
}
export interface RecordVerificationResult {
  mode: "RECORD";
  environment: "demo" | "testnet";
  scope: "RECORD_ONLY";
  credentialId: string;
  recordVerificationStatus: RecordVerificationStatus;
  documentDecision: null;
  reason: string;
  profile: PublicCredentialProfile | null;
  issuerName: string | null;
  checkedAt: string;
  checkedBlock: number | null;
  chainId: number | null;
  contractAddress: string | null;
  /** True when the record was read from a server-trusted protocol v1 contract (read-only support). */
  legacyContract: boolean;
  issuanceTxHash: string | null;
  issuanceBlock: number | null;
  /** Revocation time and block come from contract state; the hash is null when its log could not be read. */
  revokedAt: string | null;
  revocationBlock: number | null;
  revocationTxHash: string | null;
  signer: string | null;
  credentialDigest: string | null;
}
