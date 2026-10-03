import { describe, expect, it } from "vitest";
import { normalizeAttributes, normalizeDate, normalizeField, parseDiplomaAttributes, type DiplomaAttributes } from "../src/index";

const attributes: DiplomaAttributes = {
  full_name: "  Andi   Pratama ",
  diploma_number: "  IF /  01-2026 ",
  study_program: " Teknik\t Informatika ",
  graduation_date: "15 Agustus 2026",
};

describe("academic-diploma-v1 deterministic normalization", () => {
  it("normalizes the same vectors for issuer and OCR while preserving diploma separators", () => {
    expect(normalizeAttributes(attributes)).toEqual({
      full_name: "ANDI PRATAMA",
      diploma_number: "IF /  01-2026",
      study_program: "TEKNIK INFORMATIKA",
      graduation_date: "2026-08-15",
    });
    expect(normalizeAttributes(normalizeAttributes(attributes))).toEqual(normalizeAttributes(attributes));
  });

  it("composes Unicode without stripping accents, punctuation, or substituting O/0", () => {
    expect(normalizeField("full_name", " Jose\u0301 O'Neil-Sari ")).toBe("JOSÉ O'NEIL-SARI");
    expect(normalizeField("full_name", "José Oneil Sari")).not.toBe("JOSÉ O'NEIL-SARI");
    expect(normalizeField("diploma_number", "OI-01")).toBe("OI-01");
  });

  it("does not equate study program aliases or discard internal number whitespace", () => {
    expect(normalizeField("study_program", "Informatika")).not.toBe(normalizeField("study_program", "Teknik Informatika"));
    expect(normalizeField("diploma_number", "A  B")).not.toBe(normalizeField("diploma_number", "A B"));
  });

  it("rejects incomplete runtime JSON", () => {
    expect(() => parseDiplomaAttributes({ ...attributes, diploma_number: 123 })).toThrow();
    expect(() => parseDiplomaAttributes({ ...attributes, full_name: "  " })).toThrow();
    expect(() => parseDiplomaAttributes(null)).toThrow();
  });
});

describe("calendar dates", () => {
  it.each([
    ["15 Agustus 2026", "2026-08-15"],
    ["August 15, 2026", "2026-08-15"],
    ["15 August 2026", "2026-08-15"],
    ["2024-02-29", "2024-02-29"],
    ["29/02/2024", "2024-02-29"],
    ["02/29/2024", "2024-02-29"],
    ["2026/8/15", "2026-08-15"],
    ["03/03/2026", "2026-03-03"],
  ])("accepts the unambiguous date %s", (raw, result) => {
    expect(normalizeDate(raw)).toBe(result);
  });

  it("requires a declared template layout for ambiguous numeric dates", () => {
    expect(() => normalizeDate("03/04/2026")).toThrow(/ambigu/i);
    expect(normalizeDate("03/04/2026", "DMY")).toBe("2026-04-03");
    expect(normalizeDate("03/04/2026", "MDY")).toBe("2026-03-04");
  });

  it.each(["2026-02-29", "1900-02-29", "31 April 2026", "2026-13-01", "2026-00-01", "0000-01-01", "32/03/2026", "2026-08-15T00:00:00Z", "15/8-2026", "15/08/26"])("rejects invalid or unsupported dates %s", (date) => {
    expect(() => normalizeDate(date)).toThrow();
  });
});
