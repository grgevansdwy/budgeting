// Month totals. Integer cents only.

import { assertCents } from "../money";
import type { Cents, Totals, Transaction } from "../types";

/**
 * Expense, income and per-category totals. Transfers are left out everywhere. A split row counts
 * its amountCents, which is already the user's share. byCategory covers expenses only and has no
 * entry for a category that sums to zero.
 */
export function computeTotals(transactions: Transaction[]): Totals {
  let expenseCents = 0;
  let incomeCents = 0;
  const sums = new Map<string, Cents>();

  for (const t of transactions) {
    if (t.isTransfer) continue;
    assertCents(t.amountCents);
    if (t.kind === "income") {
      incomeCents += t.amountCents;
    } else {
      expenseCents += t.amountCents;
      sums.set(t.categoryId, (sums.get(t.categoryId) ?? 0) + t.amountCents);
    }
  }
  assertCents(expenseCents);
  assertCents(incomeCents);

  const byCategory: Record<string, Cents> = {};
  for (const [categoryId, cents] of sums) {
    if (cents !== 0) byCategory[categoryId] = cents;
  }
  return { expenseCents, incomeCents, byCategory };
}

/** Cumulative sum down the rows in the order given, one entry per row. A transfer row adds 0. */
export function runningTotals(rows: Transaction[]): Cents[] {
  let sum = 0;
  return rows.map((row) => {
    if (!row.isTransfer) {
      assertCents(row.amountCents);
      sum += row.amountCents;
      assertCents(sum);
    }
    return sum;
  });
}
