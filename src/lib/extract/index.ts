// Public entry point for reading statements in the browser. Nothing here uploads the file anywhere:
// PDFs are parsed by pdf.js and images by Tesseract.js, both loaded from this app's own origin.

import { recognizeImage, terminateOcr as terminateOcrWorker } from "./ocr";
import { extractPdfLines, PdfPasswordError } from "./pdf";
import type { ExtractedFile, TextLine } from "./types";

export type { ExtractedFile, TextLine, TextToken } from "./types";

export type ExtractionErrorCode =
  "password-protected" | "unreadable" | "unsupported-type";

export class ExtractionError extends Error {
  code: ExtractionErrorCode;

  constructor(
    code: ExtractionErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ExtractionError";
    this.code = code;
  }
}

const KIND_BY_MIME: Record<string, "pdf" | "image"> = {
  "application/pdf": "pdf",
  "image/png": "image",
  "image/jpeg": "image",
  "image/webp": "image",
};

const KIND_BY_EXTENSION: Record<string, "pdf" | "image"> = {
  pdf: "pdf",
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
};

function kindOf(file: File): "pdf" | "image" | null {
  const byMime = KIND_BY_MIME[file.type.toLowerCase()];
  if (byMime) return byMime;
  // Some browsers and drag sources give no type, or a generic one: fall back to the extension.
  if (file.type !== "" && file.type !== "application/octet-stream") return null;
  const extension = file.name.includes(".")
    ? file.name.split(".").pop()!.toLowerCase()
    : "";
  return KIND_BY_EXTENSION[extension] ?? null;
}

export function isSupportedFile(file: File): boolean {
  return kindOf(file) !== null;
}

async function extractImageLines(
  file: File,
  onProgress?: (fraction: number, stage: string) => void,
): Promise<TextLine[]> {
  const stage = "Reading image with OCR";
  onProgress?.(0, stage);
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  try {
    const lines = await recognizeImage(bitmap, 1, {
      onProgress: (fraction) => onProgress?.(fraction, stage),
    });
    onProgress?.(1, "Done");
    return lines;
  } finally {
    bitmap.close();
  }
}

/**
 * Reads one PDF or image and returns its text as positioned lines. Runs entirely in the browser.
 * Throws `ExtractionError` with a `code` the import screen can turn into a message.
 */
export async function extractFile(
  file: File,
  onProgress?: (fraction: number, stage: string) => void,
): Promise<ExtractedFile> {
  const kind = kindOf(file);
  if (!kind) {
    throw new ExtractionError(
      "unsupported-type",
      `${file.name} is not a PDF, PNG, JPEG or WebP file.`,
    );
  }

  const report = onProgress
    ? (fraction: number, stage: string) =>
        onProgress(Math.min(1, Math.max(0, fraction)), stage)
    : undefined;

  let lines: TextLine[];
  try {
    lines =
      kind === "pdf"
        ? await extractPdfLines(await file.arrayBuffer(), report)
        : await extractImageLines(file, report);
  } catch (error) {
    if (error instanceof PdfPasswordError) {
      throw new ExtractionError(
        "password-protected",
        `${file.name} is password-protected.`,
        { cause: error },
      );
    }
    throw new ExtractionError("unreadable", `${file.name} could not be read.`, {
      cause: error,
    });
  }

  return {
    id: crypto.randomUUID(),
    name: file.name,
    kind,
    lastModified: file.lastModified,
    lines,
  };
}

/** Stops the shared OCR worker. Call when the import screen is done; the next import restarts it. */
export async function terminateOcr(): Promise<void> {
  await terminateOcrWorker();
}
