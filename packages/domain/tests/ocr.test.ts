import { describe, expect, it } from "vitest";
import { assessOcr, type FieldKey, type OcrField } from "../src/index";

function fields(): Record<FieldKey, OcrField> {
  return {
    full_name: { text: "Andi Pratama", confidence: 0.94, page: 1 },
    diploma_number: { text: "IF-001/2026", confidence: 0.93, page: 1 },
    study_program: { text: "Informatika", confidence: 0.99, page: 1 },
    graduation_date: { text: "15 Agustus 2026", confidence: 0.9, page: 1 },
  };
}

describe("official OCR eligibility", () => {
  it("accepts all four reliable fields from the QR page", () => {
    const result = assessOcr(fields(), { qrPage: 1, templateSupported: true });
    expect(result.eligible).toBe(true);
    expect(result.canonical?.full_name).toBe("ANDI PRATAMA");
    expect(result.page).toBe(1);
  });

  it("does not return four partial guesses when one field is uncertain", () => {
    const input = fields();
    input.full_name.confidence = 0.899;
    const result = assessOcr(input);
    expect(result.eligible).toBe(false);
    expect(result.canonical).toBeNull();
    expect(result.issues[0]?.code).toBe("LOW_CONFIDENCE");
  });

  it("rejects multiple candidates and ambiguous dates", () => {
    const input = fields();
    input.full_name.candidates = ["Andi Pratama", "Andi Pertama"];
    input.graduation_date.text = "03/04/2026";
    const result = assessOcr(input);
    expect(result.issues.map((issue) => issue.code)).toContain("AMBIGUOUS_FIELD");
    expect(result.issues.map((issue) => issue.code)).toContain("AMBIGUOUS_DATE");
    expect(result.canonical).toBeNull();
  });

  it("does not merge attributes from several pages or another QR page", () => {
    const input = fields();
    input.study_program.page = 2;
    expect(assessOcr(input).eligible).toBe(false);
    expect(assessOcr(fields(), { qrPage: 2 }).eligible).toBe(false);
  });

  it("rejects unsupported templates, missing attributes, and invalid confidence", () => {
    expect(assessOcr(fields(), { templateSupported: false }).eligible).toBe(false);
    expect(assessOcr({}).eligible).toBe(false);
    const input = fields();
    input.diploma_number.confidence = Number.NaN;
    expect(assessOcr(input).eligible).toBe(false);
  });
});
