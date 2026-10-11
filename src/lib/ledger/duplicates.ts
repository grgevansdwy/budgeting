// Cross-file duplicate detection. Derived on every render, never stored.

import type { Transaction } from "../types";

function duplicateKey(t: Transaction): string {
  // A split row's amountCents is only the user's share; the statement showed the full total.
  const cents = t.split ? t.split.totalCents : t.amountCents;
  const description = t.description.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${t.date}|${cents}|${t.kind}|${description}`;
}

/**
 * Ids of rows that look like the same transaction imported from more than one file. Rows match on
 * date, amount, kind and description. A group counts only when it spans at least two source files,
 * so two identical purchases on one statement are left alone. Rows with duplicateDismissed are
 * ignored, which also clears the flag on a lone remaining partner.
 */
export function findDuplicateIds(transactions: Transaction[]): Set<string> {
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (t.duplicateDismissed) continue;
    const key = duplicateKey(t);
    const group = groups.get(key);
    if (group) group.push(t);
    else groups.set(key, [t]);
  }

  const ids = new Set<string>();
  for (const group of groups.values()) {
    if (new Set(group.map((t) => t.sourceFileId)).size < 2) continue;
    for (const t of group) ids.add(t.id);
  }
  return ids;
}
