import { TypedDataEncoder, getAddress, type TypedDataDomain, type TypedDataField } from "ethers";
import type { Hex32 } from "../schema";

export const ATTESTATION_DOMAIN_NAME = "VerifikasiIjazah";
export const ATTESTATION_DOMAIN_VERSION = "1";
export const ATTESTATION_TYPES: Record<string, TypedDataField[]> = {
  Verification: [
    { name: "requestId", type: "bytes32" },
    { name: "credentialId", type: "bytes32" },
    { name: "uploadCommitment", type: "bytes32" },
    { name: "schemaVersion", type: "string" },
    { name: "encodingVersion", type: "string" },
    { name: "normalizerVersion", type: "string" },
    { name: "ocrConfigHash", type: "bytes32" },
    { name: "inputHandlesHash", type: "bytes32" },
    { name: "relayer", type: "address" },
    { name: "resultReader", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

export interface VerificationAttestation {
  requestId: Hex32;
  credentialId: Hex32;
  uploadCommitment: Hex32;
  schemaVersion: string;
  encodingVersion: string;
  normalizerVersion: string;
  ocrConfigHash: Hex32;
  inputHandlesHash: Hex32;
  relayer: string;
  resultReader: string;
  nonce: bigint | string;
  /** Unix timestamp in seconds. */
  deadline: bigint | string;
}

export function attestationDomain(chainId: number | bigint, verifyingContract: string): TypedDataDomain {
  if (BigInt(chainId) <= 0n) throw new Error("chainId must be positive.");
  return {
    name: ATTESTATION_DOMAIN_NAME,
    version: ATTESTATION_DOMAIN_VERSION,
    chainId,
    verifyingContract: getAddress(verifyingContract),
  };
}

export function hashAttestation(attestation: VerificationAttestation, chainId: number | bigint, verifyingContract: string): Hex32 {
  return TypedDataEncoder.hash(attestationDomain(chainId, verifyingContract), ATTESTATION_TYPES, attestation) as Hex32;
}
