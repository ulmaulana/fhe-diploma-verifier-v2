import { describe, expect, it } from 'vitest';
import type { Block, Page, Word } from 'tesseract.js';
import { parseTsv } from '../src/engine';

function word(text: string, left: number, top = 636): Word {
  const bbox = { x0: left, y0: top, x1: left + text.length * 16 - 4, y1: top + 34 };
  return {
    text, bbox, confidence: 76, font_name: '', choices: [],
    symbols: [...text].map((character, index) => ({
      text: character, confidence: 76,
      bbox: { x0: left + index * 16, y0: top, x1: left + index * 16 + 12, y1: top + 34 },
      is_superscript: false, is_subscript: false, is_dropcap: false,
    })),
  };
}

function blocks(words: Word[]): Block[] {
  const bbox = { x0: 0, y0: 0, x1: 2339, y1: 1654 };
  const page: Page = {
    blocks: [], confidence: 76, oem: '1', osd: '', psm: '6', text: '', version: '',
    hocr: null, tsv: null, box: null, unlv: null, sd: null,
    imageColor: null, imageGrey: null, imageBinary: null,
    rotateRadians: null, pdf: null, debug: null,
  };
  const result: Block[] = [{
    bbox, page, text: '', confidence: 76, blocktype: 'FLOWING_TEXT',
    paragraphs: [{
      bbox, text: '', confidence: 76, is_ltr: true,
      lines: [{
        bbox, words, text: '', confidence: 76, baseline: bbox,
        rowAttributes: { ascenders: 0, descenders: 0, rowHeight: 34 },
      }],
    }],
  }];
  page.blocks = result;
  return result;
}

function tsv(...words: Word[]): string {
  const header = 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext';
  return [header, ...words.map((value, index) => [
    5, 1, 2, 3, 4, index + 1,
    value.bbox.x0, value.bbox.y0, value.bbox.x1 - value.bbox.x0, value.bbox.y1 - value.bbox.y0,
    76.290543, value.text,
  ].join('\t'))].join('\n');
}

describe('TSV and character-box metadata boundary', () => {
  it.each([undefined, null, []])('keeps the original TSV fields when blocks are %s', metadata => {
    const input = word('MAULANAY', 177);
    expect(parseTsv(tsv(input), metadata)).toEqual([{
      text: 'MAULANAY', confidence: 76.290543, block: 2, paragraph: 3, line: 4,
      left: 177, top: 636, width: 124, height: 34,
    }]);
  });

  it('attaches matching character boxes without replacing fractional TSV confidence', () => {
    const input = word('MAULANAY', 177);
    const [parsed] = parseTsv(tsv(input), blocks([input]));
    expect(parsed?.confidence).toBe(76.290543);
    expect(parsed?.symbols).toEqual([...input.text].map((text, index) => ({
      text, left: 177 + index * 16, top: 636, width: 12, height: 34,
    })));
  });

  it('ignores metadata with the same text but a different word box', () => {
    const input = word('MAULANAY', 177);
    const shifted = word(input.text, 178);
    expect(parseTsv(tsv(input), blocks([shifted]))).toEqual(parseTsv(tsv(input)));
  });

  it('ignores metadata with the same word box but different text', () => {
    const input = word('MAULANAY', 177);
    const different = word('MAULANAX', 177);
    expect(parseTsv(tsv(input), blocks([different]))).toEqual(parseTsv(tsv(input)));
  });

  it('associates duplicate word text with its own coordinates even when metadata order differs', () => {
    const first = word('S', 454, 636);
    const second = word('S', 218, 1044);
    const [parsedFirst, parsedSecond] = parseTsv(tsv(first, second), blocks([second, first]));
    expect(parsedFirst?.symbols).toEqual([{ text: 'S', left: 454, top: 636, width: 12, height: 34 }]);
    expect(parsedSecond?.symbols).toEqual([{ text: 'S', left: 218, top: 1044, width: 12, height: 34 }]);
    expect(parsedFirst?.confidence).toBe(76.290543);
    expect(parsedSecond?.confidence).toBe(76.290543);
  });
});
