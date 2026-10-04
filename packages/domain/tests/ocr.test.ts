import { describe, expect, it } from "vitest";
import { assessOcr, FIELD_KEYS, OCR_CONFIDENCE_THRESHOLD, type FieldKey, type OcrField } from "../src/index";

function fields(): Record<FieldKey, OcrField> {
  return {
    full_name: { text: "Andi Pratama", confidence: 0.94, page: 1 },
    diploma_number: { text: "IF-001/2026", confidence: 0.93, page: 1 },
    study_program: { text: "Informatika", confidence: 0.99, page: 1 },
    graduation_date: { text: "15 Agustus 2026", confidence: 0.9, page: 1 },
  };
}

function fieldsWithConfidence(confidence: number): Record<FieldKey, OcrField> {
  const input = fields();
  for (const key of FIELD_KEYS) input[key].confidence = confidence;
  return input;
}

describe("official OCR eligibility", () => {
  it("accepts all four reliable fields from the QR page", () => {
    const result = assessOcr(fields(), { qrPage: 1, templateSupported: true });
    expect(result.eligible).toBe(true);
    expect(result.canonical?.full_name).toBe("ANDI PRATAMA");
    expect(result.page).toBe(1);
  });

  it.each([0.4, 0.699, 0.899])("accepts one score of %s when another required field meets the threshold", (confidence) => {
    const input = fields();
    input.full_name.confidence = confidence;
    const result = assessOcr(input);
    expect(result.eligible).toBe(true);
    expect(result.canonical?.full_name).toBe("ANDI PRATAMA");
    expect(result.issues).toEqual([]);
    expect(input.full_name).toEqual({ text: "Andi Pratama", confidence, page: 1 });
  });

  it.each([0, 0.699])("rejects all four valid scores of %s with one global confidence issue", (confidence) => {
    const result = assessOcr(fieldsWithConfidence(confidence));
    expect(result.eligible).toBe(false);
    expect(result.canonical).toBeNull();
    expect(result.issues).toEqual([{
      code: "LOW_CONFIDENCE",
      message: "Pembacaan seluruh atribut wajib belum cukup jelas; unggah ulang dokumen.",
    }]);
  });

  it.each(FIELD_KEYS)("accepts exactly 70%% for %s even when the other three scores and the mean are below 70%%", (key) => {
    const input = fieldsWithConfidence(0);
    input[key].confidence = 0.7;
    const result = assessOcr(input);
    expect(OCR_CONFIDENCE_THRESHOLD).toBe(0.7);
    expect(FIELD_KEYS.reduce((sum, field) => sum + input[field].confidence, 0) / FIELD_KEYS.length).toBeLessThan(0.7);
    expect(result.eligible).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.canonical).toEqual({
      full_name: "ANDI PRATAMA",
      diploma_number: "IF-001/2026",
      study_program: "INFORMATIKA",
      graduation_date: "2026-08-15",
    });
  });

  it("accepts a 70–89% score without a hidden 90% fallback", () => {
    const input = fieldsWithConfidence(0.1);
    input.diploma_number.confidence = 0.899;
    expect(assessOcr(input).eligible).toBe(true);
  });

  it("accepts valid zero and one scores without clamping or replacing them", () => {
    const input = fieldsWithConfidence(0);
    input.study_program.confidence = 1;
    expect(assessOcr(input).eligible).toBe(true);
    expect(FIELD_KEYS.map((key) => input[key].confidence)).toEqual([0, 0, 1, 0]);
  });

  it.each([
    { label: "NaN", value: Number.NaN },
    { label: "positive infinity", value: Number.POSITIVE_INFINITY },
    { label: "negative infinity", value: Number.NEGATIVE_INFINITY },
    { label: "negative score", value: -0.001 },
    { label: "score above one", value: 1.001 },
  ])("rejects $label as invalid confidence even when other fields meet the threshold", ({ value }) => {
    const input = fields();
    input.diploma_number.confidence = value;
    const result = assessOcr(input);
    expect(result.eligible).toBe(false);
    expect(result.canonical).toBeNull();
    expect(result.issues).toEqual([{
      code: "INVALID_CONFIDENCE",
      field: "diploma_number",
      message: "Skor pembacaan atribut tidak valid.",
    }]);
    expect(input.diploma_number.confidence).toBe(value);
  });

  it("reports every invalid score per field without a global low-confidence issue", () => {
    const input = fields();
    input.full_name.confidence = Number.NaN;
    input.diploma_number.confidence = Number.POSITIVE_INFINITY;
    input.study_program.confidence = -0.001;
    input.graduation_date.confidence = 1.001;
    const result = assessOcr(input);
    expect(result.eligible).toBe(false);
    expect(result.canonical).toBeNull();
    expect(result.issues.map(({ code, field }) => ({ code, field }))).toEqual(
      FIELD_KEYS.map((field) => ({ code: "INVALID_CONFIDENCE", field })),
    );
  });

  it("does not classify invalid or absent scores as low confidence", () => {
    const input = fieldsWithConfidence(0.699);
    input.full_name.confidence = Number.NaN;
    expect(assessOcr(input).issues.map((issue) => issue.code)).toEqual(["INVALID_CONFIDENCE"]);
    const { full_name: omitted, ...partial } = fieldsWithConfidence(0.699);
    expect(omitted.text).toBe("Andi Pratama");
    const result = assessOcr(partial);
    expect(result.issues.map((issue) => issue.code)).toEqual(["MISSING_FIELD"]);
    expect(result.canonical).toBeNull();
  });

  it("preserves an explicit threshold override with the same all-below policy", () => {
    const input = fieldsWithConfidence(0.799);
    expect(assessOcr(input, { threshold: 0.8 }).issues.map((issue) => issue.code)).toEqual(["LOW_CONFIDENCE"]);
    input.graduation_date.confidence = 0.8;
    expect(assessOcr(input, { threshold: 0.8 }).eligible).toBe(true);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -0.001, 1.001])("rejects invalid threshold %s", (threshold) => {
    expect(() => assessOcr(fields(), { threshold })).toThrow("Invalid OCR threshold");
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
    for (const result of [assessOcr(input), assessOcr(fields(), { qrPage: 2 })]) {
      expect(result.eligible).toBe(false);
      expect(result.canonical).toBeNull();
      expect(result.issues.map((issue) => issue.code)).toContain("MULTIPLE_PAGES");
    }
  });

  it("still rejects unsupported templates and missing attributes", () => {
    const unsupported = assessOcr(fields(), { templateSupported: false });
    expect(unsupported.eligible).toBe(false);
    expect(unsupported.canonical).toBeNull();
    expect(unsupported.issues.map((issue) => issue.code)).toEqual(["UNSUPPORTED_TEMPLATE"]);
    const missing = assessOcr({});
    expect(missing.eligible).toBe(false);
    expect(missing.canonical).toBeNull();
    expect(missing.issues.map(({ code, field }) => ({ code, field }))).toEqual(
      FIELD_KEYS.map((field) => ({ code: "MISSING_FIELD", field })),
    );
  });

  it("reports invalid confidence even when that field has no text", () => {
    const input = fields();
    input.full_name.text = " ";
    input.full_name.confidence = Number.NaN;
    const result = assessOcr(input);
    expect(result.eligible).toBe(false);
    expect(result.canonical).toBeNull();
    expect(result.issues.map(({ code, field }) => ({ code, field }))).toEqual([
      { code: "INVALID_CONFIDENCE", field: "full_name" },
      { code: "MISSING_FIELD", field: "full_name" },
    ]);
  });

  it.each([
    { label: "invalid page", code: "INVALID_PAGE", change: (input: Record<FieldKey, OcrField>) => { input.full_name.page = 0; } },
    { label: "invalid date", code: "INVALID_DATE", change: (input: Record<FieldKey, OcrField>) => { input.graduation_date.text = "31 Februari 2026"; } },
    { label: "overlong attribute", code: "FIELD_TOO_LONG", change: (input: Record<FieldKey, OcrField>) => { input.full_name.text = "A".repeat(1025); } },
    { label: "inconsistent candidate", code: "AMBIGUOUS_FIELD", change: (input: Record<FieldKey, OcrField>) => { input.full_name.candidates = ["Andi Pertama"]; } },
  ])("still rejects $label when one valid score reaches the threshold", ({ code, change }) => {
    const input = fieldsWithConfidence(0.1);
    input.diploma_number.confidence = 0.7;
    change(input);
    const result = assessOcr(input);
    expect(result.eligible).toBe(false);
    expect(result.canonical).toBeNull();
    expect(result.issues.map((issue) => issue.code)).toEqual([code]);
  });
});
