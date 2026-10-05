import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { requireRuntimeModule } from './assets';
import { TESSDATA } from './config';
import type { Mupdf } from './render';
import { DocumentError, type OcrEngine, type OcrWord, type QrBounds, type RenderedPage } from './types';

type Tesseract = typeof import('tesseract.js');
type TesseractWorker = Awaited<ReturnType<Tesseract['createWorker']>>;

export const OCR_LANGUAGES = ['ind', 'eng'] as const;
const QR_MASK_PADDING = 10;

let tesseractModule: Promise<Tesseract> | undefined;
function loadTesseract(): Promise<Tesseract> {
  return tesseractModule ??= import('tesseract.js').then(module => ((module as { default?: Tesseract }).default ?? module));
}

let tessdataDirectory: Promise<string> | undefined;
/**
 * tesseract.js reads every language from one `langPath`, but each @tesseract.js-data package
 * has its own directory, and tesseract.js 7.0.0 mis-initializes `{ code, data }` language
 * objects (it joins `data` instead of `code`). Copy the public model files once per instance
 * into a private temp directory; always overwrite through a unique name, never trust leftovers.
 */
function prepareTessdata(): Promise<string> {
  return tessdataDirectory ??= (async () => {
    const directory = join(tmpdir(), `verifikasi-tessdata-${createHash('sha256').update(TESSDATA).digest('hex').slice(0, 16)}`);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    for (const code of OCR_LANGUAGES) {
      const data = requireRuntimeModule<{ gzip: boolean; langPath: string }>(`@tesseract.js-data/${code}`);
      if (!data.gzip) throw new Error('Unexpected uncompressed language data');
      const target = join(directory, `${code}.traineddata.gz`);
      const staging = `${target}.${randomUUID()}`;
      await copyFile(join(data.langPath, `${code}.traineddata.gz`), staging);
      await rename(staging, target);
    }
    return directory;
  })().catch((error: unknown) => {
    tessdataDirectory = undefined;
    throw error;
  });
}

/** OpenCV COLOR_RGB2GRAY fixed-point weights, then blank each QR area plus padding. */
function maskedGrayscalePng(mupdf: Mupdf, page: RenderedPage, mask: QrBounds[]): Uint8Array {
  const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceGray, [0, 0, page.width, page.height], false);
  try {
    const gray = pixmap.getPixels();
    const stride = pixmap.getStride();
    for (let y = 0; y < page.height; y++) {
      for (let x = 0; x < page.width; x++) {
        const source = (y * page.width + x) * 3;
        gray[y * stride + x] = (page.rgb[source]! * 4899 + page.rgb[source + 1]! * 9617 + page.rgb[source + 2]! * 1868 + 8192) >> 14;
      }
    }
    for (const box of mask) {
      const top = Math.max(0, box.top - QR_MASK_PADDING);
      const bottom = Math.min(page.height, box.bottom + QR_MASK_PADDING + 1);
      const left = Math.max(0, box.left - QR_MASK_PADDING);
      const right = Math.min(page.width, box.right + QR_MASK_PADDING + 1);
      for (let y = top; y < bottom; y++) gray.fill(255, y * stride + left, y * stride + right);
    }
    return pixmap.asPNG().slice();
  } finally {
    pixmap.destroy();
  }
}

/** Word rows (level 5) of Tesseract TSV output, the same table pytesseract.image_to_data returns. */
export function parseTsv(tsv: string, blocks?: import('tesseract.js').Block[] | null): OcrWord[] {
  const characterBoxes = new Map<string, NonNullable<OcrWord['symbols']>>();
  const key = (text: string, left: number, top: number, width: number, height: number) => JSON.stringify([text, left, top, width, height]);
  for (const block of blocks ?? []) for (const paragraph of block.paragraphs) for (const line of paragraph.lines) for (const word of line.words) {
    const box = word.bbox;
    characterBoxes.set(key(word.text, box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0), word.symbols.map(symbol => ({
      text: symbol.text, left: symbol.bbox.x0, top: symbol.bbox.y0,
      width: symbol.bbox.x1 - symbol.bbox.x0, height: symbol.bbox.y1 - symbol.bbox.y0,
    })));
  }
  const words: OcrWord[] = [];
  for (const row of tsv.split('\n')) {
    const columns = row.split('\t');
    if (columns.length < 12 || columns[0] !== '5') continue;
    const [, , block, paragraph, line, , left, top, width, height, confidence] = columns.map(Number);
    const text = columns.slice(11).join('\t');
    const symbols = characterBoxes.get(key(text, left!, top!, width!, height!));
    words.push({
      text, confidence: confidence!, block: block!, paragraph: paragraph!, line: line!,
      left: left!, top: top!, width: width!, height: height!,
      ...(symbols ? { symbols } : {}),
    });
  }
  return words;
}

/** One isolated tesseract.js worker per document; terminated on close or timeout. */
export async function createTesseractEngine(mupdf: Mupdf): Promise<OcrEngine> {
  let worker: TesseractWorker | undefined;
  let tesseract: Tesseract;
  try {
    tesseract = await loadTesseract();
    const langPath = await prepareTessdata();
    worker = await tesseract.createWorker(OCR_LANGUAGES.join('+'), tesseract.OEM.LSTM_ONLY, {
      langPath,
      cacheMethod: 'none',
      gzip: true,
      // Progress and worker errors would otherwise reach stdout or crash the process.
      logger: () => {},
      errorHandler: () => {},
    });
    await worker.setParameters({ tessedit_pageseg_mode: tesseract.PSM.SINGLE_BLOCK });
  } catch {
    await worker?.terminate().catch(() => {});
    throw new DocumentError('OCR_UNAVAILABLE');
  }
  let active: TesseractWorker | undefined = worker;
  const close = async () => {
    const current = active;
    active = undefined;
    await current?.terminate().catch(() => {});
  };
  return {
    async read(page, mask, timeoutMs) {
      if (!active) throw new DocumentError('OCR_UNAVAILABLE');
      const image = Buffer.from(maskedGrayscalePng(mupdf, page, mask));
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new DocumentError('OCR_TIMEOUT')), timeoutMs);
      });
      try {
        const result = await Promise.race([active.recognize(image, {}, { tsv: true, text: false, blocks: true }), timeout]);
        return parseTsv(result.data.tsv ?? '', result.data.blocks);
      } catch (error) {
        if (error instanceof DocumentError) await close();
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },
    close,
  };
}
