import { describe, expect, it } from 'vitest';
import { readQrCodes } from '../src/qr';
import { loadMupdf, renderPages } from '../src/render';
import { DEFAULT_QR, fixture, pdfWithPages, rasterized, resaved } from './helpers';

const mupdf = await loadMupdf();
const firstPage = (bytes: Uint8Array, mime: string) => renderPages(mupdf, bytes, mime).next().value!;

describe('readQrCodes', () => {
  it.each(['synthetic-A1.pdf', 'synthetic-B1.pdf'])('reads the credential QR from %s and locates it', async name => {
    const page = firstPage(fixture(name), 'application/pdf');
    const { values, bounds } = await readQrCodes(page);
    expect(values).toEqual([DEFAULT_QR]);
    // The fixture places the QR at PDF points (610, 215)-(770, 375); at 200 DPI that is ~(1694, 597)-(2139, 1042).
    expect(bounds).toHaveLength(1);
    expect(bounds[0]!.left).toBeGreaterThan(1650);
    expect(bounds[0]!.right).toBeLessThan(2180);
  });

  it('survives PDF resave and PNG rasterization', async () => {
    expect((await readQrCodes(firstPage(resaved(fixture('synthetic-A1.pdf')), 'application/pdf'))).values).toEqual([DEFAULT_QR]);
    expect((await readQrCodes(firstPage(rasterized(fixture('synthetic-A1.pdf'), 200, 'png'), 'image/png'))).values).toEqual([DEFAULT_QR]);
  });

  it('returns nothing for a page without a QR code', async () => {
    expect(await readQrCodes(firstPage(pdfWithPages(1), 'application/pdf'))).toEqual({ values: [], bounds: [] });
  });
});
