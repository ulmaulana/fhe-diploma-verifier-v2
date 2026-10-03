import { describe, expect, it } from "vitest";
import { artifactExpiresAt, decideVerification, parseCredentialQr, resolveQrCandidates, UPLOAD_HARD_TTL_MS, UPLOAD_TERMINAL_TTL_MS, type DecisionInput } from "../src/index";

const id = `0x${"11".repeat(32)}`;
const otherId = `0x${"22".repeat(32)}`;
const origin = "https://verifikasi.example";
const qr = `${origin}/c/${id}`;
const valid: DecisionInput = {
  uploadPresent: true, qrValid: true, chainReadSucceeded: true,
  recordFound: true, revoked: false, issuerAuthorized: true, ocrEligible: true,
  recordVerificationStatus: 'VERIFIED_RECORD',
  fieldMatches: { full_name: true, diploma_number: true, study_program: true, graduation_date: true },
};

describe("verification precedence", () => {
  it('requires a verified signed record even when all ciphertext comparisons match', () => {
    for (const recordVerificationStatus of [null, 'PENDING', 'ISSUER_INACTIVE'] as const) {
      expect(decideVerification({ ...valid, recordVerificationStatus }).decision).toBe('INCONCLUSIVE');
    }
    expect(decideVerification({ ...valid, recordVerificationStatus: 'INVALID_PROOF' }).decision).toBe('INVALID_PROOF');
    expect(decideVerification({ ...valid, recordVerificationStatus: 'ERROR' }).decision).toBe('ERROR');
    expect(decideVerification({ ...valid, revoked: true, recordVerificationStatus: 'REVOKED' }).decision).toBe('REVOKED');
  });
  it("requires every mandatory attribute and final issuer authorization for MATCH", () => {
    expect(decideVerification(valid).decision).toBe("MATCH");
    expect(decideVerification({ ...valid, issuerAuthorized: false }).decision).toBe("INCONCLUSIVE");
    expect(decideVerification({ ...valid, issuerAuthorized: null }).decision).toBe("INCONCLUSIVE");
    expect(decideVerification({ ...valid, ocrEligible: false }).fields.full_name).toBe("NOT_COMPARED");
  });

  it("revocation in the final chain snapshot overrides a successful comparison", () => {
    expect(decideVerification({ ...valid, revoked: true }).decision).toBe("REVOKED");
    expect(decideVerification({ ...valid, revoked: true, technicalError: "decryption failed" }).decision).toBe("REVOKED");
  });

  it("does not claim not-found when RPC failed or comparison output is incomplete", () => {
    expect(decideVerification({ ...valid, chainReadSucceeded: false, recordFound: false }).decision).toBe("ERROR");
    expect(decideVerification({ ...valid, recordFound: false }).decision).toBe("NOT_FOUND");
    expect(decideVerification({ ...valid, fieldMatches: { full_name: true } }).decision).toBe("ERROR");
  });

  it("never claims matching from QR metadata alone or with substituted QR", () => {
    expect(decideVerification({ ...valid, uploadPresent: false }).decision).toBe("INCONCLUSIVE");
    expect(decideVerification({ ...valid, targetMatches: false }).decision).toBe("INCONCLUSIVE");
    expect(decideVerification({ ...valid, qrValid: false }).decision).toBe("INCONCLUSIVE");
  });

  it("reports field-specific mismatch without a reference value", () => {
    const result = decideVerification({ ...valid, fieldMatches: { ...valid.fieldMatches, diploma_number: false } });
    expect(result.decision).toBe("MISMATCH");
    expect(result.fields.diploma_number).toBe("MISMATCH");
    expect(result.fields.full_name).toBe("MATCH");
  });
});

describe("same-origin fixed-format QR", () => {
  it("parses only the credential reference", () => {
    expect(parseCredentialQr(qr, origin)).toEqual({ ok: true, credentialId: id });
    expect(resolveQrCandidates([qr, qr], origin)).toEqual({ ok: true, credentialId: id });
  });

  it.each([
    `https://evil.example/c/${id}`, `${qr}?name=Andi`, `${qr}#record`,
    `https://user:password@verifikasi.example/c/${id}`, `${origin}/c/AKD-2026-1`,
    `${origin}/elsewhere/../c/${id}`, `javascript:alert(1)`, `/c/${id}`, `${qr}/`,
  ])("rejects untrusted or malformed payload %s without visiting it", (value) => {
    expect(parseCredentialQr(value, origin).ok).toBe(false);
  });

  it("never silently selects between distinct candidates or foreign QR", () => {
    expect(resolveQrCandidates([], origin).ok).toBe(false);
    expect(resolveQrCandidates([qr, `${origin}/c/${otherId}`], origin).ok).toBe(false);
    expect(resolveQrCandidates([qr, "https://evil.example/"], origin).ok).toBe(false);
    expect(resolveQrCandidates([qr], origin, otherId).ok).toBe(false);
  });
});

describe("retention", () => {
  it("expires terminal artifacts after an hour without extending hard TTL", () => {
    const createdAt = 1_000_000;
    expect(artifactExpiresAt(createdAt)).toBe(createdAt + UPLOAD_HARD_TTL_MS);
    expect(artifactExpiresAt(createdAt, createdAt + 1000)).toBe(createdAt + 1000 + UPLOAD_TERMINAL_TTL_MS);
    expect(artifactExpiresAt(createdAt, createdAt + UPLOAD_HARD_TTL_MS - 10)).toBe(createdAt + UPLOAD_HARD_TTL_MS);
  });
});
