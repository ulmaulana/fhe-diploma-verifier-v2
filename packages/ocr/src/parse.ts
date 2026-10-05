import type { FieldKey, OcrField } from '@verifikasi/domain';
import type { OcrWord, TemplateId } from './types';
import { nameText } from './name-spacing';

const LABELS: Record<TemplateId, Record<FieldKey, string>> = {
  D1: { full_name: 'Nama lengkap', diploma_number: 'Nomor ijazah', study_program: 'Program studi', graduation_date: 'Tanggal lulus' },
  A1: { full_name: 'Nama', diploma_number: 'Nomor Ijazah', study_program: 'Program Studi', graduation_date: 'Tanggal Lulus' },
  B1: { full_name: 'Full Name', diploma_number: 'Diploma Number', study_program: 'Study Program', graduation_date: 'Graduation Date' },
};
const MAX_TEXT = 20_000;

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface ParsedPage {
  template: TemplateId | null;
  fields: Partial<Record<FieldKey, OcrField & { candidates: string[] }>>;
  text: string;
}

function minimumConfidence(confidences: number[]): number {
  // A valid lower score must never conceal another word/candidate's invalid score.
  const invalid = confidences.find(confidence => !Number.isFinite(confidence) || confidence < 0 || confidence > 1);
  return invalid === undefined ? Math.min(...confidences) : invalid;
}

/** Normalize valid Tesseract percentages; preserve invalid values for the domain gate. */
export function minimumWordConfidence(words: OcrWord[]): number {
  return minimumConfidence(words.map(word => {
    const normalized = word.confidence / 100;
    // Division can underflow a tiny negative percentage to -0, which looks valid.
    return word.confidence < 0 && normalized === 0 ? word.confidence : normalized;
  }));
}

/** Label-anchored field extraction; values are never corrected toward any reference. */
export function parseFields(words: OcrWord[], page: number): ParsedPage {
  const groups = new Map<string, OcrWord[]>();
  for (const word of words) {
    if (!word.text.trim()) continue;
    const key = `${word.block}:${word.paragraph}:${word.line}`;
    groups.set(key, [...(groups.get(key) ?? []), word]);
  }
  const lines = [...groups.values()].map(group => ({ text: group.map(word => word.text).join(' '), words: group }));
  const combined = lines.map(line => line.text).join('\n');
  const markers = [...combined.matchAll(/TEMPLATE\s+(A1|B1|D1)\b/gi)];
  const template = markers.length === 1 ? markers[0]![1]!.toUpperCase() as TemplateId : null;
  if (!template) return { template: null, fields: {}, text: combined.slice(0, MAX_TEXT) };

  const fields: ParsedPage['fields'] = {};
  if (template === 'D1') {
    // Visible labels delimit multiline values; neither PDF metadata nor chain values
    // enter extraction. Duplicate labels remain candidates and fail the domain gate.
    let active: FieldKey | undefined;
    let collected: OcrWord[] = [];
    const flush = () => {
      if (!active || !collected.length) return;
      const text = active === 'full_name' ? nameText(collected) : collected.map(word => word.text).join(' ');
      const x = Math.min(...collected.map(word => word.left));
      const y = Math.min(...collected.map(word => word.top));
      const right = Math.max(...collected.map(word => word.left + word.width));
      const bottom = Math.max(...collected.map(word => word.top + word.height));
      const previous = fields[active];
      const confidence = minimumWordConfidence(collected);
      fields[active] = { text: previous?.text ?? text, candidates: [...(previous?.candidates ?? []), text], confidence: minimumConfidence(previous ? [previous.confidence, confidence] : [confidence]), page, boundingBox: { x, y, width: right - x, height: bottom - y } };
      collected = [];
    };
    for (const line of lines) {
      if (/^(ID Kredensial|TEMPLATE)\b/i.test(line.text)) { flush(); active = undefined; continue; }
      const entry = Object.entries(LABELS.D1).find(([, label]) => new RegExp(`^${escape(label)}\\s*:`,'i').test(line.text));
      if (entry) {
        flush(); active = entry[0] as FieldKey;
        const colon = line.words.findIndex(word => word.text.includes(':'));
        collected = line.words.slice(colon + 1);
      } else if (active) collected.push(...line.words);
    }
    flush();
    return { template, fields, text: combined.slice(0, MAX_TEXT) };
  }
  for (const [key, label] of Object.entries(LABELS[template]) as [FieldKey, string][]) {
    const pattern = new RegExp(`^${escape(label)}\\s*:\\s*(.+?)\\s*$`, 'id');
    const matches: (OcrField & { text: string })[] = [];
    for (const line of lines) {
      const match = pattern.exec(line.text);
      if (!match?.indices?.[1]) continue;
      const valueStart = match.indices[1][0];
      let offset = 0;
      const valueWords: OcrWord[] = [];
      for (const word of line.words) {
        const end = offset + word.text.length;
        if (end > valueStart) valueWords.push(word);
        offset = end + 1;
      }
      if (!valueWords.length) continue;
      const x = Math.min(...valueWords.map(word => word.left));
      const y = Math.min(...valueWords.map(word => word.top));
      const right = Math.max(...valueWords.map(word => word.left + word.width));
      const bottom = Math.max(...valueWords.map(word => word.top + word.height));
      matches.push({
        text: match[1]!,
        confidence: minimumWordConfidence(valueWords),
        page,
        boundingBox: { x, y, width: right - x, height: bottom - y },
      });
    }
    if (matches.length) fields[key] = { ...matches[0]!, confidence: minimumConfidence(matches.map(item => item.confidence)), candidates: matches.map(item => item.text) };
  }
  return { template, fields, text: combined.slice(0, MAX_TEXT) };
}
