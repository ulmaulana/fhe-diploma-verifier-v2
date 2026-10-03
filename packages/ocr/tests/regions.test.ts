import { describe, expect, it, vi } from 'vitest';
import { readFieldRegions } from '../src/regions';
import type { ParsedPage } from '../src/parse';
import type { OcrWord } from '../src/types';

const page = { width: 100, height: 60, rgb: Uint8Array.from({ length: 100 * 60 * 3 }, (_, i) => i % 251) };
const parsed = (): ParsedPage => ({ template: 'D1', text: '', fields: { full_name: { text: 'Budi S', candidates: ['Budi S'], confidence: 0.88, page: 1, boundingBox: { x: 20, y: 15, width: 50, height: 20 } } } });
const word = (text: string, confidence: number): OcrWord => ({ text, confidence, block: 1, paragraph: 1, line: 1, left: 10, top: 10, width: 20, height: 20 });
const engine = (words: OcrWord[]) => ({ read: vi.fn().mockResolvedValue(words), close: vi.fn() });

describe('D1 region recheck', () => {
  it('uses the visible pixel crop and the minimum raw confidence when both passes agree', async () => {
    const result = parsed(); const reader = engine([word('Budi', 96), word('S', 92)]);
    await readFieldRegions(result, page, reader, Date.now() + 10_000);
    const [crop, mask, timeout] = reader.read.mock.calls[0]!;
    expect(crop).toMatchObject({ width: 70, height: 40 });
    expect(crop.rgb.subarray(0, 70 * 3)).toEqual(page.rgb.subarray((5 * 100 + 10) * 3, (5 * 100 + 80) * 3));
    expect(mask).toEqual([]); expect(timeout).toBeGreaterThan(0); expect(timeout).toBeLessThanOrEqual(10_000);
    expect(result.fields.full_name).toMatchObject({ text: 'Budi S', candidates: ['Budi S'], confidence: 0.92, page: 1 });
  });
  it.each([['Budi', '5'], []])('fails closed on a different or empty regional reading: %j', async (...text) => {
    const result = parsed(); const reader = engine(text.flat().map(value => word(value, 99)));
    await readFieldRegions(result, page, reader, Date.now() + 10_000);
    expect(result.fields.full_name?.confidence).toBe(0);
    expect(result.fields.full_name?.text).toBe('Budi S');
    expect(result.fields.full_name?.candidates).toHaveLength(2);
  });
  it('does not raise low confidence to the threshold', async () => {
    const result = parsed();
    await readFieldRegions(result, page, engine([word('Budi', 85), word('S', 89)]), Date.now() + 10_000);
    expect(result.fields.full_name?.confidence).toBe(0.85);
  });
  it('preserves duplicate candidates, supported high-confidence fields and other templates', async () => {
    const reader = engine([]);
    const duplicate = parsed(); duplicate.fields.full_name!.candidates.push('Other');
    const confident = parsed(); confident.fields.full_name!.confidence = 0.95;
    const other = parsed(); other.template = 'A1';
    for (const result of [duplicate, confident, other]) await readFieldRegions(result, page, reader, Date.now() + 10_000);
    expect(reader.read).not.toHaveBeenCalled();
  });
  it('honors the document deadline before starting another OCR pass', async () => {
    const reader = engine([]);
    await expect(readFieldRegions(parsed(), page, reader, Date.now() - 1)).rejects.toMatchObject({ code: 'OCR_TIMEOUT' });
    expect(reader.read).not.toHaveBeenCalled();
  });
});
