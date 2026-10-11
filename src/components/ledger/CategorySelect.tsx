"use client";

import { useBudgetStore } from "@/lib/store/store";
import type { Category } from "@/lib/types";
import { focusRing } from "./styles";

const ADD_VALUE = "__add-category__";

export function CategorySelect({
  id,
  description,
  categoryId,
  categories,
  onAddCategory,
}: {
  id: string;
  description: string;
  categoryId: string;
  categories: Category[];
  /** Open the add-category dialog for this row. */
  onAddCategory: (transactionId: string) => void;
}) {
  const updateTransaction = useBudgetStore((s) => s.updateTransaction);
  const known = categories.some((c) => c.id === categoryId);

  return (
    <select
      value={categoryId}
      aria-label={`Category for ${description}`}
      onChange={(e) => {
        const next = e.target.value;
        // The select stays on the current category until the dialog adds a new one.
        if (next === ADD_VALUE) onAddCategory(id);
        else if (next !== categoryId)
          updateTransaction(id, { categoryId: next });
      }}
      className={`w-full max-w-[9.5rem] min-w-[6.5rem] rounded border border-zinc-200 bg-white px-1 py-0.5 text-sm text-inherit hover:border-zinc-300 ${focusRing}`}
    >
      {!known && <option value={categoryId}>{categoryId}</option>}
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
      <option value={ADD_VALUE}>Add category…</option>
    </select>
  );
}
