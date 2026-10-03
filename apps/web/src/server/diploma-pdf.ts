import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PDFDocument, rgb, type PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import QRCode from 'qrcode';
import type { CredentialPublicProfile } from '@verifikasi/credentials';
import { ApiError } from './config';
import { graduationDate } from './document-date';
export { graduationDate } from './document-date';

export const DIPLOMA_TEMPLATE_VERSION = 'issued-diploma-v1';
const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

/** Wrap on word boundaries, preserving every character. Never ellipsize a legal attribute. */
export function wrapText(value: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = []; let line = '';
  for (const word of value.split(/\s+/u)) {
    if (font.widthOfTextAtSize(word, size) > width) throw new ApiError(422, 'PDF_LAYOUT', 'Satu kata terlalu panjang untuk template ijazah. Hubungi pengelola template.');
    const next = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(next, size) > width) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export async function generateDiploma(input: { credentialId: string; profile: CredentialPublicProfile; graduationDate: string; origin: string; createdAt: string }): Promise<Buffer> {
  const date = graduationDate(input.graduationDate);
  const doc = await PDFDocument.create(); doc.registerFontkit(fontkit);
  // Both development and deployed functions run with apps/web as their working directory.
  const fontPath = resolve(process.cwd(), process.cwd().replaceAll('\\', '/').endsWith('/apps/web') ? 'src/server/assets/NotoSans-Regular.ttf' : 'apps/web/src/server/assets/NotoSans-Regular.ttf');
  const font = await doc.embedFont(await readFile(fontPath), { subset: true });
  const { profile } = input;
  const values = [profile.issuerDisplayName, profile.fullName, profile.diplomaNumber, profile.studyProgram];
  const supported = new Set(font.getCharacterSet());
  if (values.some(value => [...value].some(char => !supported.has(char.codePointAt(0)!)))) throw new ApiError(422, 'PDF_FONT', 'Teks mengandung karakter yang belum didukung font ijazah. Hubungi pengelola template.');
  doc.setTitle('Ijazah'); doc.setProducer('Verifikasi Ijazah');
  doc.setCreationDate(new Date(input.createdAt)); doc.setModificationDate(new Date(input.createdAt));
  const page = doc.addPage([841.89, 595.28]);
  const ink = rgb(0.08, 0.13, 0.19); const accent = rgb(0.04, 0.38, 0.47);
  page.drawRectangle({ x: 24, y: 24, width: 793.89, height: 547.28, borderColor: accent, borderWidth: 1.5 });
  const draw = (text: string, x: number, y: number, size: number, color = ink) => page.drawText(text, { x, y, size, font, color });
  const institution = wrapText(profile.issuerDisplayName, font, 17, 730);
  if (institution.length > 3) throw new ApiError(422, 'PDF_LAYOUT', 'Nama institusi melebihi kapasitas template.');
  institution.forEach((line, i) => draw(line, (841.89 - font.widthOfTextAtSize(line, 17)) / 2, 536 - i * 22, 17));
  draw('IJAZAH', 350, 444, 32, accent);
  draw('Diberikan kepada lulusan dengan data berikut:', 62, 409, 13);
  const fields = [
    ['Nama lengkap', profile.fullName], ['Nomor ijazah', profile.diplomaNumber],
    ['Program studi', profile.studyProgram], ['Tanggal lulus', `${Number(date.slice(8))} ${months[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`],
  ];
  // Labels get their own lines; continuation lines remain inside the same field region.
  const size = 17; const lineHeight = 21;
  const wrapped = fields.map(([label, value]) => ({ label: label!, lines: wrapText(value!, font, size, 515) }));
  const needed = wrapped.reduce((sum, field) => sum + 20 + field.lines.length * lineHeight + 8, 0);
  if (needed > 306) throw new ApiError(422, 'PDF_LAYOUT', 'Data terlalu panjang untuk satu halaman ijazah. Hubungi pengelola template; teks tidak dipotong.');
  let y = 374;
  for (const field of wrapped) {
    draw(`${field.label}:`, 62, y, 12); y -= 20;
    for (const line of field.lines) { draw(line, 62, y, size); y -= lineHeight; }
    y -= 8;
  }
  const qr = await doc.embedPng(await QRCode.toBuffer(`${input.origin}/c/${input.credentialId}`, { width: 600, margin: 4, errorCorrectionLevel: 'M' }));
  page.drawImage(qr, { x: 624, y: 203, width: 160, height: 160 });
  // Footer lies below the field region and is a strict OCR terminator.
  draw('ID Kredensial:', 62, 60, 9);
  draw(input.credentialId, 62, 45, 8);
  draw('TEMPLATE D1', 700, 45, 9);
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}
