import { FIELD_KEYS, type DiplomaAttributes, type FieldKey } from "../schema";

export type DateFormat = "DMY" | "MDY" | "YMD";
export interface NormalizationOptions { dateFormat?: DateFormat }

export class DomainValidationError extends Error {
  constructor(public readonly code: string, message: string, public readonly field?: FieldKey) {
    super(message);
    this.name = "DomainValidationError";
  }
}

const MONTHS: Record<string, number> = {
  januari: 1, january: 1, februari: 2, february: 2, maret: 3, march: 3,
  april: 4, mei: 5, may: 5, juni: 6, june: 6, juli: 7, july: 7,
  agustus: 8, august: 8, september: 9, oktober: 10, october: 10,
  november: 11, desember: 12, december: 12,
};

function isValidDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || year < 1 || year > 9999 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= (days[month - 1] ?? 0);
}

function calendarDate(year: number, month: number, day: number): string {
  if (!isValidDate(year, month, day)) {
    throw new DomainValidationError("INVALID_DATE", "Tanggal lulus bukan tanggal kalender yang valid.", "graduation_date");
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Never delegates to Date.parse, whose locale and overflow handling differ. */
export function normalizeDate(raw: string, format?: DateFormat): string {
  const value = raw.normalize("NFC").trim().replace(/\s+/gu, " ");
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) return calendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const named = /^(\d{1,2}) ([\p{L}]+) (\d{4})$/u.exec(value);
  if (named && MONTHS[named[2]!.toLowerCase()]) {
    return calendarDate(Number(named[3]), MONTHS[named[2]!.toLowerCase()]!, Number(named[1]));
  }
  const english = /^([\p{L}]+) (\d{1,2}),? (\d{4})$/u.exec(value);
  if (english && MONTHS[english[1]!.toLowerCase()]) {
    return calendarDate(Number(english[3]), MONTHS[english[1]!.toLowerCase()]!, Number(english[2]));
  }
  const yearFirst = /^(\d{4})([/.-])(\d{1,2})\2(\d{1,2})$/.exec(value);
  if (yearFirst) return calendarDate(Number(yearFirst[1]), Number(yearFirst[3]), Number(yearFirst[4]));
  const numeric = /^(\d{1,2})([/.-])(\d{1,2})\2(\d{4})$/.exec(value);
  if (numeric) {
    const first = Number(numeric[1]);
    const second = Number(numeric[3]);
    const year = Number(numeric[4]);
    if (format === "DMY") return calendarDate(year, second, first);
    if (format === "MDY") return calendarDate(year, first, second);
    if (format === "YMD") throw new DomainValidationError("DATE_FORMAT", "Tanggal tidak mengikuti format template.", "graduation_date");
    const dmy = isValidDate(year, second, first);
    const mdy = isValidDate(year, first, second);
    if (dmy && mdy && first !== second) {
      throw new DomainValidationError("AMBIGUOUS_DATE", "Tanggal ambigu; format tanggal harus ditetapkan oleh template.", "graduation_date");
    }
    if (dmy) return calendarDate(year, second, first);
    if (mdy) return calendarDate(year, first, second);
  }
  throw new DomainValidationError("INVALID_DATE", "Tanggal lulus tidak dapat dibaca secara pasti.", "graduation_date");
}

export function normalizeField(field: FieldKey, raw: string, options: NormalizationOptions = {}): string {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new DomainValidationError("MISSING_FIELD", "Atribut wajib belum terbaca.", field);
  }
  if (raw.length > 1024) throw new DomainValidationError("FIELD_TOO_LONG", "Atribut melebihi batas panjang.", field);
  if (field === "graduation_date") return normalizeDate(raw, options.dateFormat);
  let value = raw.normalize("NFC").trim();
  if (field === "full_name" || field === "study_program") value = value.replace(/\s+/gu, " ");
  return value.toUpperCase().normalize("NFC");
}

export function normalizeAttributes(raw: DiplomaAttributes, options: NormalizationOptions = {}): DiplomaAttributes {
  return Object.fromEntries(FIELD_KEYS.map((field) => [field, normalizeField(field, raw[field], options)])) as DiplomaAttributes;
}

/** Runtime boundary for untrusted operator JSON. Browser OCR is never accepted here by an API. */
export function parseDiplomaAttributes(value: unknown, options: NormalizationOptions = {}): DiplomaAttributes {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DomainValidationError("INVALID_ATTRIBUTES", "Empat atribut ijazah wajib diisi.");
  }
  const raw = value as Record<string, unknown>;
  for (const field of FIELD_KEYS) {
    if (typeof raw[field] !== "string") throw new DomainValidationError("MISSING_FIELD", "Atribut wajib belum diisi.", field);
  }
  return normalizeAttributes(raw as DiplomaAttributes, options);
}
