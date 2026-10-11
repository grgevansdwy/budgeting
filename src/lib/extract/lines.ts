// Turns positioned text fragments (pdf.js text items or Tesseract words) into lines of word tokens.
// Pure: no DOM, no pdf.js, no Tesseract.

import type { TextLine, TextToken } from "./types";

export interface PositionedItem {
  text: string;
  x0: number; // left edge
  x1: number; // right edge
  y: number; // top edge, increasing downward
  height: number;
  conf?: number; // 0..1
}

/** Two items share a line when their vertical centres differ by at most this share of a line height. */
const SAME_LINE_FACTOR = 0.5;

/**
 * Two PDF fragments closer than this share of the line height are one word. A real space is about a
 * quarter of the font size, so this joins "$" + "12.34" or "1,234" + ".56" without joining words.
 */
const JOIN_GAP_FACTOR = 0.1;

interface Piece extends TextToken {
  /** The source item had no whitespace before / after this piece, so it may join a touching neighbour. */
  openLeft: boolean;
  openRight: boolean;
}

interface Row {
  items: PositionedItem[];
  centre: number; // running mean of member centres
  height: number; // tallest member
}

function isUsable(item: PositionedItem): boolean {
  return (
    Number.isFinite(item.x0) &&
    Number.isFinite(item.x1) &&
    Number.isFinite(item.y) &&
    Number.isFinite(item.height) &&
    item.height > 0
  );
}

function normalise(item: PositionedItem): PositionedItem {
  return item.x1 < item.x0 ? { ...item, x0: item.x1, x1: item.x0 } : item;
}

function centreOf(item: PositionedItem): number {
  return item.y + item.height / 2;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * The "line height" used to compare an item with a row. Normally the smaller of the two heights, but
 * raised to the page's typical height (when one of them is at least that tall) so that small glyphs
 * such as "-" or "." (OCR boxes hug the ink) still join their row. Capping at the typical height
 * stops a tall heading, or a tall OCR artefact, from swallowing the ordinary lines next to it.
 */
function lineHeightFor(
  rowHeight: number,
  itemHeight: number,
  typicalHeight: number,
): number {
  const smaller = Math.min(rowHeight, itemHeight);
  const larger = Math.max(rowHeight, itemHeight);
  return Math.max(smaller, Math.min(typicalHeight, larger));
}

function groupIntoRows(items: PositionedItem[]): Row[] {
  const typicalHeight = median(items.map((item) => item.height));
  const sorted = [...items].sort((a, b) => centreOf(a) - centreOf(b));
  const rows: Row[] = [];
  for (const item of sorted) {
    const centre = centreOf(item);
    const row = rows[rows.length - 1];
    if (
      row &&
      Math.abs(centre - row.centre) <=
        SAME_LINE_FACTOR * lineHeightFor(row.height, item.height, typicalHeight)
    ) {
      row.centre =
        (row.centre * row.items.length + centre) / (row.items.length + 1);
      row.height = Math.max(row.height, item.height);
      row.items.push(item);
    } else {
      rows.push({ items: [item], centre, height: item.height });
    }
  }
  return rows;
}

/** Splits one item into word pieces, sharing its width out by character count. */
function splitItem(item: PositionedItem): Piece[] {
  const { text } = item;
  if (text.length === 0) return [];
  const charWidth = (item.x1 - item.x0) / text.length;
  const pieces: Piece[] = [];
  for (const match of text.matchAll(/\S+/g)) {
    const start = match.index;
    const end = start + match[0].length;
    const piece: Piece = {
      text: match[0],
      x0: item.x0 + start * charWidth,
      x1: item.x0 + end * charWidth,
      openLeft: start === 0,
      openRight: end === text.length,
    };
    if (item.conf !== undefined) piece.conf = item.conf;
    pieces.push(piece);
  }
  // A whitespace-only item becomes an empty marker so it still separates its neighbours.
  if (pieces.length === 0) {
    return [
      { text: "", x0: item.x0, x1: item.x1, openLeft: false, openRight: false },
    ];
  }
  return pieces;
}

function mergeConf(
  a: number | undefined,
  b: number | undefined,
): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.min(a, b);
}

function rowToLine(
  row: Row,
  page: number,
  source: "pdf" | "ocr",
): TextLine | null {
  const top = Math.min(...row.items.map((item) => item.y));
  const bottom = Math.max(...row.items.map((item) => item.y + item.height));
  const joinGap = JOIN_GAP_FACTOR * row.height;

  const pieces = [...row.items]
    .sort((a, b) => a.x0 - b.x0 || a.x1 - b.x1)
    .flatMap(splitItem);

  const merged: Piece[] = [];
  let spaceSeen = false; // a whitespace-only item sat between the previous piece and this one
  for (const piece of pieces) {
    if (piece.text === "") {
      spaceSeen = true;
      continue;
    }
    const previous = merged[merged.length - 1];
    const separated = spaceSeen;
    spaceSeen = false;
    // OCR words are already whole words, so only PDF fragments are ever joined.
    const touching =
      source === "pdf" &&
      !separated &&
      previous !== undefined &&
      previous.openRight &&
      piece.openLeft &&
      piece.x0 - previous.x1 <= joinGap &&
      piece.x0 >= previous.x0;
    if (touching) {
      previous.text += piece.text;
      previous.x1 = Math.max(previous.x1, piece.x1);
      previous.openRight = piece.openRight;
      const conf = mergeConf(previous.conf, piece.conf);
      if (conf !== undefined) previous.conf = conf;
    } else {
      merged.push({ ...piece });
    }
  }
  if (merged.length === 0) return null;

  const tokens: TextToken[] = merged.map((piece) => {
    const token: TextToken = { text: piece.text, x0: piece.x0, x1: piece.x1 };
    if (piece.conf !== undefined) token.conf = piece.conf;
    return token;
  });

  return {
    text: tokens.map((token) => token.text).join(" "),
    tokens,
    y: top,
    height: bottom - top,
    page,
    source,
  };
}

/**
 * Groups items into lines (top to bottom), each holding word tokens (left to right).
 * Items are on one line when their vertical centres are within half a line height.
 */
export function buildLines(
  items: PositionedItem[],
  page: number,
  source: "pdf" | "ocr",
): TextLine[] {
  const usable = items.filter(isUsable).map(normalise);
  const lines: TextLine[] = [];
  for (const row of groupIntoRows(usable)) {
    const line = rowToLine(row, page, source);
    if (line) lines.push(line);
  }
  return lines.sort(
    (a, b) => a.y - b.y || (a.tokens[0]?.x0 ?? 0) - (b.tokens[0]?.x0 ?? 0),
  );
}
