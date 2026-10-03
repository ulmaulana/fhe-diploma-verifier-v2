import { describe, expect, it } from 'vitest';
import { loadMupdf, renderPages } from '../src/render';
import { DocumentError, type RenderedPage } from '../src/types';
import { encrypted, fixture, pdfWithPages, solidImage, withExifOrientation } from './helpers';

const mupdf = await loadMupdf();
const render = (bytes: Uint8Array, mime: string): RenderedPage[] => [...renderPages(mupdf, bytes, mime)];
const errorOf = (action: () => unknown) => {
  try { action(); } catch (error) { return error instanceof DocumentError ? error.code : error; }
  return null;
};

describe('renderPages', () => {
  it('renders every PDF page at 200 DPI as packed RGB', () => {
    const [page, ...rest] = render(fixture('synthetic-A1.pdf'), 'application/pdf');
    expect(rest).toHaveLength(0);
    expect(page).toMatchObject({ width: 2339, height: 1653 });
    expect(page!.rgb.length).toBe(2339 * 1653 * 3);
  });

  it('rejects password protection and more than five pages before rendering', () => {
    expect(errorOf(() => render(encrypted(fixture('synthetic-A1.pdf')), 'application/pdf'))).toBe('PDF_PASSWORD');
    expect(errorOf(() => render(pdfWithPages(6), 'application/pdf'))).toBe('TOO_MANY_PAGES');
  });

  it('rejects malformed, empty and unsupported input', () => {
    expect(errorOf(() => render(new TextEncoder().encode('%PDF-broken'), 'application/pdf'))).toBe('INVALID_DOCUMENT');
    expect(errorOf(() => render(new TextEncoder().encode('not an image'), 'image/png'))).toBe('INVALID_DOCUMENT');
    expect(errorOf(() => render(fixture('synthetic-A1.pdf'), 'text/plain'))).toBe('INVALID_DOCUMENT');
    expect(errorOf(() => render(new Uint8Array(10 * 1024 * 1024 + 1), 'application/pdf'))).toBe('INVALID_DOCUMENT');
  });

  it('never reads hidden PDF text: invisible text renders as a white page', () => {
    const [page] = render(pdfWithPages(1, [200, 200], 'BT /F1 12 Tf 3 Tr 20 170 Td (HIDDEN IDENTITY) Tj ET'), 'application/pdf');
    expect(page!.rgb.every(value => value === 255)).toBe(true);
  });

  it('rejects pages and images above 20 megapixels', () => {
    expect(errorOf(() => render(pdfWithPages(1, [10_000, 10_000]), 'application/pdf'))).toBe('RESOLUTION_LIMIT');
    expect(errorOf(() => render(solidImage(4500, 4500, 'png'), 'image/png'))).toBe('RESOLUTION_LIMIT');
  });

  it('keeps native image pixels', () => {
    const [page] = render(fixture('synthetic-A1-scan.png'), 'image/png');
    expect(page).toMatchObject({ width: 1872, height: 1323 });
  });

  it('applies EXIF orientation to photos', () => {
    const [page] = render(withExifOrientation(solidImage(40, 20, 'jpeg'), 6), 'image/jpeg');
    expect(page).toMatchObject({ width: 20, height: 40 });
  });
});
