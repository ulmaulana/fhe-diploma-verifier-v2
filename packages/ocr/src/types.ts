import type { FieldKey, OcrField } from '@verifikasi/domain';

export type OcrErrorCode = 'PDF_PASSWORD' | 'TOO_MANY_PAGES' | 'INVALID_DOCUMENT' | 'RESOLUTION_LIMIT' | 'OCR_UNAVAILABLE' | 'OCR_TIMEOUT' | 'OCR_FAILURE';
export type TemplateId = 'A1' | 'B1' | 'D1';

/** JSON contract persisted as ocr.json; identical in shape to the former Python worker output. */
export interface Extraction {
  fields: Partial<Record<FieldKey, OcrField>>;
  qrCandidates: string[];
  qrPage?: number | null;
  pageCount: number;
  templateId: string | null;
  dateFormat?: 'DMY' | 'MDY' | 'YMD';
  text?: string;
  ocrConfigHash: string;
  ocrConfigVersion: string;
  reason?: string;
  errorCode?: OcrErrorCode;
}

/** One recognized word, as Tesseract reports it at TSV level 5. */
export interface OcrWord {
  text: string;
  /** Tesseract word confidence, 0-100. */
  confidence: number;
  block: number;
  paragraph: number;
  line: number;
  left: number;
  top: number;
  width: number;
  height: number;
  /** Visible character boxes from the same recognition pass, when available. */
  symbols?: OcrSymbol[];
}

export interface OcrSymbol {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface RenderedPage {
  width: number;
  height: number;
  /** Packed RGB samples, width * height * 3 bytes. */
  rgb: Uint8Array;
}

export interface QrBounds { left: number; top: number; right: number; bottom: number }

export interface OcrEngine {
  /** Recognize one page with QR areas blanked; rejects with OCR_TIMEOUT after `timeoutMs`. */
  read(page: RenderedPage, mask: QrBounds[], timeoutMs: number): Promise<OcrWord[]>;
  close(): Promise<void>;
}

export class DocumentError extends Error {
  constructor(readonly code: OcrErrorCode) {
    super(code);
  }
}
