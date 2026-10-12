"use client";

import { memo } from "react";
import { formatCents } from "@/lib/money";
import { useBudgetStore } from "@/lib/store/store";
import type { Category, Cents, Transaction } from "@/lib/types";
import { AmountCell } from "./AmountCell";
import { CategorySelect } from "./CategorySelect";
import { DescriptionCell } from "./DescriptionCell";
import { needsReview, reviewReasons } from "./reviewFlags";
import { formatShortDate } from "./rows";
import { badge, dangerTextButton, textButton } from "./styles";

export interface LedgerRowProps {
  transaction: Transaction;
  /** Running total of the table down to and including this row. */
  runningCents: Cents;
  isDuplicate: boolean;
  categories: Category[];
  /** Delete the row, asking first when it has outstanding to-dos. */
  onRequestDelete: (transactionId: string) => void;
  onOpenSplit: (transactionId: string) => void;
  onAddCategory: (transactionId: string) => void;
}

export const LedgerRow = memo(function LedgerRow({
  transaction: t,
  runningCents,
  isDuplicate,
  categories,
  onRequestDelete,
  onOpenSplit,
  onAddCategory,
}: LedgerRowProps) {
  const updateTransaction = useBudgetStore((s) => s.updateTransaction);
  const setTransfer = useBudgetStore((s) => s.setTransfer);
  const markReviewed = useBudgetStore((s) => s.markReviewed);
  const dismissDuplicate = useBudgetStore((s) => s.dismissDuplicate);

  const review = needsReview(t);
  const reasons = review ? reviewReasons(t.flags).join("; ") : "";
  const isSplit = t.split !== null;
  const isExpense = t.kind === "expense";

  return (
    <tr
      className={`border-t border-zinc-100 align-top ${review ? "bg-amber-50" : ""} ${t.isTransfer ? "text-zinc-400" : "text-zinc-900"}`}
    >
      <td
        className={`border-l-4 py-1.5 pr-2 pl-2 whitespace-nowrap ${review ? "border-amber-400" : "border-transparent"} ${t.isTransfer ? "" : "text-zinc-500"}`}
      >
        <time dateTime={t.date}>{formatShortDate(t.date)}</time>
      </td>

      <td className="max-w-[16rem] min-w-[9rem] px-2 py-1">
        <DescriptionCell id={t.id} description={t.description} />

        <div
          className="mt-0.5 truncate text-[11px] leading-4 text-zinc-400"
          title={
            t.page > 0
              ? `${t.sourceFileName}, page ${t.page}`
              : t.sourceFileName
          }
        >
          <span className="sr-only">From file: </span>
          {t.sourceFileName}
          {t.page > 0 && ` · p.${t.page}`}
        </div>

        {t.isTransfer && (
          <div className="mt-0.5">
            <span
              className={`${badge} bg-zinc-200 text-zinc-700`}
              title={t.transferReason ?? "Excluded from totals"}
            >
              Transfer
            </span>
            {t.transferReason && (
              <span className="sr-only">: {t.transferReason}</span>
            )}
          </div>
        )}

        {review && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-4 text-amber-900">
            <span
              className={`${badge} bg-amber-200 text-amber-900`}
              title={reasons}
            >
              Check
            </span>
            <span>{reasons}</span>
            <button
              type="button"
              className={textButton}
              onClick={() => markReviewed(t.id)}
            >
              Looks right
            </button>
          </div>
        )}

        {isDuplicate && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1 gap-y-0.5">
            <span
              className={`${badge} bg-zinc-800 text-white`}
              title="The same date, amount and description came in from more than one file"
            >
              Possible duplicate
            </span>
            <button
              type="button"
              className={dangerTextButton}
              aria-label={`Delete possible duplicate ${t.description}`}
              onClick={() => onRequestDelete(t.id)}
            >
              Delete
            </button>
            <button
              type="button"
              className={textButton}
              aria-label={`Keep ${t.description}, not a duplicate`}
              onClick={() => dismissDuplicate(t.id)}
            >
              Keep
            </button>
          </div>
        )}
      </td>

      <td className="px-2 py-1">
        <CategorySelect
          id={t.id}
          description={t.description}
          categoryId={t.categoryId}
          categories={categories}
          onAddCategory={onAddCategory}
        />
      </td>

      <td className="min-w-[6rem] px-2 py-1 text-right">
        <AmountCell
          id={t.id}
          description={t.description}
          amountCents={t.amountCents}
          split={t.split}
        />
      </td>

      <td className="px-2 py-1.5 text-right whitespace-nowrap tabular-nums">
        {t.isTransfer ? (
          <span className="text-xs">excluded</span>
        ) : (
          <span className="text-zinc-500">{formatCents(runningCents)}</span>
        )}
      </td>

      <td className="py-1 pr-2 pl-1">
        <div
          role="group"
          aria-label={`Actions for ${t.description}`}
          className="flex max-w-[13rem] min-w-[9.5rem] flex-wrap gap-x-0.5 gap-y-0.5"
        >
          {isExpense && !t.isTransfer && (
            <button
              type="button"
              className={textButton}
              onClick={() => onOpenSplit(t.id)}
            >
              {isSplit ? "Edit split" : "Split"}
            </button>
          )}

          {t.isTransfer ? (
            <button
              type="button"
              className={textButton}
              onClick={() => setTransfer(t.id, false)}
            >
              Not a transfer
            </button>
          ) : (
            <button
              type="button"
              className={textButton}
              disabled={isSplit}
              title={
                isSplit
                  ? "Remove the split first (Edit split), then mark it as a transfer"
                  : "Leave this row out of the totals"
              }
              onClick={() => setTransfer(t.id, true)}
            >
              Mark as transfer
            </button>
          )}

          <button
            type="button"
            className={textButton}
            disabled={isSplit}
            title={
              isSplit
                ? "Remove the split first (Edit split), then move it"
                : undefined
            }
            onClick={() =>
              updateTransaction(t.id, {
                kind: isExpense ? "income" : "expense",
              })
            }
          >
            {isExpense ? "Move to income" : "Move to expenses"}
          </button>

          <button
            type="button"
            className={dangerTextButton}
            onClick={() => onRequestDelete(t.id)}
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
});
