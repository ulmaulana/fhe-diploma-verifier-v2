import { describe, expect, it } from "vitest";
import { AbiCoder, TypedDataEncoder, Wallet, keccak256, toUtf8Bytes } from "ethers";
import type { Hex32 } from "@verifikasi/domain";
import {
  credentialAuthorizationTypes, credentialDigest, credentialDomain, deriveCredentialId, hashEncryptedAttributes, hashIssuerName, hashPublicProfile,
  legacyCredentialAuthorizationTypesV1, legacyCredentialDomainV1, parseCredentialAuthorization, parsePublicProfile,
  validateLegacySignedCredentialV1, validateSignedCredential,
  type CredentialAuthorization, type CredentialPublicProfile, type LegacyCredentialAuthorizationV1, type SignedCredential,
} from "../src/index";

const issuer = new Wallet(`0x${"12".repeat(32)}`);
const issuerId = `0x${"cd".repeat(32)}` as Hex32;
const config = { chainId: 11155111, contractAddress: `0x${"34".repeat(20)}` };
const domain = credentialDomain(config);
const nonce = ((1n << 255n) + 91n).toString();
const id = deriveCredentialId(config, issuerId, issuer.address, nonce);
const handles = [1, 2, 3, 4].map(n => `0x${n.toString(16).padStart(64, "0")}`);
const profile: CredentialPublicProfile = { schemaVersion: 1, disclosurePolicyVersion: 1, issuerId,
  issuerDisplayName: "Universitas Contoh", fullName: "Andi Contoh", diplomaNumber: "CONTOH-001", studyProgram: "Teknik Informatika" };

async function signed(): Promise<SignedCredential> {
  const authorization: CredentialAuthorization = { credentialId: id, issuerId, signer: issuer.address,
    issuerNameHash: hashIssuerName(profile.issuerDisplayName),
    publicDataHash: hashPublicProfile(profile), encryptedAttributesHash: hashEncryptedAttributes(handles),
    schemaVersion: 1, encodingVersion: 1, disclosurePolicyVersion: 1, nonce, issuanceDeadline: "1" };
  return { authorization, profile: { ...profile }, domain, signature: await issuer.signTypedData(domain, credentialAuthorizationTypes, authorization) };
}

async function resign(authorization: CredentialAuthorization): Promise<SignedCredential> {
  return { authorization, profile: { ...profile }, domain, signature: await issuer.signTypedData(domain, credentialAuthorizationTypes, authorization) };
}

describe("permanent EIP-712 credential proof", () => {
  it("uses explicit ABI profile encoding and commits every displayed string byte", () => {
    expect(hashPublicProfile(profile)).toBe(keccak256(AbiCoder.defaultAbiCoder().encode(
      ["uint32", "uint32", "bytes32", "string", "string", "string", "string"],
      [1, 1, issuerId, profile.issuerDisplayName, profile.fullName, profile.diplomaNumber, profile.studyProgram],
    )));
    const reordered = { studyProgram: profile.studyProgram, diplomaNumber: profile.diplomaNumber, fullName: profile.fullName,
      issuerDisplayName: profile.issuerDisplayName, issuerId, disclosurePolicyVersion: 1, schemaVersion: 1 };
    expect(hashPublicProfile(reordered)).toBe(hashPublicProfile(profile));
    expect(hashPublicProfile({ ...profile, fullName: `${profile.fullName} ` })).not.toBe(hashPublicProfile(profile));
  });

  it("binds input handles in field order together with encoding version", () => {
    expect(hashEncryptedAttributes(handles)).toBe(keccak256(AbiCoder.defaultAbiCoder().encode(["uint32", "bytes32[4]"], [1, handles])));
    expect(hashEncryptedAttributes([...handles].reverse())).not.toBe(hashEncryptedAttributes(handles));
    expect(() => hashEncryptedAttributes(handles.slice(1))).toThrow();
    expect(() => hashEncryptedAttributes(handles, 2)).toThrow();
  });

  it("validates after issuance deadline without consuming nonce and preserves uint256 through JSON", async () => {
    const proof = await signed();
    const fromJson: unknown = JSON.parse(JSON.stringify(proof));
    expect(validateSignedCredential(fromJson, domain)).toEqual(proof);
    expect(validateSignedCredential(fromJson, domain)).toEqual(proof);
    expect(credentialDigest(proof.authorization, domain)).toBe(TypedDataEncoder.hash(domain, credentialAuthorizationTypes, proof.authorization));
    expect(BigInt(proof.authorization.nonce)).toBe((1n << 255n) + 91n);
  });

  it.each(["fullName", "diplomaNumber", "studyProgram", "issuerDisplayName"] as const)("rejects changed public %s before it can be displayed as official", async key => {
    const proof = await signed();
    expect(() => validateSignedCredential({ ...proof, profile: { ...proof.profile, [key]: "Diubah" } }, domain)).toThrow();
  });

  it("rejects missing, wrong, personal-sign, and malleable signatures", async () => {
    const proof = await signed();
    const wrong = Wallet.createRandom();
    const secpOrder = BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141");
    const highS = (secpOrder - BigInt(`0x${proof.signature.slice(66, 130)}`)).toString(16).padStart(64, "0");
    const malleable = `${proof.signature.slice(0, 66)}${highS}${proof.signature.endsWith("1b") ? "1c" : "1b"}`;
    for (const signature of ["0x", "0x1234", await wrong.signTypedData(domain, credentialAuthorizationTypes, proof.authorization),
      await issuer.signMessage(credentialDigest(proof.authorization, domain)), malleable]) {
      expect(() => validateSignedCredential({ ...proof, signature }, domain)).toThrow();
    }
  });

  it("checks trusted domain independently of the untrusted stored domain", async () => {
    const proof = await signed();
    const maliciousDomain = { ...domain, chainId: 1 };
    const signature = await issuer.signTypedData(maliciousDomain, credentialAuthorizationTypes, proof.authorization);
    expect(() => validateSignedCredential({ ...proof, domain: maliciousDomain, signature }, domain)).toThrow();
    expect(() => validateSignedCredential(proof, credentialDomain({ chainId: 1, contractAddress: domain.verifyingContract }))).toThrow();
    expect(() => validateSignedCredential(proof, credentialDomain({ chainId: domain.chainId, contractAddress: issuer.address }))).toThrow();
    expect(() => validateSignedCredential({ ...proof, domain: { ...domain, salt: id } }, domain)).toThrow();
  });

  it("binds signed proof to immutable on-chain fields and institution name at issuance", async () => {
    const proof = await signed();
    const binding = { credentialId: id, issuerId, signer: issuer.address, publicDataHash: proof.authorization.publicDataHash,
      encryptedAttributesHash: proof.authorization.encryptedAttributesHash, credentialDigest: credentialDigest(proof.authorization, domain),
      issuerNameHash: keccak256(toUtf8Bytes(profile.issuerDisplayName)) as Hex32, schemaVersion: 1, encodingVersion: 1, disclosurePolicyVersion: 1 };
    expect(validateSignedCredential(proof, domain, binding)).toEqual(proof);
    const fullChainMetadata = { ...binding, revoked: false, checkedBlock: 123, issuerActive: true };
    expect(validateSignedCredential(proof, domain, fullChainMetadata)).toEqual(proof);
    for (const key of ["credentialId", "issuerId", "publicDataHash", "encryptedAttributesHash", "credentialDigest", "issuerNameHash"] as const) {
      expect(() => validateSignedCredential(proof, domain, { ...binding, [key]: `0x${"99".repeat(32)}` })).toThrow();
    }
    expect(() => validateSignedCredential(proof, domain, { ...binding, signer: domain.verifyingContract })).toThrow();
    expect(() => validateSignedCredential(proof, domain, { ...binding, disclosurePolicyVersion: 2 })).toThrow();
  });

  it("strict public whitelist rejects extra private fields and unknown protocol versions", async () => {
    const proof = await signed();
    expect(() => parsePublicProfile({ ...profile, graduationDate: "2024-06-01" })).toThrow();
    expect(() => validateSignedCredential({ ...proof, referenceValues: ["secret"] }, domain)).toThrow();
    expect(() => parseCredentialAuthorization({ ...proof.authorization, plaintextDigest: id })).toThrow();
    expect(() => parseCredentialAuthorization({ ...proof.authorization, nonce: 42 })).toThrow();
    expect(() => parseCredentialAuthorization({ ...proof.authorization, nonce: "01" })).toThrow();
    expect(() => parseCredentialAuthorization({ ...proof.authorization, nonce: (1n << 256n).toString() })).toThrow();
    expect(() => parsePublicProfile({ ...profile, disclosurePolicyVersion: 2 })).toThrow();
  });

  it("v2 derives the credential ID exactly like VerifikasiIjazah.credentialIdFor", () => {
    expect(id).toBe(keccak256(AbiCoder.defaultAbiCoder().encode(["uint256", "address", "bytes32", "address", "uint256"],
      [11155111, config.contractAddress, issuerId, issuer.address, BigInt(nonce)])));
    expect(deriveCredentialId({ ...config, chainId: 1 }, issuerId, issuer.address, nonce)).not.toBe(id);
    expect(deriveCredentialId(config, issuerId, Wallet.createRandom().address, nonce)).not.toBe(id);
    expect(deriveCredentialId(config, issuerId, issuer.address, "1")).not.toBe(id);
  });

  it("v2 rejects a validly signed payload whose name hash or credential ID breaks the protocol rules", async () => {
    const proof = await signed();
    const otherName = await resign({ ...proof.authorization, issuerNameHash: hashIssuerName("Kampus Lain") });
    expect(() => validateSignedCredential(otherName, domain)).toThrow();
    const randomId = await resign({ ...proof.authorization, credentialId: `0x${"ab".repeat(32)}` as Hex32 });
    expect(() => validateSignedCredential(randomId, domain)).toThrow();
    expect(() => parseCredentialAuthorization({ ...proof.authorization, issuerNameHash: undefined })).toThrow();
  });

  it("keeps v1 legacy proofs and v2 proofs in separate trusted domains", async () => {
    const proof = await signed();
    const legacyDomain = legacyCredentialDomainV1(config);
    const { issuerNameHash: _omit, ...legacyAuthorization } = proof.authorization;
    const v1: LegacyCredentialAuthorizationV1 = { ...legacyAuthorization, credentialId: `0x${"ab".repeat(32)}` as Hex32 };
    const legacy = { authorization: v1, profile: { ...profile }, domain: legacyDomain,
      signature: await issuer.signTypedData(legacyDomain, legacyCredentialAuthorizationTypesV1, v1) };
    expect(validateLegacySignedCredentialV1(JSON.parse(JSON.stringify(legacy)), legacyDomain).authorization.credentialId).toBe(v1.credentialId);
    expect(() => validateLegacySignedCredentialV1(legacy, legacyDomain, { issuerNameHash: hashIssuerName("Nama lain") })).toThrow();
    // A v1 proof is never accepted as v2, and a v2 proof is never accepted on the legacy path.
    expect(() => validateSignedCredential(legacy, domain)).toThrow();
    expect(() => validateLegacySignedCredentialV1(proof, legacyDomain)).toThrow();
    // A v1 signature replayed into a v2 domain object fails signature recovery.
    expect(() => validateSignedCredential({ ...legacy, domain, authorization: { ...v1, issuerNameHash: proof.authorization.issuerNameHash } }, domain)).toThrow();
  });
});
