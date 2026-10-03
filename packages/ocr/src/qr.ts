import { readFile } from 'node:fs/promises';
import { resolveRuntimeAsset } from './assets';
import { DocumentError, type QrBounds, type RenderedPage } from './types';

type ZXingReader = typeof import('zxing-wasm/reader');

let reader: Promise<ZXingReader> | undefined;
function loadReader(): Promise<ZXingReader> {
  return reader ??= (async () => {
    const zxing = await import('zxing-wasm/reader');
    // The package's default locator fetches the WASM from a CDN; always supply the local binary.
    const binary = await readFile(resolveRuntimeAsset('zxing-wasm/reader/zxing_reader.wasm'));
    const wasmBinary = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    await zxing.prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true });
    return zxing;
  })().catch((error: unknown) => {
    reader = undefined;
    throw error;
  });
}

export interface QrReading {
  /** Decoded payloads; a detected but undecodable symbol is kept as "" so ambiguity is never dropped. */
  values: string[];
  bounds: QrBounds[];
}

export async function readQrCodes(page: RenderedPage): Promise<QrReading> {
  const zxing = await loadReader().catch(() => { throw new DocumentError('OCR_UNAVAILABLE'); });
  const rgba = new Uint8ClampedArray(page.width * page.height * 4);
  for (let source = 0, target = 0; source < page.rgb.length; source += 3, target += 4) {
    rgba[target] = page.rgb[source]!;
    rgba[target + 1] = page.rgb[source + 1]!;
    rgba[target + 2] = page.rgb[source + 2]!;
    rgba[target + 3] = 255;
  }
  const image = { data: rgba, width: page.width, height: page.height } as unknown as ImageData;
  const results = await zxing.readBarcodes(image, { formats: ['QRCode'], tryHarder: true, returnErrors: true, maxNumberOfSymbols: 20 });
  return {
    values: results.map(result => (result.isValid ? result.text : '')),
    bounds: results.map(({ position }) => {
      const xs = [position.topLeft.x, position.topRight.x, position.bottomLeft.x, position.bottomRight.x];
      const ys = [position.topLeft.y, position.topRight.y, position.bottomLeft.y, position.bottomRight.y];
      return { left: Math.floor(Math.min(...xs)), top: Math.floor(Math.min(...ys)), right: Math.ceil(Math.max(...xs)), bottom: Math.ceil(Math.max(...ys)) };
    }),
  };
}
