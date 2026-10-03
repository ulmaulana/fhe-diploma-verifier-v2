export type DocumentStatus = 'PREPARING' | 'VERIFYING' | 'ARCHIVING' | 'READY' | 'FAILED';
/** Private metadata; never returned by the public credential endpoint. */
export interface CredentialDocument {
  credentialId: string;
  issuerId: string;
  templateVersion: string;
  idempotencyKey: string;
  jobId: string;
  ownerSessionId: string;
  graduationDate: string;
  createdAt: string;
  status: DocumentStatus;
  pdfHash?: string;
  objectKey?: string;
  readyAt?: string;
  errorCode?: string;
  reason?: string;
  /** Missing on legacy documents that depended on an OCR job. READY is an archive state, not MATCH. */
  generationMethod?: 'ISSUER_DATA';
  dateSource?: 'ISSUANCE_DRAFT' | 'ISSUER_DECLARATION';
  origin?: string;
}
