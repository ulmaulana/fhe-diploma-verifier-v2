import { DocumentError, type OcrEngine, type RenderedPage } from './types';
import type { ParsedPage } from './parse';
import { OCR_CONFIG } from './config';

/** Re-read D1 values as text blocks, independent of page headings and other fields.
 * Both visual passes must agree. No reference attributes or PDF text layer are used. */
export async function readFieldRegions(parsed: ParsedPage, page: RenderedPage, engine: OcrEngine, deadline: number): Promise<void> {
  if (parsed.template !== 'D1') return;
  const { below, padding } = OCR_CONFIG.region_recheck;
  for (const field of Object.values(parsed.fields)) {
    const box = field.boundingBox;
    if (!box || field.candidates.length !== 1 || !Number.isFinite(field.confidence) || field.confidence >= below) continue;
    const left = Math.max(0, Math.floor(box.x) - padding);
    const top = Math.max(0, Math.floor(box.y) - padding);
    const width = Math.min(page.width, Math.ceil(box.x + box.width) + padding) - left;
    const height = Math.min(page.height, Math.ceil(box.y + box.height) + padding) - top;
    if (width <= 0 || height <= 0) { field.confidence = 0; continue; }
    const rgb = new Uint8Array(width * height * 3);
    for (let row = 0; row < height; row++) {
      const start = ((top + row) * page.width + left) * 3;
      rgb.set(page.rgb.subarray(start, start + width * 3), row * width * 3);
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new DocumentError('OCR_TIMEOUT');
    const words = (await engine.read({ width, height, rgb }, [], Math.min(35_000, remaining))).filter(word => word.text.trim());
    const text = words.map(word => word.text).join(' ');
    if (text !== field.text) {
      field.candidates.push(text);
      field.confidence = 0;
    } else {
      field.confidence = Math.min(...words.map(word => word.confidence)) / 100;
    }
  }
}
