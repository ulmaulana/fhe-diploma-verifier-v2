import type { FieldKey, OcrField } from '@verifikasi/domain';
import { OCR_CONFIG, OCR_CONFIG_HASH } from './config';
import { createTesseractEngine } from './engine';
import { parseFields, type ParsedPage } from './parse';
import { readQrCodes } from './qr';
import { readFieldRegions } from './regions';
import { loadMupdf, renderPages } from './render';
import { DocumentError, type Extraction, type OcrEngine } from './types';

export const DEFAULT_TIMEOUT_MS = 210_000;
/** Per-page recognition cap, as the former pytesseract call used. */
const PAGE_TIMEOUT_MS = 35_000;

export interface ExtractOptions {
  timeoutMs?: number;
  /** Test seam: a stand-in engine. Production always creates one isolated worker per document. */
  engine?: OcrEngine;
}

/** Render, read QR codes and OCR every visible page; exactly one diploma page must remain. */
export async function extractDocument(bytes: Uint8Array, mime: string, options: ExtractOptions = {}): Promise<Extraction> {
  const result: Extraction = { fields: {}, qrCandidates: [], pageCount: 0, templateId: null, ocrConfigVersion: OCR_CONFIG.version, ocrConfigHash: OCR_CONFIG_HASH };
  const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let engine = options.engine;
  const ownsEngine = !engine;
  try {
    const mupdf = await loadMupdf().catch(() => { throw new DocumentError('OCR_UNAVAILABLE'); });
    const candidates: (ParsedPage & { page: number; qrs: string[] })[] = [];
    let number = 0;
    // Document validation happens while rendering, before the OCR engine is required.
    for (const page of renderPages(mupdf, bytes, mime)) {
      result.pageCount = ++number;
      const qr = await readQrCodes(page);
      engine ??= await createTesseractEngine(mupdf);
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new DocumentError('OCR_TIMEOUT');
      const parsed = parseFields(await engine.read(page, qr.bounds, Math.min(PAGE_TIMEOUT_MS, remaining)), number);
      await readFieldRegions(parsed, page, engine, deadline);
      result.qrCandidates.push(...qr.values);
      if (parsed.template || Object.keys(parsed.fields).length || qr.values.length) candidates.push({ ...parsed, page: number, qrs: qr.values });
    }
    if (candidates.length !== 1) {
      result.reason = 'Tidak ada satu halaman ijazah yang dapat dipastikan.';
      return result;
    }
    const [chosen] = candidates as [typeof candidates[number]];
    result.fields = chosen.fields as Partial<Record<FieldKey, OcrField>>;
    result.qrPage = chosen.qrs.length ? chosen.page : null;
    result.templateId = chosen.template === 'D1' ? 'issued-diploma-v1' : chosen.template ? `synthetic-${chosen.template.toLowerCase()}-v1` : null;
    result.dateFormat = chosen.template !== 'B1' ? 'DMY' : 'MDY';
    result.text = chosen.text;
    return result;
  } catch (error) {
    result.errorCode = error instanceof DocumentError ? error.code : 'OCR_FAILURE';
    return result;
  } finally {
    if (ownsEngine) await engine?.close();
  }
}
