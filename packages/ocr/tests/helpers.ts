import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type * as Mupdf from 'mupdf';
import { loadMupdf } from '../src/render';

// Load through the production entry point so MuPDF's stderr stays silenced in tests too.
const mupdf = await loadMupdf();

/** Fictional credential used by every committed synthetic fixture. */
export const DEFAULT_QR = `http://localhost:3000/c/0x${'12'.repeat(32)}`;

export function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))));
}

function save(doc: Mupdf.PDFDocument, options = ''): Uint8Array {
  const bytes = doc.saveToBuffer(options).asUint8Array().slice();
  doc.destroy();
  return bytes;
}

/** Blank or single-content-stream pages; `content` may reference font /F1 (Helvetica). */
export function pdfWithPages(count: number, size: [number, number] = [595, 842], content = ''): Uint8Array {
  const doc = new mupdf.PDFDocument();
  const resources = doc.addObject({ Font: { F1: doc.addSimpleFont(new mupdf.Font('Helvetica')) } });
  for (let index = 0; index < count; index++) doc.insertPage(-1, doc.addPage([0, 0, size[0], size[1]], 0, resources, content));
  return save(doc);
}

export function encrypted(bytes: Uint8Array): Uint8Array {
  return save(new mupdf.PDFDocument(bytes), 'encrypt=aes-256,user-password=secret,owner-password=secret');
}

/** Garbage-collected, recompressed copy: the same visible page, different file bytes. */
export function resaved(bytes: Uint8Array): Uint8Array {
  return save(new mupdf.PDFDocument(bytes), 'garbage=4,compress');
}

export function concatenated(first: Uint8Array, second: Uint8Array): Uint8Array {
  const doc = new mupdf.PDFDocument(first);
  const source = new mupdf.PDFDocument(second);
  for (let index = 0; index < source.countPages(); index++) doc.graftPage(-1, source, index);
  source.destroy();
  return save(doc);
}

/** Render page 1 of a PDF and encode it, like a phone photo or a scanner export. */
export function rasterized(bytes: Uint8Array, dpi: number, format: 'png' | 'jpeg'): Uint8Array {
  const doc = mupdf.Document.openDocument(bytes, 'application/pdf');
  const page = doc.loadPage(0);
  const pixmap = page.toPixmap(mupdf.Matrix.scale(dpi / 72, dpi / 72), mupdf.ColorSpace.DeviceRGB, false);
  const encoded = (format === 'png' ? pixmap.asPNG() : pixmap.asJPEG(90)).slice();
  pixmap.destroy(); page.destroy(); doc.destroy();
  return encoded;
}

export function solidImage(width: number, height: number, format: 'png' | 'jpeg'): Uint8Array {
  const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceGray, [0, 0, width, height], false);
  pixmap.clear(255);
  const encoded = (format === 'png' ? pixmap.asPNG() : pixmap.asJPEG(90)).slice();
  pixmap.destroy();
  return encoded;
}

/** Insert a minimal EXIF APP1 segment carrying only the Orientation tag right after SOI. */
export function withExifOrientation(jpeg: Uint8Array, orientation: number): Uint8Array {
  const tiff = [0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00,
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientation, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00];
  const payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
  const length = payload.length + 2;
  const segment = [0xff, 0xe1, length >> 8, length & 0xff, ...payload];
  return new Uint8Array([...jpeg.subarray(0, 2), ...segment, ...jpeg.subarray(2)]);
}
