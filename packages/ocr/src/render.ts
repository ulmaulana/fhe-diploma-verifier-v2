import type * as MupdfModule from 'mupdf';
import { DocumentError, type RenderedPage } from './types';

export type Mupdf = typeof MupdfModule;
export const RENDER_DPI = 200;
export const MAX_PIXELS = 20_000_000;
export const MAX_PAGES = 5;
export const MAX_BYTES = 10 * 1024 * 1024;

let mupdfModule: Promise<Mupdf> | undefined;
/** MuPDF.js is ESM with top-level await and loads its own WASM; import it only when needed. */
export function loadMupdf(): Promise<Mupdf> {
  // MuPDF reports parser warnings on stderr; documents are private, so keep them out of logs.
  globalThis.$libmupdf_wasm_Module ??= { print() {}, printErr() {} };
  return mupdfModule ??= import('mupdf');
}

/** Copy samples out of WASM memory so the pixmap can be freed immediately. */
function packRgb(pixmap: MupdfModule.Pixmap): RenderedPage {
  const width = pixmap.getWidth();
  const height = pixmap.getHeight();
  const stride = pixmap.getStride();
  const pixels = pixmap.getPixels();
  if (pixmap.getNumberOfComponents() !== 3) throw new DocumentError('INVALID_DOCUMENT');
  const rowBytes = width * 3;
  const rgb = new Uint8Array(rowBytes * height);
  if (stride === rowBytes) rgb.set(pixels.subarray(0, rgb.length));
  else for (let row = 0; row < height; row++) rgb.set(pixels.subarray(row * stride, row * stride + rowBytes), row * rowBytes);
  return { width, height, rgb };
}

function* renderPdf(mupdf: Mupdf, bytes: Uint8Array): Generator<RenderedPage> {
  const doc = mupdf.Document.openDocument(bytes, 'application/pdf');
  try {
    if (!doc.isPDF()) throw new DocumentError('INVALID_DOCUMENT');
    if (doc.needsPassword()) throw new DocumentError('PDF_PASSWORD');
    const count = doc.countPages();
    if (count > MAX_PAGES) throw new DocumentError('TOO_MANY_PAGES');
    if (!count) throw new DocumentError('INVALID_DOCUMENT');
    const scale = RENDER_DPI / 72;
    for (let index = 0; index < count; index++) {
      const page = doc.loadPage(index);
      let rendered: RenderedPage;
      try {
        const [x0, y0, x1, y1] = page.getBounds();
        if ((x1 - x0) * (y1 - y0) * scale * scale > MAX_PIXELS) throw new DocumentError('RESOLUTION_LIMIT');
        // Pixels of the visible page only; the PDF text layer is never consulted.
        const pixmap = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false);
        try { rendered = packRgb(pixmap); } finally { pixmap.destroy(); }
      } finally {
        page.destroy();
      }
      yield rendered;
    }
  } finally {
    doc.destroy();
  }
}

function* renderImage(mupdf: Mupdf, bytes: Uint8Array, mime: string): Generator<RenderedPage> {
  const image = new mupdf.Image(bytes);
  const width = image.getWidth();
  const height = image.getHeight();
  image.destroy();
  if (width * height > MAX_PIXELS) throw new DocumentError('RESOLUTION_LIMIT');
  // The image document applies EXIF orientation when drawing its single page.
  const doc = mupdf.Document.openDocument(bytes, mime);
  try {
    if (doc.countPages() !== 1) throw new DocumentError('INVALID_DOCUMENT');
    const page = doc.loadPage(0);
    try {
      const [x0, y0, x1, y1] = page.getBounds();
      const pageWidth = x1 - x0;
      const pageHeight = y1 - y0;
      const turned = width !== height && (pageWidth > pageHeight) !== (width > height);
      const [outWidth, outHeight] = turned ? [height, width] : [width, height];
      const pixmap = page.toPixmap(mupdf.Matrix.scale(outWidth / pageWidth, outHeight / pageHeight), mupdf.ColorSpace.DeviceRGB, false);
      try { yield packRgb(pixmap); } finally { pixmap.destroy(); }
    } finally {
      page.destroy();
    }
  } finally {
    doc.destroy();
  }
}

/** Render each visible page lazily; any parser failure becomes INVALID_DOCUMENT. */
export function* renderPages(mupdf: Mupdf, bytes: Uint8Array, mime: string): Generator<RenderedPage> {
  if (bytes.byteLength > MAX_BYTES) throw new DocumentError('INVALID_DOCUMENT');
  const pages = mime === 'application/pdf' ? renderPdf(mupdf, bytes)
    : mime === 'image/png' || mime === 'image/jpeg' ? renderImage(mupdf, bytes, mime)
      : null;
  if (!pages) throw new DocumentError('INVALID_DOCUMENT');
  try {
    yield* pages;
  } catch (error) {
    throw error instanceof DocumentError ? error : new DocumentError('INVALID_DOCUMENT');
  }
}
