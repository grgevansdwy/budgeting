// Builds TextLine fixtures from a column layout, so a fixture reads like the statement it mimics.
// Everything produced here is invented: fake merchants, fake amounts, no account numbers.

import type { TextLine, TextToken } from "../../lib/extract/types";

export interface ColumnSpec {
  /** Left edge of the column, or its right edge when align is "right". */
  x: number;
  align?: "left" | "right";
}

export type Layout = Record<string, ColumnSpec>;

/** Cell text, optionally with an OCR confidence for every word in the cell. */
export type Cell = string | { text: string; conf: number };

export interface BuilderOptions {
  source?: "pdf" | "ocr";
  /** Width of one character; a space is one character wide. */
  charWidth?: number;
  /** Glyph height of a line. */
  height?: number;
  /** Distance from the top of one line to the top of the next. */
  pitch?: number;
  /** Default OCR word confidence (OCR fixtures only). */
  conf?: number;
  /** Left margin for free-text lines. */
  margin?: number;
}

export class StatementBuilder<L extends Layout> {
  private readonly lines: TextLine[] = [];
  private page = 1;
  private y: number;
  private readonly source: "pdf" | "ocr";
  private readonly charWidth: number;
  private readonly height: number;
  private readonly pitch: number;
  private readonly conf: number;
  private readonly margin: number;

  constructor(
    private readonly layout: L,
    options: BuilderOptions = {},
  ) {
    this.source = options.source ?? "pdf";
    this.charWidth = options.charWidth ?? 6;
    this.height = options.height ?? 10;
    this.pitch = options.pitch ?? 14;
    this.conf = options.conf ?? 0.95;
    this.margin = options.margin ?? 40;
    this.y = this.pitch * 3;
  }

  /** One line with text placed in named columns. */
  row(
    cells: Partial<Record<keyof L, Cell>>,
    options: { conf?: number } = {},
  ): this {
    const tokens: TextToken[] = [];
    for (const [name, cell] of Object.entries(cells) as [string, Cell][]) {
      const spec = this.layout[name];
      const text = typeof cell === "string" ? cell : cell.text;
      const conf = typeof cell === "string" ? options.conf : cell.conf;
      tokens.push(...this.words(text, spec.x, spec.align ?? "left", conf));
    }
    return this.push(tokens);
  }

  /** One free-text line starting at x (default: the left margin). */
  text(text: string, x = this.margin, options: { conf?: number } = {}): this {
    return this.push(this.words(text, x, "left", options.conf));
  }

  /** Leave vertical space equal to `count` blank lines. */
  space(count = 1): this {
    this.y += this.pitch * count;
    return this;
  }

  newPage(): this {
    this.page++;
    this.y = this.pitch * 3;
    return this;
  }

  build(): TextLine[] {
    return this.lines;
  }

  private words(
    text: string,
    x: number,
    align: "left" | "right",
    conf: number | undefined,
  ): TextToken[] {
    const words = text.split(/\s+/).filter((w) => w !== "");
    const width =
      words.reduce((sum, w) => sum + w.length, 0) * this.charWidth +
      Math.max(0, words.length - 1) * this.charWidth;
    let cursor = align === "right" ? x - width : x;
    return words.map((word) => {
      const token: TextToken = {
        text: word,
        x0: cursor,
        x1: cursor + word.length * this.charWidth,
      };
      if (this.source === "ocr") token.conf = conf ?? this.conf;
      cursor = token.x1 + this.charWidth;
      return token;
    });
  }

  private push(tokens: TextToken[]): this {
    tokens.sort((a, b) => a.x0 - b.x0);
    this.lines.push({
      text: tokens.map((t) => t.text).join(" "),
      tokens,
      y: this.y,
      height: this.height,
      page: this.page,
      source: this.source,
    });
    this.y += this.pitch;
    return this;
  }
}

export function statement<L extends Layout>(
  layout: L,
  options: BuilderOptions = {},
): StatementBuilder<L> {
  return new StatementBuilder(layout, options);
}
