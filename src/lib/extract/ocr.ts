// OCR for screenshots and scanned PDF pages, using Tesseract.js in a Web Worker.
//
// Privacy: every file Tesseract.js needs is served from this app's own origin under /vendor/tesseract/
// (copied there by scripts/copy-vendor-assets.mjs). Tesseract.js only falls back to its CDN when
// `workerPath`, `corePath` or `langPath` is left unset, so all three are always set here.
//
// Browser only. Tesseract.js is imported inside the functions, never at module top level, so server
// rendering and unit tests can import this file safely.

import type { Worker as TesseractWorker } from "tesseract.js";
import { buildLines, type PositionedItem } from "./lines";
import type { TextLine } from "./types";

const VENDOR_DIR = "/vendor/tesseract";

const TARGET_WIDTH = 2000; // small screenshots are enlarged to about this width
const MAX_UPSCALE = 3;
const MAX_PIXELS = 16_000_000; // keeps canvas memory and OCR time bounded for very long screenshots
const DARK_MEAN_LUMINANCE = 110; // below this the image is light text on a dark background

export interface OcrOptions {
  /** Multiplies pixel coordinates of the given image, e.g. 0.5 for a PDF page rendered at 2x. Default 1. */
  unitsPerPixel?: number;
  /** Called with 0..1 while the image is being recognised. */
  onProgress?: (fraction: number) => void;
}

/** Scale to apply before OCR: enlarge narrow images towards TARGET_WIDTH, shrink enormous ones. */
export function chooseScale(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return 1;
  const upscale =
    width < TARGET_WIDTH ? Math.min(TARGET_WIDTH / width, MAX_UPSCALE) : 1;
  const largestAllowed = Math.sqrt(MAX_PIXELS / (width * height));
  return Math.min(upscale, largestAllowed);
}

/**
 * Converts RGBA pixels to greyscale in place, and inverts them when the image is dark overall
 * (a dark-mode screenshot), because Tesseract reads dark text on a light background best.
 */
export function greyscaleInPlace(data: Uint8ClampedArray): {
  meanLuminance: number;
  inverted: boolean;
} {
  const pixels = Math.floor(data.length / 4);
  if (pixels === 0) return { meanLuminance: 255, inverted: false };
  let sum = 0;
  for (let i = 0; i < pixels * 4; i += 4) {
    const luminance = Math.round(
      0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2],
    );
    data[i] = luminance;
    data[i + 1] = luminance;
    data[i + 2] = luminance;
    data[i + 3] = 255;
    sum += luminance;
  }
  const meanLuminance = sum / pixels;
  const inverted = meanLuminance < DARK_MEAN_LUMINANCE;
  if (inverted) {
    for (let i = 0; i < pixels * 4; i += 4) {
      const value = 255 - data[i];
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
    }
  }
  return { meanLuminance, inverted };
}

function preprocess(image: HTMLCanvasElement | ImageBitmap): {
  canvas: HTMLCanvasElement;
  scale: number;
} {
  const scale = chooseScale(image.width, image.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not create a 2D canvas for OCR.");
  context.fillStyle = "#ffffff"; // transparent pixels become white, not black
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  greyscaleInPlace(pixels.data);
  context.putImageData(pixels, 0, 0);
  return { canvas, scale: canvas.width / image.width };
}

let workerPromise: Promise<TesseractWorker> | null = null;
let activeProgress: ((fraction: number) => void) | undefined;
let queue: Promise<unknown> = Promise.resolve(); // one recognition at a time on the shared worker

async function createOcrWorker(): Promise<TesseractWorker> {
  const { createWorker, OEM, PSM } = await import("tesseract.js");
  const worker = await createWorker("eng", OEM.LSTM_ONLY, {
    workerPath: `${VENDOR_DIR}/worker.min.js`,
    corePath: VENDOR_DIR, // a directory: the worker picks the relaxed-SIMD, SIMD or plain LSTM core
    langPath: VENDOR_DIR, // eng.traineddata.gz
    gzip: true,
    cacheMethod: "none", // always read the local file; nothing is kept in IndexedDB
    workerBlobURL: false, // load the worker straight from our origin rather than through a blob
    legacyCore: false,
    legacyLang: false,
    logger: (message) => {
      if (message.status === "recognizing text")
        activeProgress?.(message.progress);
    },
  });
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_BLOCK, // one block of rows: keeps table rows whole
    preserve_interword_spaces: "1", // keep column gaps instead of collapsing them
    user_defined_dpi: "300",
  });
  return worker;
}

function getWorker(): Promise<TesseractWorker> {
  if (!workerPromise) {
    workerPromise = createOcrWorker().catch((error: unknown) => {
      workerPromise = null; // allow a retry after a failed start
      throw error;
    });
  }
  return workerPromise;
}

/**
 * Recognises the text in an image and returns it as lines of word tokens with confidences (0..1).
 * Coordinates are in the pixels of the image passed in, multiplied by `unitsPerPixel`.
 */
export async function recognizeImage(
  image: HTMLCanvasElement | ImageBitmap,
  page: number,
  options: OcrOptions = {},
): Promise<TextLine[]> {
  const run = async (): Promise<TextLine[]> => {
    const worker = await getWorker();
    const { canvas, scale } = preprocess(image);
    activeProgress = options.onProgress;
    try {
      // Tesseract.js 6+ returns only plain text unless `blocks` is requested.
      const { data } = await worker.recognize(
        canvas,
        {},
        { text: false, blocks: true },
      );
      const factor = (options.unitsPerPixel ?? 1) / scale;
      const items: PositionedItem[] = [];
      for (const block of data.blocks ?? []) {
        for (const paragraph of block.paragraphs) {
          for (const line of paragraph.lines) {
            for (const word of line.words) {
              items.push({
                text: word.text,
                x0: word.bbox.x0 * factor,
                x1: word.bbox.x1 * factor,
                y: word.bbox.y0 * factor,
                height: (word.bbox.y1 - word.bbox.y0) * factor,
                conf: Math.min(1, Math.max(0, word.confidence / 100)),
              });
            }
          }
        }
      }
      return buildLines(items, page, "ocr");
    } finally {
      activeProgress = undefined;
      canvas.width = 0; // release the pixel buffer
      canvas.height = 0;
    }
  };
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}

/** Stops the shared OCR worker and frees its memory. A later call starts a fresh one. */
export async function terminateOcr(): Promise<void> {
  const pending = workerPromise;
  workerPromise = null;
  if (!pending) return;
  try {
    const worker = await pending;
    await worker.terminate();
  } catch {
    // The worker never started, so there is nothing to stop.
  }
}
