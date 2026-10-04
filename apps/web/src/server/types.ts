import type { FieldKey, RecordVerificationStatus } from '@verifikasi/domain';
import type { CredentialAuthorization, CredentialDomain, CredentialPublicProfile, SignedCredential } from '@verifikasi/credentials';

export type JobStatus = 'RECEIVED' | 'EXTRACTING' | 'AWAITING_CHAIN' | 'AWAITING_DECRYPTION' | 'COMPLETED' | 'FAILED' | 'EXPIRED';
export type Decision = 'MATCH' | 'MISMATCH' | 'REVOKED' | 'NOT_FOUND' | 'INVALID_PROOF' | 'INCONCLUSIVE' | 'ERROR';
export type ResultField = { key: FieldKey; label: string; text: string | null; confidence: number | null; status: 'MATCH' | 'MISMATCH' | 'NOT_COMPARED' };
/** Preserve zero as a real score; unavailable or invalid scores are never coerced to zero. */
export function resultConfidence(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}
export interface Job {
  id: string; owner: string; idempotencyKey: string; status: JobStatus; decision?: Decision; reason?: string;
  fileName: string; fileSize: number; mimeType: string; createdAt: string; expiresAt: string; artifactsExpireAt: string;
  deletedAt?: string; artifactsDeletedAt?: string; credentialId?: string; expectedCredentialId?: string;
  digest?: string; salt?: string; commitment?: string; mode: 'demo' | 'testnet'; synthetic: boolean;
  issuerName?: string; checkedAt?: string; checkedBlock?: number; chainId?: number; contractAddress?: string; txHash?: string;
  attempts: number; nextAttemptAt?: string; leaseToken?: string; leaseUntil?: string;
  ocrConfigHash?: string; ocrConfigVersion?: string; verifiedPage?: number;
  workflowToken?: string; workflowRunId?: string; dispatchLeaseUntil?: string;
  netlifyRunUntil?: string; netlifyAttempts?: number;
  txBroadcasted?: boolean;
  recordVerificationStatus?: RecordVerificationStatus;
  issuanceTxHash?: string;
  archiveCredentialId?: string;
  diagnosticCode?: string;
}
export interface Session { id: string; csrf: string; expiresAt: string; wallet?: string; challenge?: string; challengeExpiresAt?: string; }
export interface UploadIntent {
  id: string; owner: string; idempotencyKey: string; pathname: string; fileName: string; fileSize: number; mimeType: string;
  clientDigest: string; expectedCredentialId?: string; createdAt: string; expiresAt: string; jobId?: string; deletedAt?: string;
}
export interface CredentialDraft {
  credentialId: string; ownerWallet: string; domain: CredentialDomain;
  authorization: CredentialAuthorization; profile: CredentialPublicProfile;
  createdAt: string; expiresAt: string;
  /** Private issuer input, frozen with this draft; never included in the public proof. */
  documentDate?: string;
}
export interface StoredCredential {
  credentialId: string; ownerWallet: string; signed: SignedCredential;
  issuanceTxHash: string | null; createdAt: string;
  documentDate?: string;
}
export interface State { credentialDocuments?: Record<string, import('./document-types').CredentialDocument>; sessions: Record<string, Session>; jobs: Record<string, Job>; uploadIntents?: Record<string, UploadIntent>; credentialDrafts?: Record<string, CredentialDraft>; signedCredentials?: Record<string, StoredCredential>; rates: Record<string, { count: number; resetAt: number }>; relayerBudget?: { windowEndsAt: number; jobs: string[] }; audit: { action: string; objectId: string; at: string }[]; }
export type { Extraction } from '@verifikasi/ocr';
export const TERMINAL: JobStatus[] = ['COMPLETED', 'FAILED', 'EXPIRED'];
export const FIELD_LABELS: Record<FieldKey, string> = { full_name: 'Nama lengkap', diploma_number: 'Nomor ijazah', study_program: 'Program studi', graduation_date: 'Tanggal lulus' };
