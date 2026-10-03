import { FIELD_KEYS, OCR_CONFIDENCE_THRESHOLD, type DiplomaAttributes, type FieldKey, type OcrField } from "../schema";
import { DomainValidationError, normalizeField, type NormalizationOptions } from "../normalization/index";

export interface OcrIssue { code: string; field?: FieldKey; message: string }
export interface OcrAssessment {
  eligible: boolean;
  canonical: DiplomaAttributes | null;
  issues: OcrIssue[];
  page: number | null;
}
export interface OcrAssessmentOptions extends NormalizationOptions {
  threshold?: number;
  qrPage?: number;
  templateSupported?: boolean;
}

export function assessOcr(fields: Partial<Record<FieldKey, OcrField>>, options: OcrAssessmentOptions = {}): OcrAssessment {
  const issues: OcrIssue[] = [];
  const canonical: Partial<DiplomaAttributes> = {};
  const pages = new Set<number>();
  const threshold = options.threshold ?? OCR_CONFIDENCE_THRESHOLD;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new Error("Invalid OCR threshold");
  if (options.templateSupported === false) issues.push({ code: "UNSUPPORTED_TEMPLATE", message: "Template ijazah belum didukung." });
  for (const key of FIELD_KEYS) {
    const field = fields[key];
    if (!field || typeof field.text !== "string" || !field.text.trim()) {
      issues.push({ code: "MISSING_FIELD", field: key, message: "Atribut wajib belum terbaca." });
      continue;
    }
    if (!Number.isFinite(field.confidence) || field.confidence < threshold || field.confidence > 1) {
      issues.push({ code: "LOW_CONFIDENCE", field: key, message: "Pembacaan atribut belum cukup jelas; unggah ulang dokumen." });
    }
    if (field.candidates && (field.candidates.length !== 1 || field.candidates[0] !== field.text)) {
      issues.push({ code: "AMBIGUOUS_FIELD", field: key, message: "Ditemukan lebih dari satu kandidat atau pembacaan atribut tidak konsisten." });
    }
    if (!Number.isInteger(field.page) || field.page < 1) {
      issues.push({ code: "INVALID_PAGE", field: key, message: "Halaman sumber atribut belum dapat dipastikan." });
    } else {
      pages.add(field.page);
    }
    try {
      canonical[key] = normalizeField(key, field.text, options);
    } catch (error) {
      if (!(error instanceof DomainValidationError)) throw error;
      issues.push({ code: error.code, field: key, message: error.message });
    }
  }
  if (pages.size > 1 || (options.qrPage !== undefined && (pages.size !== 1 || !pages.has(options.qrPage)))) {
    issues.push({ code: "MULTIPLE_PAGES", message: "QR dan empat atribut wajib berada pada satu halaman ijazah yang sama." });
  }
  return {
    eligible: issues.length === 0,
    canonical: issues.length === 0 ? canonical as DiplomaAttributes : null,
    issues,
    page: pages.size === 1 ? [...pages][0]! : null,
  };
}
