// Lines that are never transactions, even when they carry a date and an amount.

const ALWAYS_STOP: RegExp[] = [
  /\b(opening|closing|previous|beginning|ending|starting|new|current|statement|outstanding) balance\b/,
  /\bbalance (brought |carried )?forward\b/,
  /\b(brought|carried) forward\b/,
  /\bbalance as of\b/,
  /\bsub ?totals?\b/,
  /\bminimum (payment|amount)\b/,
  /\b(payment|amount) due\b/,
  /\bpage [\dloi|]+ ?(of|\/) ?[\dloi|]+\b/,
  /\bcontinued\b/,
  /\bcont'?d\b/,
  /\bcredit limit\b/,
  /\bavailable (credit|balance)\b/,
  /\b(statement|billing) (period|date|closing)\b/,
  /\bclosing date\b/,
  /\bannual percentage rate\b/,
];

// "Total" is a stop word, but a dated row whose merchant merely starts with it is kept unless
// what follows is statement-summary vocabulary.
const TOTAL_RE = /\btotals?\b(.*)$/;
const TOTAL_SUMMARY_RE =
  /^(for|of|in|to|fees?|interest|purchases?|payments?|charges?|charged|credits?|debits?|deposits?|withdrawals?|amount|due|balance|this|year|ytd|new|other|checks?|cash|transactions?|activity|spent|spending|paid|money|[-+$£€(.\d])/;

const BALANCE_MARKER_RE =
  /\b(opening|previous|beginning|starting) balance\b|\bbalance (brought |carried )?forward\b|\bbrought forward\b/;

function normalise(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * True for balance, total, page and summary lines. `dated` says whether the line starts with a
 * date; it only affects how strictly "total" is read.
 */
export function isStopLine(text: string, dated = false): boolean {
  const t = normalise(text);
  if (t === "") return false;
  if (ALWAYS_STOP.some((re) => re.test(t))) return true;
  const total = TOTAL_RE.exec(t);
  if (total) {
    if (!dated) return true;
    const rest = total[1].replace(/^[\s:]+/, "");
    if (rest === "" || TOTAL_SUMMARY_RE.test(rest)) return true;
  }
  return false;
}

/** True for a stop line that states the balance before the first transaction. */
export function isOpeningBalanceLine(text: string): boolean {
  return BALANCE_MARKER_RE.test(normalise(text));
}
