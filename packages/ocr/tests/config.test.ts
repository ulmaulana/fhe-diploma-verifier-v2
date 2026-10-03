import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { canonicalJson, OCR_CONFIG, OCR_CONFIG_HASH, TESSDATA, TESSERACT_JS_VERSION } from '../src/config';

const require = createRequire(import.meta.url);
const installed = (name: string) => (JSON.parse(readFileSync(require.resolve(`${name}/package.json`), 'utf8')) as { version: string }).version;

describe('OCR configuration identity', () => {
  it('names the exact installed engine and language data versions', () => {
    expect(TESSERACT_JS_VERSION).toBe(installed('tesseract.js'));
    expect(TESSDATA).toBe(`@tesseract.js-data/ind@${installed('@tesseract.js-data/ind')}/4.0.0+@tesseract.js-data/eng@${installed('@tesseract.js-data/eng')}/4.0.0`);
  });

  it('hashes the canonical configuration', () => {
    expect(OCR_CONFIG_HASH).toMatch(/^0x[0-9a-f]{64}$/);
    expect(canonicalJson({ b: [1, 'x'], a: { d: true, c: null } })).toBe('{"a": {"c": null, "d": true}, "b": [1, "x"]}');
    expect(OCR_CONFIG.version).toBe('tesseract-js-ind-eng-v5');
  });
});
