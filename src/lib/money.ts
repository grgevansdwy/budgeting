// The only place strings become cents and cents become strings. No floats.

import type { Cents } from "./types";

const AMOUNT_RE = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/;

/**
 * Parse a human-typed amount ("1,234.56", "$12", "-3.5", "(4.00)") into signed cents.
 * Returns null for empty input, more than two decimals or anything non-numeric.
 */
export function parseAmountToCents(input: string): Cents | null {
  let s = input.trim().replace(/[−–]/g, "-");
  if (s === "") return null;
  let negative = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  if (s.endsWith("-")) {
    negative = !negative;
    s = s.slice(0, -1).trim();
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1).trim();
  } else if (s.startsWith("+")) {
    s = s.slice(1).trim();
  }
  if (s.startsWith("$")) {
    s = s.slice(1).trim();
    // "$-12.34"
    if (s.startsWith("-")) {
      negative = !negative;
      s = s.slice(1).trim();
    }
  }
  const m = AMOUNT_RE.exec(s);
  if (!m) return null;
  const whole = m[1].replace(/,/g, "");
  const frac = (m[2] ?? "").padEnd(2, "0");
  const cents = Number(whole) * 100 + Number(frac);
  if (!Number.isSafeInteger(cents)) return null;
  return negative && cents !== 0 ? -cents : cents;
}

/** "1234.56" style string, no symbol or separators. For inputs and spreadsheets. */
export function centsToDecimalString(cents: Cents): string {
  assertCents(cents);
  const abs = Math.abs(cents);
  const whole = Math.trunc(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${cents < 0 ? "-" : ""}${whole}.${frac}`;
}

/** "$1,234.56" for display. */
export function formatCents(cents: Cents, symbol = "$"): string {
  assertCents(cents);
  const abs = Math.abs(cents);
  const whole = String(Math.trunc(abs / 100)).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ",",
  );
  const frac = String(abs % 100).padStart(2, "0");
  return `${cents < 0 ? "-" : ""}${symbol}${whole}.${frac}`;
}

export function assertCents(value: number): asserts value is Cents {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Not an integer cent amount: ${value}`);
  }
}
