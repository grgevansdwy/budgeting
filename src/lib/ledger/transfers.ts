// Tags card payments and own-account transfers so they stay out of the totals.

import type { Transaction } from "../types";
import { containsKeyword, normalizeDescription } from "./categorize";

/** Phrases that mark a row as a card payment or own-account transfer on their own. */
export const TRANSFER_KEYWORDS: readonly string[] = [
  "payment thank you",
  "payment received",
  "autopay",
  "online payment",
  "epayment",
  "credit card payment",
  "crcardpmt",
  "transfer to",
  "transfer from",
  "online transfer",
  "xfer",
  "to savings",
  "from checking",
];

/** Person-to-person services: real spending or income, never auto-tagged. */
const PERSON_TO_PERSON = ["zelle", "venmo"];
const PAIRING_WORDS = ["payment", "transfer"];
export const PAIRING_WINDOW_DAYS = 3;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Whole days since the epoch for an ISO date, or null when the date is malformed. */
function dayNumber(date: string): number | null {
  const m = ISO_DATE.exec(date);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) : null;
}

function hasAny(text: string, words: readonly string[]): boolean {
  return words.some((w) => containsKeyword(text, w));
}

/**
 * Returns copies of the rows with isTransfer and transferReason set where a transfer is detected.
 *
 * 1. Keyword pass: the description contains one of TRANSFER_KEYWORDS.
 * 2. Pairing pass: an expense and an income from different files with the same amount, dates
 *    within three days and "payment" or "transfer" on at least one side. Each row pairs once,
 *    with the closest date winning.
 *
 * Zelle and Venmo rows and split rows are never tagged. Rows already tagged stay tagged and keep
 * their reason.
 */
export function tagTransfers(transactions: Transaction[]): Transaction[] {
  const rows = transactions.map((t) => ({ ...t }));
  const texts = rows.map((t) => normalizeDescription(t.description));
  const eligible = rows.map(
    (t, i) => t.split === null && !hasAny(texts[i], PERSON_TO_PERSON),
  );

  // Keyword pass.
  rows.forEach((row, i) => {
    if (row.isTransfer || !eligible[i]) return;
    const hit = TRANSFER_KEYWORDS.find((k) => containsKeyword(texts[i], k));
    if (hit !== undefined) {
      row.isTransfer = true;
      row.transferReason = `Description contains "${hit}"`;
    }
  });

  // Pairing pass. Already-tagged rows take part so their counterpart gets tagged too.
  const days = rows.map((t) => dayNumber(t.date));
  const hasPairingWord = texts.map((text) => hasAny(text, PAIRING_WORDS));
  const paired = new Set<number>();

  rows.forEach((expense, e) => {
    const expenseDay = days[e];
    if (expense.kind !== "expense" || !eligible[e] || expenseDay === null) {
      return;
    }
    let best = -1;
    let bestGap = PAIRING_WINDOW_DAYS + 1;
    rows.forEach((income, i) => {
      const incomeDay = days[i];
      if (
        income.kind !== "income" ||
        !eligible[i] ||
        incomeDay === null ||
        paired.has(i) ||
        income.amountCents !== expense.amountCents ||
        income.sourceFileId === expense.sourceFileId ||
        !(hasPairingWord[e] || hasPairingWord[i])
      ) {
        return;
      }
      const gap = Math.abs(incomeDay - expenseDay);
      if (gap < bestGap) {
        best = i;
        bestGap = gap;
      }
    });
    if (best === -1) return;

    paired.add(best);
    const income = rows[best];
    if (!expense.isTransfer) {
      expense.isTransfer = true;
      expense.transferReason = `Matches the same amount coming in on ${income.date} (${income.sourceFileName})`;
    }
    if (!income.isTransfer) {
      income.isTransfer = true;
      income.transferReason = `Matches the same amount going out on ${expense.date} (${expense.sourceFileName})`;
    }
  });

  return rows;
}
