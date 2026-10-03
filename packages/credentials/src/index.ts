import { AbiCoder, TypedDataEncoder, getAddress, keccak256, toUtf8Bytes, verifyTypedData, type TypedDataField } from "ethers";
import { isCredentialId, type Hex32 } from "@verifikasi/domain";

export const CREDENTIAL_SCHEMA_VERSION = 1;
export const CREDENTIAL_ENCODING_VERSION = 1;
export const DISCLOSURE_POLICY_VERSION = 1;

/** Only these reviewed fields are public. In particular, graduationDate is private. */
export interface CredentialPublicProfile {
  schemaVersion: number;
  disclosurePolicyVersion: number;
  issuerId: Hex32;
  issuerDisplayName: string;
  fullName: string;
  diplomaNumber: string;
  studyProgram: string;
}

export interface CredentialAuthorization {
  credentialId: Hex32;
  issuerId: Hex32;
  signer: string;
  publicDataHash: Hex32;
  encryptedAttributesHash: Hex32;
  schemaVersion: number;
  encodingVersion: number;
  disclosurePolicyVersion: number;
  /** Decimal strings make uint256 values lossless across JSON boundaries. */
  nonce: string;
  issuanceDeadline: string;
}

export interface CredentialDomain {
  name: "VerifikasiIjazah";
  version: "1";
  chainId: number;
  verifyingContract: string;
}

export interface SignedCredential {
  authorization: CredentialAuthorization;
  profile: CredentialPublicProfile;
  domain: CredentialDomain;
  signature: string;
}

/** Bind against a successful chain read; issuer status and revocation are separate policy checks. */
export interface CredentialBinding {
  credentialId?: string;
  issuerId?: string;
  signer?: string;
  credentialDigest?: string;
  publicDataHash?: string;
  encryptedAttributesHash?: string;
  issuerNameHash?: string;
  schemaVersion?: number;
  encodingVersion?: number;
  disclosurePolicyVersion?: number;
}

export const credentialAuthorizationTypes: Record<string, TypedDataField[]> = {
  CredentialAuthorization: [
    { name: "credentialId", type: "bytes32" },
    { name: "issuerId", type: "bytes32" },
    { name: "signer", type: "address" },
    { name: "publicDataHash", type: "bytes32" },
    { name: "encryptedAttributesHash", type: "bytes32" },
    { name: "schemaVersion", type: "uint32" },
    { name: "encodingVersion", type: "uint32" },
    { name: "disclosurePolicyVersion", type: "uint32" },
    { name: "nonce", type: "uint256" },
    { name: "issuanceDeadline", type: "uint256" },
  ],
};

export class InvalidCredentialProof extends Error {
  constructor(message = "Bukti pengesahan kredensial tidak valid.") {
    super(message);
    this.name = "InvalidCredentialProof";
  }
}

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InvalidCredentialProof();
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length || !keys.every(key => Object.hasOwn(record, key))) {
    throw new InvalidCredentialProof("Field bukti atau profil publik tidak sesuai skema.");
  }
  return record;
}

function hash32(value: unknown): Hex32 {
  if (!isCredentialId(value) || /^0x0{64}$/i.test(value)) throw new InvalidCredentialProof();
  return value.toLowerCase() as Hex32;
}

function address(value: unknown): string {
  if (typeof value !== "string") throw new InvalidCredentialProof();
  try {
    const result = getAddress(value);
    if (/^0x0{40}$/i.test(result)) throw new InvalidCredentialProof();
    return result;
  } catch { throw new InvalidCredentialProof(); }
}

function version(value: unknown): number {
  if (value !== 1) throw new InvalidCredentialProof("Versi bukti belum didukung.");
  return value;
}

function publicText(value: unknown, max = 200): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new InvalidCredentialProof("Profil publik tidak valid.");
  }
  // Do not normalize the reviewed text: the bytes hashed must be those displayed.
  return value;
}

function uint256(value: unknown): string {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,77})$/.test(value) || BigInt(value) >= 1n << 256n) {
    throw new InvalidCredentialProof("Nilai uint256 harus berupa string desimal yang valid.");
  }
  return value;
}

export function parseCredentialPublicProfile(value: unknown): CredentialPublicProfile {
  const p = object(value, ["schemaVersion", "disclosurePolicyVersion", "issuerId", "issuerDisplayName", "fullName", "diplomaNumber", "studyProgram"]);
  return {
    schemaVersion: version(p.schemaVersion), disclosurePolicyVersion: version(p.disclosurePolicyVersion),
    issuerId: hash32(p.issuerId), issuerDisplayName: publicText(p.issuerDisplayName), fullName: publicText(p.fullName),
    diplomaNumber: publicText(p.diplomaNumber), studyProgram: publicText(p.studyProgram),
  };
}

export const parsePublicProfile = parseCredentialPublicProfile;

export function parseCredentialAuthorization(value: unknown): CredentialAuthorization {
  const a = object(value, ["credentialId", "issuerId", "signer", "publicDataHash", "encryptedAttributesHash", "schemaVersion", "encodingVersion", "disclosurePolicyVersion", "nonce", "issuanceDeadline"]);
  return {
    credentialId: hash32(a.credentialId), issuerId: hash32(a.issuerId), signer: address(a.signer),
    publicDataHash: hash32(a.publicDataHash), encryptedAttributesHash: hash32(a.encryptedAttributesHash),
    schemaVersion: version(a.schemaVersion), encodingVersion: version(a.encodingVersion),
    disclosurePolicyVersion: version(a.disclosurePolicyVersion), nonce: uint256(a.nonce), issuanceDeadline: uint256(a.issuanceDeadline),
  };
}

/** Call with trusted deployment configuration, never chain/contract values taken from a QR or payload. */
export function credentialDomain(config: { chainId: number; contractAddress: string }): CredentialDomain {
  if (!Number.isSafeInteger(config.chainId) || config.chainId < 1) throw new InvalidCredentialProof("Chain ID tidak valid.");
  return { name: "VerifikasiIjazah", version: "1", chainId: config.chainId, verifyingContract: address(config.contractAddress) };
}

export function hashPublicProfile(value: CredentialPublicProfile): Hex32 {
  const p = parseCredentialPublicProfile(value);
  return keccak256(AbiCoder.defaultAbiCoder().encode(
    ["uint32", "uint32", "bytes32", "string", "string", "string", "string"],
    [p.schemaVersion, p.disclosurePolicyVersion, p.issuerId, p.issuerDisplayName, p.fullName, p.diplomaNumber, p.studyProgram],
  )) as Hex32;
}

export function hashEncryptedAttributes(handles: readonly string[], encodingVersion = CREDENTIAL_ENCODING_VERSION): Hex32 {
  version(encodingVersion);
  if (handles.length !== 4) throw new InvalidCredentialProof("Empat handle terenkripsi wajib tersedia.");
  return keccak256(AbiCoder.defaultAbiCoder().encode(["uint32", "bytes32[4]"], [encodingVersion, handles.map(hash32)])) as Hex32;
}

export function credentialDigest(authorization: CredentialAuthorization, domain: CredentialDomain): Hex32 {
  return TypedDataEncoder.hash(domain, credentialAuthorizationTypes, parseCredentialAuthorization(authorization)) as Hex32;
}

export function recoverCredentialSigner(authorization: CredentialAuthorization, signature: string, domain: CredentialDomain): string {
  // Match the contract's EOA / OpenZeppelin recover(bytes) signature format.
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) throw new InvalidCredentialProof("Signature kredensial tidak valid.");
  try { return verifyTypedData(domain, credentialAuthorizationTypes, parseCredentialAuthorization(authorization), signature); }
  catch { throw new InvalidCredentialProof("Signature kredensial tidak valid."); }
}

/** Verifies permanent proof only; issuanceDeadline/nonce are not expiry rules for an issued record. */
export function validateSignedCredential(value: unknown, trustedDomain: CredentialDomain, binding: CredentialBinding = {}): SignedCredential {
  const data = object(value, ["authorization", "profile", "domain", "signature"]);
  const storedDomain = object(data.domain, ["name", "version", "chainId", "verifyingContract"]);
  const expectedDomain = credentialDomain({ chainId: trustedDomain.chainId, contractAddress: trustedDomain.verifyingContract });
  if (storedDomain.name !== expectedDomain.name || storedDomain.version !== expectedDomain.version ||
      storedDomain.chainId !== expectedDomain.chainId || address(storedDomain.verifyingContract) !== expectedDomain.verifyingContract) {
    throw new InvalidCredentialProof("Domain pengesahan tidak sesuai konfigurasi resmi.");
  }
  const authorization = parseCredentialAuthorization(data.authorization);
  const profile = parseCredentialPublicProfile(data.profile);
  if (typeof data.signature !== "string" || hashPublicProfile(profile) !== authorization.publicDataHash ||
      profile.issuerId !== authorization.issuerId || profile.schemaVersion !== authorization.schemaVersion ||
      profile.disclosurePolicyVersion !== authorization.disclosurePolicyVersion ||
      recoverCredentialSigner(authorization, data.signature, expectedDomain) !== authorization.signer) {
    throw new InvalidCredentialProof();
  }
  const comparable = { ...authorization, credentialDigest: credentialDigest(authorization, expectedDomain),
    issuerNameHash: keccak256(toUtf8Bytes(profile.issuerDisplayName)) };
  const bindingFields: (keyof CredentialBinding)[] = ["credentialId", "issuerId", "signer", "credentialDigest",
    "publicDataHash", "encryptedAttributesHash", "issuerNameHash", "schemaVersion", "encodingVersion", "disclosurePolicyVersion"];
  for (const key of bindingFields) {
    const actual = comparable[key];
    const expected = binding[key];
    if (expected === undefined) continue;
    if (typeof actual === "string" && typeof expected === "string" ? actual.toLowerCase() !== expected.toLowerCase() : actual !== expected) {
      throw new InvalidCredentialProof("Bukti pengesahan tidak sesuai rekaman blockchain.");
    }
  }
  return { authorization, profile, domain: expectedDomain, signature: data.signature };
}
