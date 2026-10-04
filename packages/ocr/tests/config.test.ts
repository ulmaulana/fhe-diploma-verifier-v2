import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { OCR_CONFIDENCE_POLICY, OCR_CONFIDENCE_THRESHOLD } from '@verifikasi/domain';
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
    expect(OCR_CONFIG.version).toBe('tesseract-js-ind-eng-v6');
    expect(OCR_CONFIG_HASH).toBe(`0x${createHash('sha256').update(canonicalJson(OCR_CONFIG)).digest('hex')}`);
  });

  it('binds the shared decision policy and threshold into the configuration hash', () => {
    expect(OCR_CONFIDENCE_THRESHOLD).toBe(0.7);
    expect(OCR_CONFIDENCE_POLICY).toBe('all-required-fields-below-threshold');
    expect(OCR_CONFIG).toMatchObject({ confidence_threshold: OCR_CONFIDENCE_THRESHOLD, confidence_policy: OCR_CONFIDENCE_POLICY, region_recheck: { below: OCR_CONFIDENCE_THRESHOLD, agreement: 'exact-text', confidence: 'minimum-word' } });
    for (const changed of [
      { ...OCR_CONFIG, confidence_threshold: 0.9 },
      { ...OCR_CONFIG, confidence_policy: 'any-required-field-below-threshold' },
    ]) {
      expect(`0x${createHash('sha256').update(canonicalJson(changed)).digest('hex')}`).not.toBe(OCR_CONFIG_HASH);
    }
  });
});
