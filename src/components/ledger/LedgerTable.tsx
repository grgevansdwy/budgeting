"use client";

import { useId, useMemo } from "react";
import { runningTotals } from "@/lib/ledger/totals";
import { formatCents } from "@/lib/money";
import type { Category, Cents, Transaction } from "@/lib/types";
import { LedgerRow } from "./LedgerRow";
import { plural } from "./rows";

export interface LedgerTableProps {
  title: string;
  /** Shown when there are no rows. */
  emptyText: string;
  /** Rows of one kind, already sorted. */
  rows: Transaction[];
  /** Table total, transfers excluded. */
  totalCents: Cents;
  categories: Category[];
  duplicateIds: ReadonlySet<string>;
  onRequestDelete: (transactionId: string) => void;
  onOpenSplit: (transactionId: string) => void;
  onAddCategory: (transactionId: string) => void;
}

const th = "px-2 py-1.5 font-medium";

export function LedgerTable({
  title,
  emptyText,
  rows,
  totalCents,
  categories,
  duplicateIds,
  onRequestDelete,
  onOpenSplit,
  onAddCategory,
}: LedgerTableProps) {
  const running = useMemo(() => runningTotals(rows), [rows]);
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="min-w-0 rounded-lg border border-zinc-200 bg-white"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
        <h2 id={headingId} className="text-base font-semibold text-zinc-900">
          {title}
          <span className="ml-2 text-xs font-normal text-zinc-500">
            {plural(rows.length, "row", "rows")}
          </span>
        </h2>
        <p className="text-base font-semibold text-zinc-900 tabular-nums">
          <span className="sr-only">Total </span>
          {formatCents(totalCents)}
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="border-t border-zinc-100 px-4 py-8 text-center text-sm text-zinc-500">
          {emptyText}
        </p>
      ) : (
        <div className="overflow-x-auto border-t border-zinc-200">
          <table className="w-full min-w-[44rem] border-collapse text-sm">
            <thead>
              <tr className="bg-zinc-50 text-left text-xs text-zinc-500">
                <th
                  scope="col"
                  className={`${th} border-l-4 border-transparent`}
                >
                  Date
                </th>
                <th scope="col" className={th}>
                  Description
                </th>
                <th scope="col" className={th}>
                  Category
                </th>
                <th scope="col" className={`${th} text-right`}>
                  Amount
                </th>
                <th scope="col" className={`${th} text-right`}>
                  Running total
                </th>
                <th scope="col" className={th}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t, i) => (
                <LedgerRow
                  key={t.id}
                  transaction={t}
                  runningCents={running[i]}
                  isDuplicate={duplicateIds.has(t.id)}
                  categories={categories}
                  onRequestDelete={onRequestDelete}
                  onOpenSplit={onOpenSplit}
                  onAddCategory={onAddCategory}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
