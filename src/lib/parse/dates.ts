// Date recognition for the first tokens of a statement line. Nothing here knows the day/month
// order of a numeric date: that is decided per file and applied in resolveDate.

import { fixConfusables } from "./amounts";

export type ResolvedOrder = "MDY" | "DMY";

export type DateParts =
  // "03/04/2026", "03/04": which part is the month depends on the file's date order.
  | { form: "numeric"; first: number; second: number; year: number | null }
  // ISO or month-name dates: no ambiguity.
  | { form: "fixed"; month: number; day: number; year: number | null };

export interface DateMatch {
  parts: DateParts;
  /** How many tokens the date occupies. */
  tokenCount: number;
  /** True when OCR confusable characters had to be corrected to read the date. */
  corrected: boolean;
  /** True for a bare "12.03", which could equally be the amount 12.03. */
  amountLike: boolean;
}

export interface DateMatchOptions {
  ocr?: boolean;
}

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const MIN_YEAR = 1990;
const MAX_YEAR = 2099;
// Two-digit years below this are 20xx, the rest 19xx.
const TWO_DIGIT_PIVOT = 80;

const ISO_RE = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/;
const NUMERIC_FULL_RE = /^(\d{1,2})([/.-])(\d{1,2})\2(\d{4}|\d{2})$/;
const NUMERIC_SHORT_RE = /^(\d{1,2})[/-](\d{1,2})$/;
const NUMERIC_SHORT_DOT_RE = /^(\d{2})\.(\d{2})$/;
// "12-Mar-2026", "12Mar", "12-Mar"
const DAY_MONTH_TOKEN_RE =
  /^(\d{1,2})[-/]?([A-Za-z]{3,9})\.?(?:[-/,](\d{4}|\d{2}))?$/;
// "Mar-12", "Mar12"
const MONTH_DAY_TOKEN_RE = /^([A-Za-z]{3,9})\.?[-/]?(\d{1,2})$/;
const DAY_RE = /^\d{1,2}$/;
const YEAR_RE = /^\d{4}$/;
// Only digits, date separators and characters OCR confuses with digits.
const OCR_DATE_SHAPE_RE =
  /^[\dOolI|SB]{1,4}[/.-][\dOolI|SB]{1,2}(?:[/.-][\dOolI|SB]{2,4})?$/;
const OCR_DAY_SHAPE_RE = /^[\dOolI|SB]{1,2}$/;

function expandYear(text: string): number | null {
  const n = Number(text);
  if (text.length === 2) return n < TWO_DIGIT_PIVOT ? 2000 + n : 1900 + n;
  return n >= MIN_YEAR && n <= MAX_YEAR ? n : null;
}

function monthFromName(text: string): number | null {
  return MONTHS[text.toLowerCase().replace(/[.,]+$/, "")] ?? null;
}

function numericParts(
  first: number,
  second: number,
  year: number | null,
): DateParts | null {
  if (first < 1 || second < 1 || first > 31 || second > 31) return null;
  if (first > 12 && second > 12) return null;
  return { form: "numeric", first, second, year };
}

function fixedParts(
  month: number,
  day: number,
  year: number | null,
): DateParts | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { form: "fixed", month, day, year };
}

/** Strip the punctuation that trails a date token: "12," "2026." "03/14:" */
function trimToken(text: string): string {
  return text.replace(/[,;:]+$/, "");
}

function matchSingleToken(
  token: string,
): { parts: DateParts; amountLike: boolean } | null {
  let m = ISO_RE.exec(token);
  if (m) {
    const year = expandYear(m[1]);
    const parts =
      year === null ? null : fixedParts(Number(m[2]), Number(m[3]), year);
    return parts ? { parts, amountLike: false } : null;
  }
  m = NUMERIC_FULL_RE.exec(token);
  if (m) {
    const year = expandYear(m[4]);
    const parts =
      year === null ? null : numericParts(Number(m[1]), Number(m[3]), year);
    return parts ? { parts, amountLike: false } : null;
  }
  m = NUMERIC_SHORT_RE.exec(token);
  if (m) {
    const parts = numericParts(Number(m[1]), Number(m[2]), null);
    return parts ? { parts, amountLike: false } : null;
  }
  // "12.03" and "12.03." (the trailing dot rules out an amount).
  const trailingDot = token.endsWith(".");
  m = NUMERIC_SHORT_DOT_RE.exec(trailingDot ? token.slice(0, -1) : token);
  if (m) {
    const parts = numericParts(Number(m[1]), Number(m[2]), null);
    return parts ? { parts, amountLike: !trailingDot } : null;
  }
  m = DAY_MONTH_TOKEN_RE.exec(token);
  if (m) {
    const month = monthFromName(m[2]);
    if (month === null) return null;
    const year = m[3] === undefined ? null : expandYear(m[3]);
    if (m[3] !== undefined && year === null) return null;
    const parts = fixedParts(month, Number(m[1]), year);
    return parts ? { parts, amountLike: false } : null;
  }
  m = MONTH_DAY_TOKEN_RE.exec(token);
  if (m) {
    const month = monthFromName(m[1]);
    if (month === null) return null;
    const parts = fixedParts(month, Number(m[2]), null);
    return parts ? { parts, amountLike: false } : null;
  }
  return null;
}

/** A day number, allowing OCR confusables when asked. Returns the digits and whether they were fixed. */
function readDay(
  token: string | undefined,
  ocr: boolean,
): { day: number; corrected: boolean } | null {
  if (token === undefined) return null;
  const t = trimToken(token);
  if (DAY_RE.test(t)) return { day: Number(t), corrected: false };
  if (ocr && OCR_DAY_SHAPE_RE.test(t)) {
    const fixed = fixConfusables(t);
    if (DAY_RE.test(fixed)) return { day: Number(fixed), corrected: true };
  }
  return null;
}

function readYear(token: string | undefined): number | null {
  if (token === undefined) return null;
  const t = trimToken(token).replace(/\.$/, "");
  return YEAR_RE.test(t) ? expandYear(t) : null;
}

/**
 * Try to read a date starting at tokens[start]. Handles single-token dates ("03/14/2026",
 * "2026-03-14", "14-Mar-26") and month-name dates spread over two or three tokens
 * ("14 Mar", "Mar 14, 2026").
 */
export function matchDateAt(
  tokens: readonly string[],
  start: number,
  options: DateMatchOptions = {},
): DateMatch | null {
  const raw = tokens[start];
  if (typeof raw !== "string" || raw.length > 20) return null;
  const ocr = options.ocr === true;
  const token = trimToken(raw);

  const single = matchSingleToken(token);
  if (single) {
    return { ...single, tokenCount: 1, corrected: false };
  }
  if (ocr && OCR_DATE_SHAPE_RE.test(token)) {
    const fixed = matchSingleToken(fixConfusables(token));
    if (fixed) {
      return { ...fixed, tokenCount: 1, corrected: true };
    }
  }

  // "14 Mar" / "14 Mar 2026"
  const leadingDay = readDay(raw, ocr);
  if (leadingDay && tokens[start + 1] !== undefined) {
    const month = monthFromName(tokens[start + 1]);
    if (month !== null) {
      const year = readYear(tokens[start + 2]);
      const parts = fixedParts(month, leadingDay.day, year);
      if (parts) {
        return {
          parts,
          tokenCount: year === null ? 2 : 3,
          corrected: leadingDay.corrected,
          amountLike: false,
        };
      }
    }
  }

  // "Mar 14" / "Mar 14, 2026"
  const month = monthFromName(raw);
  if (month !== null) {
    const day = readDay(tokens[start + 1], ocr);
    if (day) {
      const year = readYear(tokens[start + 2]);
      const parts = fixedParts(month, day.day, year);
      if (parts) {
        return {
          parts,
          tokenCount: year === null ? 2 : 3,
          corrected: day.corrected,
          amountLike: false,
        };
      }
    }
  }
  return null;
}

export interface OrderEvidence {
  mdy: number;
  dmy: number;
}

/** Count the dates that can only be read one way: a first part above 12 is DMY, a second part above 12 is MDY. */
export function countOrderEvidence(dates: Iterable<DateParts>): OrderEvidence {
  const evidence: OrderEvidence = { mdy: 0, dmy: 0 };
  for (const parts of dates) {
    if (parts.form !== "numeric") continue;
    if (parts.first > 12) evidence.dmy++;
    else if (parts.second > 12) evidence.mdy++;
  }
  return evidence;
}

/** The order the file's own dates prove, or null when nothing settles it (or the evidence is split evenly). */
export function inferDateOrder(
  dates: Iterable<DateParts>,
): ResolvedOrder | null {
  const { mdy, dmy } = countOrderEvidence(dates);
  if (mdy === dmy) return null;
  return mdy > dmy ? "MDY" : "DMY";
}

/** True when a numeric date reads as a valid date in both orders and the two readings differ. */
export function isOrderAmbiguous(parts: DateParts): boolean {
  return (
    parts.form === "numeric" &&
    parts.first <= 12 &&
    parts.second <= 12 &&
    parts.first !== parts.second
  );
}

export interface MonthDay {
  month: number;
  day: number;
  year: number | null;
}

/** Apply the file's date order. A date that is impossible in that order is read the other way round. */
export function resolveDate(parts: DateParts, order: ResolvedOrder): MonthDay {
  if (parts.form === "fixed") {
    return { month: parts.month, day: parts.day, year: parts.year };
  }
  const monthFirst = order === "MDY" ? parts.first <= 12 : parts.second > 12;
  return monthFirst
    ? { month: parts.first, day: parts.second, year: parts.year }
    : { month: parts.second, day: parts.first, year: parts.year };
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** ISO YYYY-MM-DD, or null when the day does not exist in that month. */
export function toIsoDate(
  year: number,
  month: number,
  day: number,
): string | null {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }
  if (year < 1 || year > 9999 || month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export interface YearMonthDay {
  year: number;
  month: number;
  day: number;
}

export function parseIsoDate(iso: unknown): YearMonthDay | null {
  if (typeof iso !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const ymd = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  return toIsoDate(ymd.year, ymd.month, ymd.day) === null ? null : ymd;
}

/** Days since the epoch, for comparing calendar dates without time zones. */
export function dayNumber(year: number, month: number, day: number): number {
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000);
}
