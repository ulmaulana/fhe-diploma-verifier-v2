import { AbiCoder, hexlify, keccak256, randomBytes, sha256, type BytesLike } from "ethers";
import { ATTRIBUTE_DOMAIN, FIELD_KEYS, SCHEMA_VERSION, requireHex32, type DiplomaAttributes, type FieldKey, type Hex32 } from "../schema";
import { normalizeAttributes, type NormalizationOptions } from "../normalization/index";

const abi = AbiCoder.defaultAbiCoder();

/** Private plaintext digest: callers MUST encrypt before transaction submission. */
export function hashAttribute(credentialId: string, field: FieldKey, canonicalValue: string, schemaVersion = SCHEMA_VERSION): Hex32 {
  return sha256(abi.encode(
    ["string", "bytes32", "string", "string", "string"],
    [ATTRIBUTE_DOMAIN, requireHex32(credentialId, "credentialId"), schemaVersion, field, canonicalValue],
  )) as Hex32;
}

export function attributeDigests(credentialId: string, attributes: DiplomaAttributes, options: NormalizationOptions = {}): Record<FieldKey, Hex32> {
  const canonical = normalizeAttributes(attributes, options);
  return Object.fromEntries(FIELD_KEYS.map((key) => [key, hashAttribute(credentialId, key, canonical[key])])) as Record<FieldKey, Hex32>;
}

export function digestToUint256(digest: string): bigint {
  return BigInt(requireHex32(digest, "digest"));
}

/** Compatibility representation preserves every bit, in most-significant limb first order. */
export function digestToLimbs(digest: string): [bigint, bigint, bigint, bigint] {
  const bytes = requireHex32(digest, "digest").slice(2);
  return [0, 1, 2, 3].map((i) => BigInt(`0x${bytes.slice(i * 16, (i + 1) * 16)}`)) as [bigint, bigint, bigint, bigint];
}

export function hashUpload(bytes: BytesLike): Hex32 {
  return sha256(bytes) as Hex32;
}

export function randomId(): Hex32 {
  return hexlify(randomBytes(32)) as Hex32;
}

export function createUploadCommitment(uploadDigest: string, salt: string): Hex32 {
  return sha256(abi.encode(["bytes32", "bytes32"], [requireHex32(uploadDigest, "uploadDigest"), requireHex32(salt, "salt")])) as Hex32;
}

export function createUploadBinding(bytes: BytesLike): { uploadDigest: Hex32; salt: Hex32; uploadCommitment: Hex32 } {
  const uploadDigest = hashUpload(bytes);
  const salt = randomId();
  return { uploadDigest, salt, uploadCommitment: createUploadCommitment(uploadDigest, salt) };
}

/** Fixed-size order MUST match FIELD_KEYS and the verifier's bytes32[4]. */
export function hashInputHandles(handles: readonly string[]): Hex32 {
  if (handles.length !== FIELD_KEYS.length) throw new Error("Exactly four encrypted input handles are required.");
  return keccak256(abi.encode(["bytes32[4]"], [handles.map((handle) => requireHex32(handle, "handle"))])) as Hex32;
}
