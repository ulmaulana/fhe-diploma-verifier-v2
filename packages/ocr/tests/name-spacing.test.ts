import { describe, expect, it, vi } from 'vitest';
import { assessOcr, type FieldKey } from '@verifikasi/domain';
import { nameText } from '../src/name-spacing';
import { parseFields, type ParsedPage } from '../src/parse';
import { readFieldRegions } from '../src/regions';
import type { OcrSymbol, OcrWord } from '../src/types';

type Range = readonly [number, number];

function boxed(text: string, symbols: OcrSymbol[], line = 2, confidence = 96): OcrWord {
  const left = Math.min(...symbols.map(symbol => symbol.left));
  const top = Math.min(...symbols.map(symbol => symbol.top));
  return {
    text, confidence, block: 1, paragraph: 1, line, left, top,
    width: Math.max(...symbols.map(symbol => symbol.left + symbol.width)) - left,
    height: Math.max(...symbols.map(symbol => symbol.top + symbol.height)) - top,
    symbols,
  };
}

function glyphs(text: string, ranges: readonly Range[], line = 2, confidence = 96): OcrWord {
  return boxed(text, [...text].map((character, index) => ({
    text: character, left: ranges[index]![0], top: 10,
    width: ranges[index]![1] - ranges[index]![0], height: 34,
  })), line, confidence);
}

// Visible symbol positions from the user's 200-DPI name crop. Tesseract
// recognizes the 13-pixel A-Y space as part of MAULANAY, but retains Y-S.
const maulanaRanges: readonly Range[] = [[10, 43], [48, 78], [82, 108], [117, 136], [138, 167], [172, 199], [204, 233], [246, 272]];
function originalName(): OcrWord[] {
  return [glyphs('MAULANAY', maulanaRanges, 2, 76.290543), glyphs('S', [[287, 309]])];
}

function joinedName(): OcrWord[] {
  return [glyphs('MAULANAY', [...maulanaRanges.slice(0, -1), [240, 266]]), glyphs('S', [[281, 303]])];
}

function plainLine(text: string, line: number): OcrWord[] {
  return text.split(' ').map((word, index) => ({
    text: word, confidence: 96, block: 1, paragraph: 1, line,
    left: index * 80, top: line * 70, width: 75, height: 20,
  }));
}

function d1Name(words = originalName()): ParsedPage {
  return parseFields([
    ...plainLine('TEMPLATE D1', 0), ...plainLine('Nama lengkap:', 1), ...words,
  ], 1);
}

describe('visible D1 name spacing', () => {
  it('recovers the missing space using visible glyphs and an existing same-line space', () => {
    const words = originalName();
    const before = structuredClone(words);
    expect(nameText(words)).toBe('MAULANA Y S');
    expect(words).toEqual(before);
  });

  it('preserves a genuinely joined name beside the same initial', () => {
    expect(nameText(joinedName())).toBe('MAULANAY S');
  });

  it.each([
    ['ANDIAB', [[10, 40], [45, 72], [81, 109], [114, 126], [141, 171], [188, 212]], 'ANDI A B'],
    ['BUDIS', [[10, 34], [41, 67], [76, 103], [108, 120], [137, 159]], 'BUDI S'],
    ['ANDIAB', [[10, 40], [45, 72], [81, 109], [114, 126], [128, 158], [163, 187]], 'ANDIAB'],
    ['BUDIS', [[10, 34], [41, 67], [76, 103], [108, 120], [124, 146]], 'BUDIS'],
  ] satisfies [string, Range[], string][])('reads a merged %s according to its visible spacing: %s', (text, ranges, expected) => {
    expect(nameText([glyphs(text, ranges)])).toBe(expected);
  });

  it('keeps a weaker ambiguous gap when there is no accepted or clear visual space', () => {
    const merged = glyphs('MAULANAYS', [...maulanaRanges, [287, 309]]);
    expect(nameText([merged])).toBe('MAULANAYS');
  });

  it('does not split a uniformly tracked word into letters', () => {
    expect(nameText([glyphs('ANDIAB', [[10, 30], [50, 70], [90, 110], [130, 150], [170, 190], [210, 230]])])).toBe('ANDIAB');
  });

  it('does not trust a recognized boundary with insufficient visible separation', () => {
    const words = originalName();
    words[1] = glyphs('S', [[279, 301]]);
    expect(nameText(words)).toBe('MAULANAY S');
  });

  const malformed: { name: string; mutate(words: OcrWord[]): void }[] = [
    { name: 'missing symbols', mutate: words => { delete words[0]!.symbols; } },
    { name: 'empty symbols', mutate: words => { words[0]!.symbols = []; } },
    { name: 'different symbol text', mutate: words => { words[0]!.symbols![0]!.text = 'N'; } },
    { name: 'nonfinite word box', mutate: words => { words[0]!.left = NaN; } },
    { name: 'nonfinite symbol box', mutate: words => { words[0]!.symbols![0]!.left = Infinity; } },
    { name: 'zero width word', mutate: words => { words[0]!.width = 0; } },
    { name: 'zero width symbol', mutate: words => { words[0]!.symbols![0]!.width = 0; } },
    { name: 'overlapping symbols', mutate: words => { words[0]!.symbols![1]!.left = 42; } },
    { name: 'symbol outside word box', mutate: words => { words[0]!.symbols![0]!.left = 9; } },
    { name: 'inconsistent heights', mutate: words => {
      words[0]!.symbols![0]!.height = 25;
      words[0] = boxed(words[0]!.text, words[0]!.symbols!);
    } },
    { name: 'different baselines', mutate: words => {
      words[0]!.symbols![0]!.top = 20;
      words[0] = boxed(words[0]!.text, words[0]!.symbols!);
    } },
  ];
  it.each(malformed)('keeps the original reading with $name', ({ mutate }) => {
    const words = originalName();
    mutate(words);
    expect(nameText(words)).toBe('MAULANAY S');
  });

  it.each(['Maulanay', "MAULANA'Y", 'MAULANA-Y'])('preserves case and punctuation in %s', text => {
    const ranges = Array.from({ length: text.length }, (_, index): Range => [10 + index * 30, 30 + index * 30]);
    expect(nameText([glyphs(text, ranges)])).toBe(text);
  });

  it.each(['line', 'paragraph', 'block'] as const)('does not calibrate a space across a different %s', key => {
    const words = originalName();
    words[1]![key] += 1;
    expect(nameText(words)).toBe('MAULANAY S');
  });
});

describe('D1 field integrity after spacing recovery', () => {
  it('preserves the original word confidence, field box, and raw OCR text', () => {
    const parsed = d1Name();
    expect(parsed.fields.full_name).toMatchObject({
      text: 'MAULANA Y S', candidates: ['MAULANA Y S'], confidence: 0.76290543,
      page: 1, boundingBox: { x: 10, y: 10, width: 299, height: 34 },
    });
    expect(parsed.text).toContain('MAULANAY S');
    expect(parsed.text).not.toContain('MAULANA Y S');
  });

  it.each([
    ['A1', 'Nama:'], ['B1', 'Full Name:'],
  ])('does not correct the %s name field', (template, label) => {
    const words = originalName();
    words.forEach(word => { word.line = 1; });
    const parsed = parseFields([...plainLine(`TEMPLATE ${template}`, 0), ...plainLine(label, 1), ...words], 1);
    expect(parsed.fields.full_name?.text).toBe('MAULANAY S');
  });

  it.each([
    ['Nomor ijazah:', 'diploma_number'], ['Program studi:', 'study_program'], ['Tanggal lulus:', 'graduation_date'],
  ] satisfies [string, FieldKey][])('does not apply name spacing to %s', (label, field) => {
    const parsed = parseFields([...plainLine('TEMPLATE D1', 0), ...plainLine(label, 1), ...originalName()], 1);
    expect(parsed.fields[field]?.text).toBe('MAULANAY S');
  });

  it.each([[-1, -0.01], [101, 1.01], [NaN, NaN], [Infinity, Infinity]])('retains invalid word confidence %s after recovery', (confidence, expected) => {
    const words = originalName();
    words[1]!.confidence = confidence;
    const parsed = d1Name(words);
    expect(parsed.fields.full_name?.text).toBe('MAULANA Y S');
    expect(parsed.fields.full_name?.confidence).toBe(expected);
    expect(assessOcr(parsed.fields).issues).toContainEqual(expect.objectContaining({ code: 'INVALID_CONFIDENCE', field: 'full_name' }));
  });

  it('retains duplicate candidates and their lower confidence instead of choosing one', () => {
    const second = joinedName().map(word => ({ ...word, line: 4, confidence: 63 }));
    const parsed = parseFields([
      ...plainLine('TEMPLATE D1', 0), ...plainLine('Nama lengkap:', 1), ...originalName(),
      ...plainLine('Nama lengkap:', 3), ...second,
    ], 1);
    expect(parsed.fields.full_name).toMatchObject({
      text: 'MAULANA Y S', candidates: ['MAULANA Y S', 'MAULANAY S'], confidence: 0.63,
    });
    const assessment = assessOcr(parsed.fields);
    expect(assessment.eligible).toBe(false);
    expect(assessment.issues).toContainEqual(expect.objectContaining({ code: 'AMBIGUOUS_FIELD', field: 'full_name' }));
  });
});

describe('D1 regional spacing agreement', () => {
  const page = { width: 400, height: 100, rgb: new Uint8Array(400 * 100 * 3).fill(255) };

  it('accepts an independent low-confidence region reading only when its visual spacing agrees', async () => {
    const parsed = d1Name(originalName().map(word => ({ ...word, confidence: 65 })));
    const read = vi.fn().mockResolvedValue(originalName().map(word => ({ ...word, confidence: 90 })));
    await readFieldRegions(parsed, page, { read, close: vi.fn() }, Date.now() + 10_000);
    expect(read).toHaveBeenCalledOnce();
    expect(parsed.fields.full_name).toMatchObject({ text: 'MAULANA Y S', candidates: ['MAULANA Y S'], confidence: 0.9 });
  });

  it('fails closed when a region visibly contains a joined name', async () => {
    const parsed = d1Name(originalName().map(word => ({ ...word, confidence: 65 })));
    const read = vi.fn().mockResolvedValue(joinedName().map(word => ({ ...word, confidence: 90 })));
    await readFieldRegions(parsed, page, { read, close: vi.fn() }, Date.now() + 10_000);
    expect(read).toHaveBeenCalledOnce();
    expect(parsed.fields.full_name).toMatchObject({
      text: 'MAULANA Y S', candidates: ['MAULANA Y S', 'MAULANAY S'], confidence: 0,
    });
    expect(assessOcr(parsed.fields).issues).toContainEqual(expect.objectContaining({ code: 'AMBIGUOUS_FIELD', field: 'full_name' }));
  });
});
