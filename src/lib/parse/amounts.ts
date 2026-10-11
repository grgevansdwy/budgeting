// Amount tokens: recognised from the right end of a line and turned into signed cents by string
// manipulation only. The digits themselves always go through parseAmountToCents in money.ts.

import type { TextToken } from "../extract/types";
import { parseAmountToCents } from "../money";

export type AmountMarker = "CR" | "DR";

export interface AmountParseOptions {
  /** OCR text: correct confusable characters inside the number. */
  ocr?: boolean;
  /** The file writes amounts as 1.234,56 instead of 1,234.56. */
  commaDecimal?: boolean;
}

export interface ParsedAmount {
  /** Signed cents exactly as printed: negative for -, trailing -, parentheses. */
  cents: number;
  marker: AmountMarker | null;
  /** True when OCR confusable characters had to be corrected to read the amount. */
  corrected: boolean;
}

export interface AmountHit extends ParsedAmount {
  /** Index of the first and last token the amount occupies (inclusive). */
  start: number;
  end: number;
  x0: number;
  x1: number;
  /** Lowest OCR confidence among the amount's tokens; null for PDF text. */
  conf: number | null;
}

export interface FindAmountOptions extends AmountParseOptions {
  /** Tokens before this index (the date) are never read as amounts. */
  from?: number;
  /** Line height, used to decide whether a detached "$", "-" or "CR" belongs to a number. */
  height: number;
}

const DASHES_RE = /[−‒–—]/g;
const CURRENCY_CHARS = "$£€";
const MARKER_RE = /(CR|DR)$/i;
const MAX_TOKEN_LENGTH = 24;

// Exactly two decimals. The whole part may be empty (".50").
const DOT_DECIMAL_RE = /^(\d{1,3}(?:,\d{3})+|\d*)\.(\d{2})$/;
const COMMA_DECIMAL_RE = /^(\d{1,3}(?:\.\d{3})+|\d*),(\d{2})$/;
// A number made only of digits and characters OCR confuses with digits.
const OCR_NUMBER_SHAPE_RE = /^[\dOolI|SB.,]*[.,][\dOolI|SB]{2}$/;

const DETACHED_PREFIX_RE = /^[-+]?[$£€]?-?$/;
const DETACHED_MARKER_RE = /^(CR|DR)$/i;
const EMPTY_CELL_RE = /^-+$/;

// Gaps, as a fraction of the line height, within which a detached piece joins a number.
const SIGN_GAP_FACTOR = 0.6;
const CURRENCY_GAP_FACTOR = 1;
const MARKER_GAP_FACTOR = 2.5;

/** Replace the characters OCR commonly confuses with digits. Use on date and amount tokens only. */
export function fixConfusables(text: string): string {
  return text
    .replace(/[Oo]/g, "0")
    .replace(/[lI|]/g, "1")
    .replace(/S/g, "5")
    .replace(/B/g, "8");
}

export function normaliseDashes(text: string): string {
  return text.replace(DASHES_RE, "-");
}

function coreToCents(core: string, commaDecimal: boolean): number | null {
  const m = (commaDecimal ? COMMA_DECIMAL_RE : DOT_DECIMAL_RE).exec(core);
  if (!m) return null;
  const whole = m[1].replace(/[.,]/g, "");
  // "007.50" is a reference number, not money.
  if (whole.length > 1 && whole.startsWith("0")) return null;
  return parseAmountToCents(`${whole === "" ? "0" : whole}.${m[2]}`);
}

/**
 * Parse one amount token ("$1,234.56", "-12.34", "12.34-", "(12.34)", "12.34CR").
 * Returns null for anything without exactly two decimals.
 */
export function parseAmountToken(
  raw: string,
  options: AmountParseOptions = {},
): ParsedAmount | null {
  if (typeof raw !== "string") return null;
  let s = normaliseDashes(raw).replace(/\s+/g, "");
  if (s === "" || s.length > MAX_TOKEN_LENGTH) return null;
  const ocr = options.ocr === true;
  const commaDecimal = options.commaDecimal === true;

  let marker: AmountMarker | null = null;
  const markerMatch = MARKER_RE.exec(s);
  if (markerMatch) {
    marker = markerMatch[1].toUpperCase() as AmountMarker;
    s = s.slice(0, -2);
  }

  let negative = false;
  let corrected = false;
  if (s.startsWith("(") && s.endsWith(")") && s.length > 2) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith("-")) {
    negative = true;
    s = s.slice(0, -1);
  }

  // Leading sign and currency symbol in either order: "-$1", "$-1", "+1".
  let sawSign = false;
  let sawCurrency = false;
  while (s.length > 1) {
    const ch = s[0];
    if ((ch === "-" || ch === "+") && !sawSign) {
      sawSign = true;
      if (ch === "-") negative = true;
    } else if (CURRENCY_CHARS.includes(ch) && !sawCurrency) {
      sawCurrency = true;
    } else if (
      ocr &&
      ch === "S" &&
      !sawCurrency &&
      OCR_NUMBER_SHAPE_RE.test(s.slice(1))
    ) {
      // OCR reads "$" as "S" far more often than a leading 5 is misread.
      sawCurrency = true;
      corrected = true;
    } else {
      break;
    }
    s = s.slice(1);
  }

  let cents = coreToCents(s, commaDecimal);
  if (cents === null && ocr && OCR_NUMBER_SHAPE_RE.test(s)) {
    const fixed = fixConfusables(s);
    if (fixed !== s) {
      cents = coreToCents(fixed, commaDecimal);
      if (cents !== null) corrected = true;
    }
  }
  if (cents === null) return null;
  return {
    cents: negative && cents !== 0 ? -cents : cents,
    marker,
    corrected,
  };
}

function gapWithin(
  tokens: TextToken[],
  left: number,
  right: number,
  max: number,
): boolean {
  const gap = tokens[right].x0 - tokens[left].x1;
  return !Number.isFinite(gap) || gap <= max;
}

function hitEndingAt(
  tokens: TextToken[],
  i: number,
  options: FindAmountOptions,
): AmountHit | null {
  const height = options.height > 0 ? options.height : 10;
  const last = normaliseDashes(tokens[i].text);
  let numberIndex = i;
  let suffix = "";
  if (i > 0) {
    if (
      DETACHED_MARKER_RE.test(last) &&
      gapWithin(tokens, i - 1, i, height * MARKER_GAP_FACTOR)
    ) {
      suffix = last;
      numberIndex = i - 1;
    } else if (
      last === "-" &&
      gapWithin(tokens, i - 1, i, height * SIGN_GAP_FACTOR)
    ) {
      suffix = "-";
      numberIndex = i - 1;
    }
  }
  // "12.34 %" is a rate, not money.
  if (i + 1 < tokens.length && tokens[i + 1].text.startsWith("%")) return null;

  const body = tokens[numberIndex].text + suffix;
  let start = numberIndex;
  let parsed: ParsedAmount | null = null;
  if (numberIndex > 0) {
    const before = normaliseDashes(tokens[numberIndex - 1].text);
    const hasSign = /[-+]/.test(before);
    const maxGap = height * (hasSign ? SIGN_GAP_FACTOR : CURRENCY_GAP_FACTOR);
    if (
      before !== "" &&
      DETACHED_PREFIX_RE.test(before) &&
      gapWithin(tokens, numberIndex - 1, numberIndex, maxGap)
    ) {
      parsed = parseAmountToken(before + body, options);
      if (parsed) start = numberIndex - 1;
    }
  }
  if (!parsed) parsed = parseAmountToken(body, options);
  if (!parsed) return null;

  let conf: number | null = null;
  for (let k = start; k <= i; k++) {
    const c = tokens[k].conf;
    if (typeof c === "number") conf = conf === null ? c : Math.min(conf, c);
  }
  return {
    ...parsed,
    start,
    end: i,
    x0: tokens[start].x0,
    x1: tokens[i].x1,
    conf,
  };
}

/**
 * Find the amounts at the right end of a line: the last amount on the line plus any amounts
 * directly to its left (debit / credit / balance columns). Returned left to right.
 * A number in the middle of a description is not part of that run and is left alone.
 */
export function findTrailingAmounts(
  tokens: TextToken[],
  options: FindAmountOptions,
): AmountHit[] {
  const from = Math.max(0, options.from ?? 0);
  let hit: AmountHit | null = null;
  for (let i = tokens.length - 1; i >= from && !hit; i--) {
    const candidate = hitEndingAt(tokens, i, options);
    if (candidate && candidate.start >= from) hit = candidate;
  }
  if (!hit) return [];
  const hits = [hit];
  let j = hit.start - 1;
  while (j >= from) {
    const candidate = hitEndingAt(tokens, j, options);
    if (!candidate && EMPTY_CELL_RE.test(normaliseDashes(tokens[j].text))) {
      // A lone dash is an empty debit or credit cell; look past it.
      j--;
      continue;
    }
    if (!candidate || candidate.start < from) break;
    hits.unshift(candidate);
    j = candidate.start - 1;
  }
  return hits;
}

const DECORATION_PREFIX = "^\\(?[-+]?[$£€]?-?";
const DECORATION_SUFFIX = "\\)?-?(?:CR|DR)?$";
const DOT_STYLE_RE = new RegExp(
  `${DECORATION_PREFIX}(?:\\d{1,3}(?:,\\d{3})+|\\d+)\\.\\d{2}${DECORATION_SUFFIX}`,
  "i",
);
const COMMA_STYLE_RE = new RegExp(
  `${DECORATION_PREFIX}(?:\\d{1,3}(?:\\.\\d{3})+|\\d+),\\d{2}${DECORATION_SUFFIX}`,
  "i",
);

/** True when amounts written 1.234,56 outnumber amounts written 1,234.56 in the file. */
export function detectCommaDecimal(tokenTexts: Iterable<string>): boolean {
  let dot = 0;
  let comma = 0;
  for (const raw of tokenTexts) {
    const text = normaliseDashes(raw);
    if (DOT_STYLE_RE.test(text)) dot++;
    else if (COMMA_STYLE_RE.test(text)) comma++;
  }
  return comma > dot;
}
