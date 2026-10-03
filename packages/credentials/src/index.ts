import { AbiCoder, TypedDataEncoder, getAddress, keccak256, toUtf8Bytes, verifyTypedData, type TypedDataField } from "ethers";
import { isCredentialId, type Hex32 } from "@verifikasi/domain";

export const CREDENTIAL_SCHEMA_VERSION = 1;
export const CREDENTIAL_ENCODING_VERSION = 1;
export const DISCLOSURE_POLICY_VERSION = 1;
/** EIP-712 domain version of the current contract. v2 signs issuerNameHash and derives credential IDs. */
export const CREDENTIAL_PROTOCOL_VERSION = "2";
/** Read-only compatibility for records issued on a server-trusted v1 contract. */
export const LEGACY_CREDENTIAL_PROTOCOL_VERSION = "1";

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
  /** keccak256(UTF-8 institution name) the signer reviewed; must equal the registry name at inclusion. */
  issuerNameHash: Hex32;
  publicDataHash: Hex32;
  encryptedAttributesHash: Hex32;
  schemaVersion: number;
  encodingVersion: number;
  disclosurePolicyVersion: number;
  /** Decimal strings make uint256 values lossless across JSON boundaries. */
  nonce: string;
  issuanceDeadline: string;
}

/** Protocol v1 payload (no issuerNameHash, free-form credential ID). Read-only legacy support. */
export type LegacyCredentialAuthorizationV1 = Omit<CredentialAuthorization, "issuerNameHash">;

export interface CredentialDomain {
  name: "VerifikasiIjazah";
  version: "2";
  chainId: number;
  verifyingContract: string;
}
export interface LegacyCredentialDomainV1 extends Omit<CredentialDomain, "version"> { version: "1" }

export interface SignedCredential {
  authorization: CredentialAuthorization;
  profile: CredentialPublicProfile;
  domain: CredentialDomain;
  signature: string;
}
export interface LegacySignedCredentialV1 {
  authorization: LegacyCredentialAuthorizationV1;
  profile: CredentialPublicProfile;
  domain: LegacyCredentialDomainV1;
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

const legacyFields: TypedDataField[] = [
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
];
export const credentialAuthorizationTypes: Record<string, TypedDataField[]> = {
  CredentialAuthorization: [...legacyFields.slice(0, 3), { name: "issuerNameHash", type: "bytes32" }, ...legacyFields.slice(3)],
};
export const legacyCredentialAuthorizationTypesV1: Record<string, TypedDataField[]> = { CredentialAuthorization: legacyFields };

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

const LEGACY_KEYS = ["credentialId", "issuerId", "signer", "publicDataHash", "encryptedAttributesHash", "schemaVersion", "encodingVersion", "disclosurePolicyVersion", "nonce", "issuanceDeadline"] as const;

export function parseLegacyCredentialAuthorizationV1(value: unknown): LegacyCredentialAuthorizationV1 {
  const a = object(value, LEGACY_KEYS);
  return {
    credentialId: hash32(a.credentialId), issuerId: hash32(a.issuerId), signer: address(a.signer),
    publicDataHash: hash32(a.publicDataHash), encryptedAttributesHash: hash32(a.encryptedAttributesHash),
    schemaVersion: version(a.schemaVersion), encodingVersion: version(a.encodingVersion),
    disclosurePolicyVersion: version(a.disclosurePolicyVersion), nonce: uint256(a.nonce), issuanceDeadline: uint256(a.issuanceDeadline),
  };
}

export function parseCredentialAuthorization(value: unknown): CredentialAuthorization {
  const a = object(value, [...LEGACY_KEYS, "issuerNameHash"]);
  const { issuerNameHash, ...legacy } = a;
  return { ...parseLegacyCredentialAuthorizationV1(legacy), issuerNameHash: hash32(issuerNameHash) };
}

function trustedDomainFields(config: { chainId: number; contractAddress: string }) {
  if (!Number.isSafeInteger(config.chainId) || config.chainId < 1) throw new InvalidCredentialProof("Chain ID tidak valid.");
  return { name: "VerifikasiIjazah" as const, chainId: config.chainId, verifyingContract: address(config.contractAddress) };
}

/** Call with trusted deployment configuration, never chain/contract values taken from a QR or payload. */
export function credentialDomain(config: { chainId: number; contractAddress: string }): CredentialDomain {
  return { ...trustedDomainFields(config), version: CREDENTIAL_PROTOCOL_VERSION };
}

/** Domain of a v1 contract that the server explicitly trusts for read-only legacy records. */
export function legacyCredentialDomainV1(config: { chainId: number; contractAddress: string }): LegacyCredentialDomainV1 {
  return { ...trustedDomainFields(config), version: LEGACY_CREDENTIAL_PROTOCOL_VERSION };
}

export function hashIssuerName(name: string): Hex32 {
  return keccak256(toUtf8Bytes(name)) as Hex32;
}

/** Mirrors VerifikasiIjazah.credentialIdFor: keccak256(abi.encode(chainId, contract, issuerId, signer, nonce)). */
export function deriveCredentialId(config: { chainId: number; contractAddress: string }, issuerId: string, signer: string, nonce: string | bigint): Hex32 {
  const domain = credentialDomain(config);
  return keccak256(AbiCoder.defaultAbiCoder().encode(
    ["uint256", "address", "bytes32", "address", "uint256"],
    [domain.chainId, domain.verifyingContract, hash32(issuerId), address(signer), BigInt(typeof nonce === "bigint" ? nonce.toString() : uint256(nonce))],
  )).toLowerCase() as Hex32;
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

export function legacyCredentialDigestV1(authorization: LegacyCredentialAuthorizationV1, domain: LegacyCredentialDomainV1): Hex32 {
  return TypedDataEncoder.hash(domain, legacyCredentialAuthorizationTypesV1, parseLegacyCredentialAuthorizationV1(authorization)) as Hex32;
}

function recover(domain: CredentialDomain | LegacyCredentialDomainV1, types: Record<string, TypedDataField[]>, payload: object, signature: string): string {
  // Match the contract's EOA / OpenZeppelin recover(bytes) signature format.
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) throw new InvalidCredentialProof("Signature kredensial tidak valid.");
  try { return verifyTypedData(domain, types, payload, signature); }
  catch { throw new InvalidCredentialProof("Signature kredensial tidak valid."); }
}

export function recoverCredentialSigner(authorization: CredentialAuthorization, signature: string, domain: CredentialDomain): string {
  return recover(domain, credentialAuthorizationTypes, parseCredentialAuthorization(authorization), signature);
}

function checkBinding(comparable: Record<string, unknown>, binding: CredentialBinding) {
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
}

function storedDomain(value: unknown, expected: CredentialDomain | LegacyCredentialDomainV1) {
  const domain = object(value, ["name", "version", "chainId", "verifyingContract"]);
  if (domain.name !== expected.name || domain.version !== expected.version ||
      domain.chainId !== expected.chainId || address(domain.verifyingContract) !== expected.verifyingContract) {
    throw new InvalidCredentialProof("Domain pengesahan tidak sesuai konfigurasi resmi.");
  }
}

function checkProfile(profile: CredentialPublicProfile, authorization: LegacyCredentialAuthorizationV1) {
  if (hashPublicProfile(profile) !== authorization.publicDataHash || profile.issuerId !== authorization.issuerId ||
      profile.schemaVersion !== authorization.schemaVersion || profile.disclosurePolicyVersion !== authorization.disclosurePolicyVersion) {
    throw new InvalidCredentialProof();
  }
}

/** Verifies permanent proof only; issuanceDeadline/nonce are not expiry rules for an issued record. */
export function validateSignedCredential(value: unknown, trustedDomain: CredentialDomain, binding: CredentialBinding = {}): SignedCredential {
  const data = object(value, ["authorization", "profile", "domain", "signature"]);
  const expectedDomain = credentialDomain({ chainId: trustedDomain.chainId, contractAddress: trustedDomain.verifyingContract });
  storedDomain(data.domain, expectedDomain);
  const authorization = parseCredentialAuthorization(data.authorization);
  const profile = parseCredentialPublicProfile(data.profile);
  checkProfile(profile, authorization);
  // v2: the signed institution name is the displayed one, and the ID follows the contract's derivation rule.
  if (authorization.issuerNameHash !== hashIssuerName(profile.issuerDisplayName) ||
      authorization.credentialId !== deriveCredentialId({ chainId: expectedDomain.chainId, contractAddress: expectedDomain.verifyingContract },
        authorization.issuerId, authorization.signer, authorization.nonce) ||
      typeof data.signature !== "string" || recoverCredentialSigner(authorization, data.signature, expectedDomain) !== authorization.signer) {
    throw new InvalidCredentialProof();
  }
  checkBinding({ ...authorization, credentialDigest: credentialDigest(authorization, expectedDomain) }, binding);
  return { authorization, profile, domain: expectedDomain, signature: data.signature };
}

/** Same guarantees as validateSignedCredential for a v1 record. The domain must come from server configuration
 * (a trusted legacy contract list), never from the stored payload or a QR code. */
export function validateLegacySignedCredentialV1(value: unknown, trustedDomain: LegacyCredentialDomainV1, binding: CredentialBinding = {}): LegacySignedCredentialV1 {
  const data = object(value, ["authorization", "profile", "domain", "signature"]);
  const expectedDomain = legacyCredentialDomainV1({ chainId: trustedDomain.chainId, contractAddress: trustedDomain.verifyingContract });
  storedDomain(data.domain, expectedDomain);
  const authorization = parseLegacyCredentialAuthorizationV1(data.authorization);
  const profile = parseCredentialPublicProfile(data.profile);
  checkProfile(profile, authorization);
  if (typeof data.signature !== "string" ||
      recover(expectedDomain, legacyCredentialAuthorizationTypesV1, authorization, data.signature) !== authorization.signer) {
    throw new InvalidCredentialProof();
  }
  // v1 stored the registry name at execution time; it must still match the signed profile.
  checkBinding({ ...authorization, credentialDigest: legacyCredentialDigestV1(authorization, expectedDomain),
    issuerNameHash: hashIssuerName(profile.issuerDisplayName) }, binding);
  return { authorization, profile, domain: expectedDomain, signature: data.signature };
}
