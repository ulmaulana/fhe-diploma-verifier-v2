import { ApiError } from './config';

export function graduationDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new ApiError(400, 'INVALID_DATE', 'Isi tanggal lulus yang valid.');
  return value;
}
