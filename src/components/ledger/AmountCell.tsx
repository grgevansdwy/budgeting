"use client";

import {
  centsToDecimalString,
  formatCents,
  parseAmountToCents,
} from "@/lib/money";
import { describeSplit } from "@/lib/split/split";
import { useBudgetStore } from "@/lib/store/store";
import type { Cents, Split } from "@/lib/types";
import { InlineEdit } from "./InlineEdit";

/**
 * Click-to-edit amount, or on a split row the read-only user's share (the split dialog owns those
 * numbers). Text becomes cents only through parseAmountToCents.
 */
export function AmountCell({
  id,
  description,
  amountCents,
  split,
}: {
  id: string;
  description: string;
  amountCents: Cents;
  split: Split | null;
}) {
  const updateTransaction = useBudgetStore((s) => s.updateTransaction);

  if (split) {
    const summary = describeSplit(split);
    return (
      <div className="text-right" title={summary}>
        <span className="tabular-nums">{formatCents(amountCents)}</span>
        <span className="block text-[11px] leading-4 whitespace-nowrap text-zinc-500">
          your share of {formatCents(split.totalCents)}
        </span>
        <span className="sr-only">{summary}</span>
      </div>
    );
  }

  return (
    <InlineEdit
      value={centsToDecimalString(amountCents)}
      label={`Amount for ${description}: ${formatCents(amountCents)}`}
      align="right"
      inputMode="decimal"
      onCommit={(text) => {
        const cents = parseAmountToCents(text);
        if (cents === null) return "Enter an amount like 12.34";
        if (cents <= 0) return "Amount must be more than zero";
        if (cents !== amountCents) {
          updateTransaction(id, { amountCents: cents });
        }
        return null;
      }}
    >
      <span className="tabular-nums">{formatCents(amountCents)}</span>
    </InlineEdit>
  );
}
