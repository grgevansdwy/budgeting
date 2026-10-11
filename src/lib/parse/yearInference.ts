// Finds the statement's closing date (the "anchor") and gives yearless dates a year from it.

import {
  dayNumber,
  matchDateAt,
  parseIsoDate,
  resolveDate,
  toIsoDate,
  type DateParts,
  type ResolvedOrder,
  type YearMonthDay,
} from "./dates";

export interface Anchor extends YearMonthDay {
  /** "period": a labelled statement date. "latest-date": latest full date in the text. "fallback": no date in the document. */
  source: "period" | "latest-date" | "fallback";
  /** Start of the statement period, when the document states one. */
  periodStart: YearMonthDay | null;
}

/** A yearless date may fall this many days after the anchor before it is moved to the previous year. */
export const ANCHOR_GRACE_DAYS = 7;
/** Rows this far outside a stated statement period are flagged. */
export const PERIOD_GRACE_DAYS = 7;
/** With no labelled date, full dates later than the fallback date by more than this are ignored (promo expiry dates and the like). */
export const LATEST_DATE_MAX_FUTURE_DAYS = 45;

const PERIOD_RE =
  /statement period|billing period|billing cycle|activity from|transactions from/;
const SINGLE_DATE_RE =
  /closing date|statement date|statement closing|period ending|statement ending|statement end date/;

const JOINED_DATES_RE =
  /^(\d{1,4}[/.]\d{1,2}[/.]\d{2,4})-(\d{1,4}[/.]\d{1,2}[/.]\d{2,4})$/;

/** Split "12/15/2025-01/14/2026" into two tokens and drop bare dashes. */
function explode(tokens: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of tokens) {
    const token = raw.replace(/[−‒–—]/g, "-");
    const joined = JOINED_DATES_RE.exec(token);
    if (joined) out.push(joined[1], joined[2]);
    else if (token !== "-") out.push(token.replace(/^-+|-+$/g, ""));
  }
  return out;
}

/** Every full (with a year) date in a token list, with the token index it starts at. */
export function findFullDates(
  tokens: readonly string[],
): { parts: DateParts; index: number }[] {
  const found: { parts: DateParts; index: number }[] = [];
  let i = 0;
  while (i < tokens.length) {
    const match = matchDateAt(tokens, i);
    if (match && match.parts.year !== null) {
      found.push({ parts: match.parts, index: i });
      i += match.tokenCount;
    } else {
      i++;
    }
  }
  return found;
}

function toYmd(parts: DateParts, order: ResolvedOrder): YearMonthDay | null {
  const { month, day, year } = resolveDate(parts, order);
  if (year === null || toIsoDate(year, month, day) === null) return null;
  return { year, month, day };
}

function toDayNumber(d: YearMonthDay): number {
  return dayNumber(d.year, d.month, d.day);
}

/** Full dates on the labelled statement-date lines; they also count as evidence for the date order. */
export function labelledDateParts(
  lines: readonly (readonly string[])[],
): DateParts[] {
  const parts: DateParts[] = [];
  for (const tokens of lines) {
    const text = tokens.join(" ").toLowerCase();
    if (PERIOD_RE.test(text) || SINGLE_DATE_RE.test(text)) {
      for (const d of findFullDates(explode(tokens))) parts.push(d.parts);
    }
  }
  return parts;
}

/** Token index at which the regex match starts, in a list of tokens joined by single spaces. */
function tokenIndexOfMatch(tokens: readonly string[], re: RegExp): number {
  const m = re.exec(tokens.join(" ").toLowerCase());
  if (!m) return -1;
  let offset = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (offset + tokens[i].length > m.index) return i;
    offset += tokens[i].length + 1;
  }
  return -1;
}

/**
 * Look for the statement closing date: a line labelled "Statement period", "Closing date" or
 * "Statement date"; otherwise the latest full date anywhere in the document.
 * `notAfter` (the caller's fallback date) keeps far-future dates out of the unlabelled search.
 */
export function findAnchor(
  lines: readonly (readonly string[])[],
  order: ResolvedOrder,
  notAfter: YearMonthDay | null,
): Anchor | null {
  for (const rawTokens of lines) {
    const tokens = explode(rawTokens);
    const periodAt = tokenIndexOfMatch(tokens, PERIOD_RE);
    const singleAt =
      periodAt >= 0 ? -1 : tokenIndexOfMatch(tokens, SINGLE_DATE_RE);
    const at = periodAt >= 0 ? periodAt : singleAt;
    if (at < 0) continue;
    const dates = findFullDates(tokens)
      .filter((d) => d.index >= at)
      .map((d) => toYmd(d.parts, order))
      .filter((d): d is YearMonthDay => d !== null);
    if (dates.length === 0) continue;
    if (periodAt >= 0 && dates.length >= 2) {
      const [a, b] = dates;
      const [start, end] = toDayNumber(a) <= toDayNumber(b) ? [a, b] : [b, a];
      return { ...end, source: "period", periodStart: start };
    }
    return { ...dates[0], source: "period", periodStart: null };
  }

  let latest: YearMonthDay | null = null;
  const limit =
    notAfter === null
      ? Infinity
      : toDayNumber(notAfter) + LATEST_DATE_MAX_FUTURE_DAYS;
  for (const rawTokens of lines) {
    for (const found of findFullDates(explode(rawTokens))) {
      const ymd = toYmd(found.parts, order);
      if (!ymd || toDayNumber(ymd) > limit) continue;
      if (!latest || toDayNumber(ymd) > toDayNumber(latest)) latest = ymd;
    }
  }
  return latest
    ? { ...latest, source: "latest-date", periodStart: null }
    : null;
}

/** Anchor built from the caller's fallback date (file modified time or today). Never throws. */
export function fallbackAnchor(
  fallbackDate: unknown,
  today = new Date(),
): Anchor {
  const parsed = parseIsoDate(fallbackDate) ?? {
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    day: today.getDate(),
  };
  return { ...parsed, source: "fallback", periodStart: null };
}

/**
 * Year for a yearless date: the anchor's year, or the year before when that would put the date
 * more than a few days after the anchor (a December row on a statement that closes in January).
 */
export function inferYear(
  month: number,
  day: number,
  anchor: YearMonthDay,
): number {
  const candidate = dayNumber(anchor.year, month, day);
  const limit = toDayNumber(anchor) + ANCHOR_GRACE_DAYS;
  return candidate > limit ? anchor.year - 1 : anchor.year;
}

/** True when a resolved date lies outside the stated statement period (with a few days' grace). */
export function isOutsidePeriod(date: YearMonthDay, anchor: Anchor): boolean {
  if (anchor.source !== "period") return false;
  const n = toDayNumber(date);
  if (n > toDayNumber(anchor) + PERIOD_GRACE_DAYS) return true;
  return (
    anchor.periodStart !== null &&
    n < toDayNumber(anchor.periodStart) - PERIOD_GRACE_DAYS
  );
}
