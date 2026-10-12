// Text extraction from PDFs with pdf.js, falling back to OCR for pages that have no text layer.
//
// Privacy: the worker, cMaps, fonts, WASM decoders and ICC profiles are all served from this app's own
// origin under /vendor/pdfjs/ (copied there by scripts/copy-vendor-assets.mjs).
//
// Browser only. pdfjs-dist is imported inside the function, never at module top level, so server
// rendering and unit tests can import this file safely.

import type { TextItem } from "pdfjs-dist/types/src/display/api";
import { buildLines, type PositionedItem } from "./lines";
import { recognizeImage } from "./ocr";
import type { TextLine } from "./types";

// NEXT_PUBLIC_BASE_PATH is set when the app is hosted under a sub-path (GitHub Pages).
const VENDOR_DIR = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/vendor/pdfjs`;
const MIN_TEXT_ITEMS = 5; // fewer non-blank items than this means the page is a scan
const OCR_RENDER_SCALE = 2;

/** Thrown when the PDF needs a password. `extractFile` turns it into an `ExtractionError`. */
export class PdfPasswordError extends Error {
  constructor() {
    super("This PDF is password-protected.");
    this.name = "PdfPasswordError";
  }
}

type Matrix = readonly number[]; // [a, b, c, d, e, f]

function multiply(m1: Matrix, m2: Matrix): number[] {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

/**
 * Converts a pdf.js text item (PDF user space, origin bottom-left, positioned by its baseline) to
 * top-left coordinates using the page viewport transform. Returns null for blank or sideways text.
 */
export function textItemToPositioned(
  item: Pick<TextItem, "str" | "transform" | "width" | "height">,
  viewportTransform: Matrix,
  viewportScale = 1,
): PositionedItem | null {
  if (item.str.trim() === "") return null;
  const m = multiply(viewportTransform, item.transform as number[]);
  if (Math.abs(m[1]) > Math.abs(m[0])) return null; // rotated 90 degrees: not part of a table row
  const height = Math.hypot(m[2], m[3]) || item.height * viewportScale;
  const x0 = m[4];
  return {
    text: item.str,
    x0,
    x1: x0 + item.width * viewportScale,
    y: m[5] - height, // m[5] is the baseline; the font box sits above it
    height,
  };
}

function isPasswordError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "PasswordException"
  );
}

function vendorUrl(path: string): string {
  return new URL(`${VENDOR_DIR}/${path}`, window.location.origin).href;
}

/**
 * pdf.js's getTextContent() does `for await (const value of readableStream)`, but Safari has no
 * async iterator on ReadableStream, so every PDF fails there with "undefined is not a function".
 * The legacy build does not polyfill this one, so add it before pdf.js runs.
 */
function polyfillReadableStreamAsyncIterator(): void {
  const proto = ReadableStream.prototype as ReadableStream & {
    [Symbol.asyncIterator]?: unknown;
  };
  if (typeof proto[Symbol.asyncIterator] === "function") return;
  proto[Symbol.asyncIterator] = async function* (this: ReadableStream) {
    const reader = this.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  };
}

/**
 * Extracts positioned text lines from every page of a PDF, in reading order.
 * Coordinates are PDF points at scale 1 with the origin at the top-left of each page.
 */
export async function extractPdfLines(
  data: ArrayBuffer,
  onProgress?: (fraction: number, stage: string) => void,
): Promise<TextLine[]> {
  // The legacy build bundles fallbacks for very new JavaScript (Math.sumPrecise,
  // Map.prototype.getOrInsertComputed) that the modern build calls unguarded. Without them,
  // Safari and older Chrome fail on PDFs with embedded fonts, which most real statements have.
  polyfillReadableStreamAsyncIterator();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = `${VENDOR_DIR}/pdf.worker.min.mjs`;

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(data),
    cMapUrl: vendorUrl("cmaps/"),
    cMapPacked: true,
    standardFontDataUrl: vendorUrl("standard_fonts/"),
    wasmUrl: vendorUrl("wasm/"),
    iccUrl: vendorUrl("iccs/"),
  });

  try {
    let pdf;
    try {
      pdf = await loadingTask.promise;
    } catch (error) {
      if (isPasswordError(error)) throw new PdfPasswordError();
      throw error;
    }

    const lines: TextLine[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const pageStart = (pageNumber - 1) / pdf.numPages;
      onProgress?.(pageStart, `Reading page ${pageNumber} of ${pdf.numPages}`);
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();

      const items: PositionedItem[] = [];
      for (const item of content.items) {
        if (!("str" in item)) continue; // marked-content marker, not text
        const positioned = textItemToPositioned(
          item,
          viewport.transform,
          viewport.scale,
        );
        if (positioned) items.push(positioned);
      }

      if (items.length >= MIN_TEXT_ITEMS) {
        lines.push(...buildLines(items, pageNumber, "pdf"));
      } else {
        // No usable text layer: this page is an image, so render it and read it with OCR.
        const stage = `Reading page ${pageNumber} of ${pdf.numPages} (scanned, using OCR)`;
        onProgress?.(pageStart, stage);
        const renderViewport = page.getViewport({ scale: OCR_RENDER_SCALE });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(renderViewport.width);
        canvas.height = Math.ceil(renderViewport.height);
        try {
          await page.render({ canvas, viewport: renderViewport }).promise;
          const ocrLines = await recognizeImage(canvas, pageNumber, {
            unitsPerPixel: 1 / OCR_RENDER_SCALE,
            onProgress: (fraction) =>
              onProgress?.(pageStart + fraction / pdf.numPages, stage),
          });
          lines.push(...ocrLines);
        } finally {
          canvas.width = 0;
          canvas.height = 0;
        }
      }
      page.cleanup();
    }
    onProgress?.(1, "Done");
    return lines;
  } finally {
    await loadingTask.destroy();
  }
}
