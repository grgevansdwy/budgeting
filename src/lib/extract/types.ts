// Common shape produced by both PDF text extraction and OCR, so the parser never touches a file.

export interface TextToken {
  text: string;
  x0: number; // left edge
  x1: number; // right edge
  conf?: number; // OCR word confidence 0..1; absent for PDF text
}

export interface TextLine {
  text: string; // tokens joined with single spaces
  tokens: TextToken[]; // sorted left to right
  y: number; // top of the line, increasing down the page
  height: number;
  page: number; // 1-based
  source: "pdf" | "ocr";
}

export interface ExtractedFile {
  id: string;
  name: string;
  kind: "pdf" | "image";
  lastModified: number; // epoch ms, from the File object
  lines: TextLine[]; // in reading order: by page, then top to bottom
}
