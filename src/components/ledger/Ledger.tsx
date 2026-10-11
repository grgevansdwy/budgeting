"use client";

import { useCallback, useMemo, useState } from "react";
import { SplitDialog } from "@/components/split/SplitDialog";
import { findDuplicateIds } from "@/lib/ledger/duplicates";
import { computeTotals } from "@/lib/ledger/totals";
import { useBudgetStore } from "@/lib/store/store";
import { formatTodo, selectTodos } from "@/lib/todo/todos";
import { AddCategoryDialog } from "./AddCategoryDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import { LedgerTable } from "./LedgerTable";
import { needsReview } from "./reviewFlags";
import { plural, rowsOfKind } from "./rows";
import { TotalsBar } from "./TotalsBar";

type OpenDialog = {
  kind: "split" | "delete" | "category";
  transactionId: string;
} | null;

/** The expenses and income tables for the loaded month. Renders nothing until a month is loaded. */
export function Ledger() {
  // Select stored references only; everything derived is memoised below.
  const workingSet = useBudgetStore((s) => s.workingSet);
  const categories = useBudgetStore((s) => s.settings.categories);
  const deleteTransaction = useBudgetStore((s) => s.deleteTransaction);
  const updateTransaction = useBudgetStore((s) => s.updateTransaction);
  const addCategory = useBudgetStore((s) => s.addCategory);

  const [dialog, setDialog] = useState<OpenDialog>(null);
  const closeDialog = useCallback(() => setDialog(null), []);

  const transactions = workingSet?.transactions;
  const derived = useMemo(() => {
    if (!transactions) return null;
    return {
      expenses: rowsOfKind(transactions, "expense"),
      income: rowsOfKind(transactions, "income"),
      totals: computeTotals(transactions),
      duplicateIds: findDuplicateIds(transactions),
      toCheck: transactions.filter(needsReview).length,
      transfers: transactions.filter((t) => t.isTransfer).length,
    };
  }, [transactions]);

  const requestDelete = useCallback(
    (transactionId: string) => {
      const row = useBudgetStore
        .getState()
        .workingSet?.transactions.find((t) => t.id === transactionId);
      if (!row) return;
      if (selectTodos([row]).length > 0) {
        setDialog({ kind: "delete", transactionId });
      } else {
        deleteTransaction(transactionId);
      }
    },
    [deleteTransaction],
  );
  const openSplit = useCallback(
    (transactionId: string) => setDialog({ kind: "split", transactionId }),
    [],
  );
  const openAddCategory = useCallback(
    (transactionId: string) => setDialog({ kind: "category", transactionId }),
    [],
  );

  if (!transactions || !derived) return null;

  const { expenses, income, totals, duplicateIds, toCheck, transfers } =
    derived;
  const notes = [
    toCheck > 0 && plural(toCheck, "row to check", "rows to check"),
    duplicateIds.size > 0 &&
      plural(duplicateIds.size, "possible duplicate", "possible duplicates"),
    transfers > 0 &&
      plural(transfers, "transfer excluded", "transfers excluded"),
  ].filter((note): note is string => typeof note === "string");

  // A dialog whose row has gone (deleted, or another month loaded) simply does not render.
  const dialogRow = dialog
    ? transactions.find((t) => t.id === dialog.transactionId)
    : undefined;
  const pendingTodos =
    dialog?.kind === "delete" && dialogRow ? selectTodos([dialogRow]) : [];

  return (
    <div className="space-y-3">
      <TotalsBar
        expenseCents={totals.expenseCents}
        incomeCents={totals.incomeCents}
      />

      {notes.length > 0 && (
        <p className="px-1 text-sm text-zinc-600">{notes.join(" · ")}</p>
      )}

      <div className="grid grid-cols-1 items-start gap-4 min-[1100px]:grid-cols-2">
        <LedgerTable
          title="Expenses"
          emptyText="No expenses in this month"
          rows={expenses}
          totalCents={totals.expenseCents}
          categories={categories}
          duplicateIds={duplicateIds}
          onRequestDelete={requestDelete}
          onOpenSplit={openSplit}
          onAddCategory={openAddCategory}
        />
        <LedgerTable
          title="Income"
          emptyText="No income in this month"
          rows={income}
          totalCents={totals.incomeCents}
          categories={categories}
          duplicateIds={duplicateIds}
          onRequestDelete={requestDelete}
          onOpenSplit={openSplit}
          onAddCategory={openAddCategory}
        />
      </div>

      {dialog?.kind === "split" && dialogRow && (
        <SplitDialog transactionId={dialogRow.id} onClose={closeDialog} />
      )}

      {dialog?.kind === "category" && dialogRow && (
        <AddCategoryDialog
          onClose={closeDialog}
          onAdd={(name) => {
            const categoryId = addCategory(name);
            updateTransaction(dialogRow.id, { categoryId });
            closeDialog();
          }}
        />
      )}

      {dialog?.kind === "delete" && dialogRow && (
        <ConfirmDialog
          title="Delete this split row?"
          confirmLabel="Delete row"
          onCancel={closeDialog}
          onConfirm={() => {
            deleteTransaction(dialogRow.id);
            closeDialog();
          }}
        >
          <p>
            “{dialogRow.description}” still has{" "}
            {plural(pendingTodos.length, "to-do", "to-dos")} for money to
            collect. Deleting the row removes{" "}
            {pendingTodos.length === 1 ? "it" : "them"} too:
          </p>
          <ul className="mt-2 list-disc space-y-0.5 pl-5">
            {pendingTodos.map((todo) => (
              <li key={todo.shareId}>{formatTodo(todo)}</li>
            ))}
          </ul>
        </ConfirmDialog>
      )}
    </div>
  );
}
