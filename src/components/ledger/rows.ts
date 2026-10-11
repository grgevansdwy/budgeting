// Row ordering and date display for the ledger tables. No money maths here.

import type { Transaction, TransactionKind } from "@/lib/types";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * "2026-10-03" -> "Oct 3". Built from the string itself: `new Date("2026-10-03")` is UTC midnight
 * and shows the previous day in timezones behind UTC.
 */
export function formatShortDate(iso: string): string {
  const m = ISO_DATE_RE.exec(iso);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return iso;
  return `${month} ${Number(m[3])}`;
}

/** Rows of one kind, by date and then by the order they have in the working set. */
export function rowsOfKind(
  transactions: Transaction[],
  kind: TransactionKind,
): Transaction[] {
  return transactions
    .map((t, index) => ({ t, index }))
    .filter(({ t }) => t.kind === kind)
    .sort((a, b) =>
      a.t.date < b.t.date ? -1 : a.t.date > b.t.date ? 1 : a.index - b.index,
    )
    .map(({ t }) => t);
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
