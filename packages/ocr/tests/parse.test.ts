import { describe, expect, it } from 'vitest';
import { parseFields } from '../src/parse';
import type { OcrWord } from '../src/types';

/** Word rows shaped like Tesseract TSV output, one line per array entry. */
function ocrWords(lines: string[], confidence = 96): OcrWord[] {
  return lines.flatMap((line, index) => line.split(' ').map((text, column) => ({
    text, confidence, block: 1, paragraph: 1, line: index + 1,
    left: column * 80, top: (index + 1) * 30, width: 75, height: 20,
  })));
}

describe('parseFields', () => {
  it('retains punctuation and never corrects toward reference values', () => {
    const { fields } = parseFields(ocrWords(['VERIFIKASI TEMPLATE A1', "Nama: ANDI O'NEIL", 'Nomor Ijazah: ABC/0I-1', 'Program Studi: TEKNIK INFORMATIKA', 'Tanggal Lulus: 03/04/2026']), 2);
    expect(fields.full_name?.text).toBe("ANDI O'NEIL");
    expect(fields.diploma_number?.text).toBe('ABC/0I-1');
    expect(fields.graduation_date?.text).toBe('03/04/2026');
    expect(fields.full_name?.page).toBe(2);
  });

  it('keeps every duplicate candidate instead of choosing silently', () => {
    const { fields } = parseFields(ocrWords(['TEMPLATE A1', 'Nama: ANDI', 'Nama: BUDI']), 1);
    expect(fields.full_name?.candidates).toEqual(['ANDI', 'BUDI']);
  });

  it('preserves low confidence for the domain gate', () => {
    const { fields } = parseFields(ocrWords(['TEMPLATE B1', 'Full Name: ANDI'], 67), 1);
    expect(fields.full_name?.confidence).toBe(0.67);
  });

  it('does not guess fields without exactly one template marker', () => {
    expect(parseFields(ocrWords(['Nama: ANDI']), 1)).toMatchObject({ template: null, fields: {} });
    expect(parseFields(ocrWords(['TEMPLATE A1', 'TEMPLATE B1', 'Nama: ANDI']), 1)).toMatchObject({ template: null, fields: {} });
  });

  it('uses the minimum word confidence and the union box of the value words only', () => {
    const words = ocrWords(['TEMPLATE A1', 'Nama: ANDI PRATAMA']);
    words.find(word => word.text === 'PRATAMA')!.confidence = 91;
    const { fields } = parseFields(words, 1);
    expect(fields.full_name).toMatchObject({ text: 'ANDI PRATAMA', confidence: 0.91, boundingBox: { x: 80, y: 60, width: 155, height: 20 } });
  });

  it('ignores blank words and limits the combined text to 20,000 characters', () => {
    const words = [...ocrWords(['TEMPLATE A1']), { ...ocrWords(['x'])[0]!, text: '   ', line: 2 }, ...ocrWords(['y'.repeat(25_000)]).map(word => ({ ...word, line: 3 }))];
    const { text } = parseFields(words, 1);
    expect(text.length).toBe(20_000);
    expect(text.startsWith('TEMPLATE A1\n')).toBe(true);
  });
});

describe.each([
  ['A1', 'Nama'],
  ['B1', 'Full Name'],
  ['D1', 'Nama lengkap'],
])('%s raw value-word confidence', (template, label) => {
  it('keeps a genuine minimum below 70% and ignores label scores', () => {
    const words = ocrWords([`TEMPLATE ${template}`, `${label}: ANDI PRATAMA`], 100);
    words.find(word => word.text === 'PRATAMA')!.confidence = 63;
    words.find(word => word.text.endsWith(':'))!.confidence = -1;
    expect(parseFields(words, 1).fields.full_name).toMatchObject({ text: 'ANDI PRATAMA', confidence: 0.63, candidates: ['ANDI PRATAMA'] });
  });

  it.each([
    ['negative', -1, -0.01],
    ['negative underflow', -Number.MIN_VALUE, -Number.MIN_VALUE],
    ['above 100', 101, 1.01],
    ['positive infinity', Infinity, Infinity],
    ['negative infinity', -Infinity, -Infinity],
    ['not a number', NaN, NaN],
  ])('propagates a %s score alongside a valid lower score', (_name, score, expected) => {
    const words = ocrWords([`TEMPLATE ${template}`, `${label}: ANDI PRATAMA`], 63);
    words.find(word => word.text === 'PRATAMA')!.confidence = score as number;
    const field = parseFields(words, 1).fields.full_name;
    expect(field?.text).toBe('ANDI PRATAMA');
    expect(field?.confidence).toBe(expected);
  });

  it.each([0, 1])('preserves invalid confidence from duplicate candidate %i', index => {
    const words = ocrWords([`TEMPLATE ${template}`, `${label}: ANDI`, `${label}: BUDI`], 63);
    words.find(word => word.text === (index === 0 ? 'ANDI' : 'BUDI'))!.confidence = 101;
    expect(parseFields(words, 1).fields.full_name).toMatchObject({ text: 'ANDI', candidates: ['ANDI', 'BUDI'], confidence: 1.01 });
  });
});

it('retains invalid scores across D1 wrapped value lines', () => {
  const words = ocrWords(['TEMPLATE D1', 'Nama lengkap: ANDI', 'PRATAMA', 'Nomor ijazah: NOMOR'], 63);
  words.find(word => word.text === 'PRATAMA')!.confidence = Infinity;
  expect(parseFields(words, 1).fields.full_name).toMatchObject({ text: 'ANDI PRATAMA', confidence: Infinity, candidates: ['ANDI PRATAMA'] });
});
