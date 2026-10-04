import { createHash } from 'node:crypto';
import { OCR_CONFIDENCE_POLICY, OCR_CONFIDENCE_THRESHOLD } from '@verifikasi/domain';

/** Exact installed versions; tests fail if package.json drifts without updating the config hash. */
export const TESSERACT_JS_VERSION = '7.0.0';
export const TESSDATA = '@tesseract.js-data/ind@1.0.0/4.0.0+@tesseract.js-data/eng@1.0.0/4.0.0';

export const OCR_CONFIG = {
  version: 'tesseract-js-ind-eng-v6',
  dpi: 200,
  psm: 6,
  languages: 'ind+eng',
  templates: ['A1', 'B1', 'D1'],
  confidence: 'minimum-word',
  confidence_threshold: OCR_CONFIDENCE_THRESHOLD,
  confidence_policy: OCR_CONFIDENCE_POLICY,
  qr_mask: 'detected-bounds-10px',
  region_recheck: { template: 'D1', below: OCR_CONFIDENCE_THRESHOLD, padding: 10, agreement: 'exact-text', confidence: 'minimum-word' },
  engine: `tesseract.js@${TESSERACT_JS_VERSION}`,
  tessdata: TESSDATA,
} as const;

/** Same canonical form as Python json.dumps(sort_keys=True): sorted keys, ", " and ": " separators. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(', ')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}: ${canonicalJson((value as Record<string, unknown>)[key])}`).join(', ')}}`;
  }
  return JSON.stringify(value);
}

export const OCR_CONFIG_HASH = `0x${createHash('sha256').update(canonicalJson(OCR_CONFIG)).digest('hex')}`;
