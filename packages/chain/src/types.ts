import type { DiplomaAttributes, FieldKey } from '@verifikasi/domain';

export interface ChainConfig {
  rpcUrl: string;
  chainId: number;
  contractAddress: string;
  confirmations?: number;
  deploymentBlock?: number;
}
export interface IssuerMetadata {
  wallet: string;
  issuerId: string;
  name: string;
  active: boolean;
  exists: boolean;
  signerActive: boolean;
  authorizationId: string;
}
/** Portal list row; the full CredentialMetadata verification is reserved for the record page. */
export interface CredentialSummary {
  credentialId: string;
  issuedAt: string;
  revoked: boolean;
  confirmed: boolean;
}
export interface CredentialMetadata {
  credentialId: string;
  issuer: string;
  issuerId: string;
  signer: string;
  issuerName: string;
  issuerActive: boolean;
  revoked: boolean;
  issuedAt: string;
  revokedAt: string | null;
  schemaVersion: number;
  encodingVersion: number;
  disclosurePolicyVersion: number;
  credentialDigest: string;
  publicDataHash: string;
  encryptedAttributesHash: string;
  issuerNameHash: string;
  signerAuthorizationId: string;
  historicalSignerAuthorized: boolean;
  issuanceBlock: number;
  issuanceTransactionHash: string;
  revocationBlock: number | null;
  /** False when issuance exists at the head but not yet at the confirmed block. */
  confirmed: boolean;
  checkedBlockHash: string;
  checkedBlock: number;
  checkedAt: string;
  chainId: number;
  contractAddress: string;
}
export interface VerificationInput {
  requestId: string;
  credentialId: string;
  attributes: DiplomaAttributes;
  uploadCommitment: string;
  ocrConfigHash: string;
  transactionHash?: string;
  serializedTransaction?: string;
  onPreparedTransaction?: (transaction: { hash: string; serialized: string }) => Promise<void>;
  onTransaction?: (hash: string) => Promise<void>;
  /** Fence deletion, workflow generation and the distributed relayer lease before broadcasting. */
  beforeBroadcast?: () => Promise<void>;
}
export interface ResumeComparisonInput {
  requestId: string;
  credentialId: string;
  uploadCommitment: string;
  transactionHash: string;
  serializedTransaction: string;
  beforeBroadcast?: () => Promise<void>;
}
export interface VerificationOutput {
  matches: Record<FieldKey, boolean>;
  allMatch: boolean;
  metadata: CredentialMetadata;
  transactionHash: string;
  chainId: number;
  contractAddress: string;
  checkedBlock: number;
  checkedAt: string;
}
