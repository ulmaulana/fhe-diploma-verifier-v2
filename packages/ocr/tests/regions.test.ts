import { describe, expect, it, vi } from 'vitest';
import { readFieldRegions } from '../src/regions';
import type { ParsedPage } from '../src/parse';
import type { OcrWord } from '../src/types';

const page = { width: 100, height: 60, rgb: Uint8Array.from({ length: 100 * 60 * 3 }, (_, i) => i % 251) };
const parsed = (): ParsedPage => ({ template: 'D1', text: '', fields: { full_name: { text: 'Budi S', candidates: ['Budi S'], confidence: 0.68, page: 1, boundingBox: { x: 20, y: 15, width: 50, height: 20 } } } });
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
    await readFieldRegions(result, page, engine([word('Budi', 65), word('S', 69)]), Date.now() + 10_000);
    expect(result.fields.full_name?.confidence).toBe(0.65);
  });
  it.each([0.7, 0.7001])('does not re-read confidence at or above the 70%% boundary: %s', async confidence => {
    const result = parsed(); result.fields.full_name!.confidence = confidence;
    const reader = engine([]);
    await readFieldRegions(result, page, reader, Date.now() - 1);
    expect(reader.read).not.toHaveBeenCalled();
    expect(result.fields.full_name?.confidence).toBe(confidence);
  });
  it('re-reads confidence immediately below 70%', async () => {
    const result = parsed(); result.fields.full_name!.confidence = 0.6999;
    const reader = engine([word('Budi', 70), word('S', 100)]);
    await readFieldRegions(result, page, reader, Date.now() + 10_000);
    expect(reader.read).toHaveBeenCalledOnce();
    expect(result.fields.full_name?.confidence).toBe(0.7);
  });
  it.each([-0.01, -Number.MIN_VALUE, 1.01, Infinity, -Infinity, NaN])('does not repair an invalid initial confidence: %s', async confidence => {
    const result = parsed(); result.fields.full_name!.confidence = confidence;
    const reader = engine([word('Budi', 100), word('S', 100)]);
    await readFieldRegions(result, page, reader, Date.now() + 10_000);
    expect(reader.read).not.toHaveBeenCalled();
    expect(result.fields.full_name?.confidence).toBe(confidence);
  });
  it.each([
    [-1, -0.01],
    [-Number.MIN_VALUE, -Number.MIN_VALUE],
    [101, 1.01],
    [Infinity, Infinity],
    [-Infinity, -Infinity],
    [NaN, NaN],
  ])('propagates invalid regional raw confidence %s despite a valid lower score', async (score, expected) => {
    const result = parsed();
    await readFieldRegions(result, page, engine([word('Budi', 63), word('S', score)]), Date.now() + 10_000);
    expect(result.fields.full_name).toMatchObject({ text: 'Budi S', candidates: ['Budi S'] });
    expect(result.fields.full_name?.confidence).toBe(expected);
  });
  it('keeps invalid regional confidence when the reading also disagrees', async () => {
    const result = parsed();
    await readFieldRegions(result, page, engine([word('Budi', 63), word('5', 101)]), Date.now() + 10_000);
    expect(result.fields.full_name).toMatchObject({ text: 'Budi S', candidates: ['Budi S', 'Budi 5'], confidence: 1.01 });
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
  it.each([
    { x: 200, y: 15, width: 50, height: 20 },
    { x: 20, y: 200, width: 50, height: 20 },
    { x: NaN, y: 15, width: 50, height: 20 },
    { x: 20, y: NaN, width: 50, height: 20 },
  ])('fails closed on invalid crop dimensions without replacing the raw score: %j', async boundingBox => {
    const result = parsed(); result.fields.full_name!.boundingBox = boundingBox;
    const reader = engine([word('Budi', 100), word('S', 100)]);
    await expect(readFieldRegions(result, page, reader, Date.now() + 10_000)).rejects.toMatchObject({ code: 'OCR_FAILURE' });
    expect(reader.read).not.toHaveBeenCalled();
    expect(result.fields.full_name).toMatchObject({ text: 'Budi S', confidence: 0.68, candidates: ['Budi S'] });
  });
});
