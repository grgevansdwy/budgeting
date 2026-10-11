// The to-do list is derived from splits and never stored.

import { formatCents } from "../money";
import type { TodoItem, Transaction } from "../types";

/**
 * One item per non-user share with amountCents > 0 and requested === false, on non-transfer
 * expense rows. Ordered by transaction date, then share order. Rows on the same date keep the
 * order they have in `transactions`.
 */
export function selectTodos(transactions: Transaction[]): TodoItem[] {
  const rows = transactions
    .filter((t) => t.kind === "expense" && !t.isTransfer && t.split !== null)
    .map((t, index) => ({ t, index }))
    .sort((a, b) =>
      a.t.date < b.t.date ? -1 : a.t.date > b.t.date ? 1 : a.index - b.index,
    );
  const todos: TodoItem[] = [];
  for (const { t } of rows) {
    for (const sh of t.split?.shares ?? []) {
      if (sh.isUser || sh.requested || sh.amountCents <= 0) continue;
      todos.push({
        transactionId: t.id,
        shareId: sh.id,
        name: sh.name,
        amountCents: sh.amountCents,
        description: t.description,
      });
    }
  }
  return todos;
}

/** "Collect $12.50 from Sam — Dinner at Example Bistro" */
export function formatTodo(item: TodoItem): string {
  return `Collect ${formatCents(item.amountCents)} from ${item.name} — ${item.description}`;
}
