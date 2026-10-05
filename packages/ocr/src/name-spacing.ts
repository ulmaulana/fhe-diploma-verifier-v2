import { OCR_CONFIG } from './config';
import type { OcrSymbol, OcrWord } from './types';

const policy = OCR_CONFIG.name_spacing;
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

function validSymbols(word: OcrWord): word is OcrWord & { symbols: OcrSymbol[] } {
  const symbols = word.symbols;
  if (!/^[A-Z]+$/.test(word.text) || !symbols?.length || symbols.map(symbol => symbol.text).join('') !== word.text) return false;
  if (![word.left, word.top, word.width, word.height].every(Number.isFinite) || word.width <= 0 || word.height <= 0) return false;
  return symbols.every((symbol, index) => {
    const previous = symbols[index - 1];
    return /^[A-Z]$/.test(symbol.text) && [symbol.left, symbol.top, symbol.width, symbol.height].every(Number.isFinite)
      && symbol.width > 0 && symbol.height > 0
      && symbol.left >= word.left && symbol.top >= word.top
      && symbol.left + symbol.width <= word.left + word.width && symbol.top + symbol.height <= word.top + word.height
      && (!previous || symbol.left >= previous.left + previous.width);
  });
}

function lineText(words: OcrWord[]): string {
  const original = words.map(word => word.text).join(' ');
  // A conservative visual correction for the capitalized names on D1. Punctuation,
  // mixed fonts, missing boxes and overlapping glyphs keep the original OCR text.
  if (!words.every(validSymbols)) return original;
  const symbols = words.flatMap(word => word.symbols);
  if (symbols.length < policy.minimum_symbols) return original;
  const height = median(symbols.map(symbol => symbol.height));
  const baseline = median(symbols.map(symbol => symbol.top + symbol.height));
  if (symbols.some(symbol => Math.abs(symbol.height - height) > height * policy.height_tolerance
    || Math.abs(symbol.top + symbol.height - baseline) > height * policy.baseline_tolerance)) return original;

  const internalGaps = words.flatMap(word => word.symbols.slice(1).map((symbol, index) => symbol.left - (word.symbols[index]!.left + word.symbols[index]!.width)));
  const positiveGaps = internalGaps.filter(gap => gap > 0).sort((a, b) => a - b);
  if (positiveGaps.length < policy.minimum_positive_gaps) return original;
  const typicalGap = median(positiveGaps.slice(0, Math.ceil(positiveGaps.length / 2)));
  const letterGapMinimum = typicalGap * policy.typical_gap_ratio;
  const heightGapMinimum = height * policy.minimum_gap_height_ratio;

  const acceptedSpaces = words.slice(1).map((word, index) => {
    const previous = words[index]!.symbols.at(-1)!;
    return word.symbols[0]!.left - (previous.left + previous.width);
  });
  // Recognized word boundaries must themselves look like spaces. Wrapped lines are
  // processed separately, so line breaks can never calibrate a missing word space.
  if (acceptedSpaces.some(gap => gap < Math.max(letterGapMinimum, heightGapMinimum))) return original;
  // If OCR merged the whole line, one distinctly wide gap provides a visual anchor.
  // Its smaller neighboring spaces may then be recovered using the same scale.
  const strongSpaces = internalGaps.filter(gap => gap >= Math.max(letterGapMinimum, height * policy.strong_gap_height_ratio));
  const anchors = acceptedSpaces.length ? acceptedSpaces : strongSpaces;
  if (!anchors.length) return original;
  const threshold = Math.max(letterGapMinimum, heightGapMinimum, Math.min(...anchors) * policy.calibrated_gap_ratio);
  return words.map(word => word.symbols.map((symbol, index) => {
    const previous = word.symbols[index - 1];
    const gap = previous ? symbol.left - (previous.left + previous.width) : 0;
    return `${previous && gap >= threshold ? ' ' : ''}${symbol.text}`;
  }).join('')).join(' ');
}

/** Recover visible word spacing; no PDF text or expected credential attributes enter here. */
export function nameText(words: OcrWord[]): string {
  const lines: OcrWord[][] = [];
  for (const word of words) {
    const previous = lines.at(-1)?.at(-1);
    if (previous && previous.block === word.block && previous.paragraph === word.paragraph && previous.line === word.line) lines.at(-1)!.push(word);
    else lines.push([word]);
  }
  return lines.map(lineText).join(' ');
}
