import { describe, expect, it } from "vitest";
import { Wallet, verifyTypedData } from "ethers";
import { ATTESTATION_TYPES, ENCODING_VERSION, NORMALIZER_VERSION, SCHEMA_VERSION, attestationDomain, createUploadCommitment, digestToLimbs, hashAttestation, hashAttribute, hashInputHandles, hashUpload, type Hex32, type VerificationAttestation } from "../src/index";

const id = `0x${"11".repeat(32)}` as Hex32;
const other = `0x${"22".repeat(32)}` as Hex32;
const verifier = "0x0000000000000000000000000000000000000001";

describe("attribute encoding and upload binding", () => {
  it("matches an independently encoded ABI/SHA-256 vector", () => {
    // Generated with Python hashlib + explicit 32-byte ABI head/tail offsets.
    expect(hashAttribute(id, "full_name", "ANDI PRATAMA")).toBe("0x73b4bd405fed0e7b248ae95d98e9082f433719124c0f0757d0ba3d52fb4c5721");
  });

  it("separates each record, field, schema and value", () => {
    const baseline = hashAttribute(id, "full_name", "ANDI");
    expect(hashAttribute(other, "full_name", "ANDI")).not.toBe(baseline);
    expect(hashAttribute(id, "study_program", "ANDI")).not.toBe(baseline);
    expect(hashAttribute(id, "full_name", "ANDI", "v2")).not.toBe(baseline);
    expect(hashAttribute(id, "full_name", "AND1")).not.toBe(baseline);
  });

  it("keeps all 256 bits in big-endian compatibility limbs", () => {
    expect(digestToLimbs("0x000000000000000100000000000000020000000000000003ffffffffffffffff"))
      .toEqual([1n, 2n, 3n, (1n << 64n) - 1n]);
    expect(() => digestToLimbs("0x01")).toThrow();
  });

  it("binds upload bytes and random salt independently", () => {
    const uploadDigest = hashUpload(new TextEncoder().encode("abc"));
    expect(uploadDigest).toBe("0xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(createUploadCommitment(uploadDigest, id)).not.toBe(createUploadCommitment(uploadDigest, other));
    expect(createUploadCommitment(uploadDigest, id)).not.toBe(createUploadCommitment(other, id));
  });

  it("requires four handles and binds their order", () => {
    const handles = [id, other, id, id];
    expect(hashInputHandles(handles)).not.toBe(hashInputHandles([other, id, id, id]));
    expect(() => hashInputHandles([id])).toThrow();
  });
});

describe("EIP-712 attestation", () => {
  const payload: VerificationAttestation = {
    requestId: id, credentialId: other, uploadCommitment: id,
    schemaVersion: SCHEMA_VERSION, encodingVersion: ENCODING_VERSION, normalizerVersion: NORMALIZER_VERSION,
    ocrConfigHash: other, inputHandlesHash: hashInputHandles([id, id, id, id]),
    relayer: "0x0000000000000000000000000000000000000002",
    resultReader: "0x0000000000000000000000000000000000000003",
    nonce: 0n, deadline: 2_000_000_000n,
  };

  it("binds request, file, encrypted handles, destination chain, verifier and result reader", async () => {
    const wallet = Wallet.createRandom();
    const domain = attestationDomain(11155111, verifier);
    const signature = await wallet.signTypedData(domain, ATTESTATION_TYPES, payload);
    expect(verifyTypedData(domain, ATTESTATION_TYPES, payload, signature)).toBe(wallet.address);
    expect(verifyTypedData(domain, ATTESTATION_TYPES, { ...payload, requestId: other }, signature)).not.toBe(wallet.address);
    const digest = hashAttestation(payload, 11155111, verifier);
    expect(hashAttestation({ ...payload, uploadCommitment: other }, 11155111, verifier)).not.toBe(digest);
    expect(hashAttestation({ ...payload, inputHandlesHash: other }, 11155111, verifier)).not.toBe(digest);
    expect(hashAttestation({ ...payload, resultReader: payload.relayer }, 11155111, verifier)).not.toBe(digest);
    expect(hashAttestation(payload, 1, verifier)).not.toBe(digest);
    expect(hashAttestation(payload, 11155111, payload.relayer)).not.toBe(digest);
  });
});
