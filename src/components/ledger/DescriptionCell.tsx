"use client";

import { useBudgetStore } from "@/lib/store/store";
import { InlineEdit } from "./InlineEdit";

/** Click-to-edit description. An empty description is not saved; the old one stays. */
export function DescriptionCell({
  id,
  description,
}: {
  id: string;
  description: string;
}) {
  const updateTransaction = useBudgetStore((s) => s.updateTransaction);

  return (
    <InlineEdit
      value={description}
      label={`Description: ${description}`}
      onCommit={(text) => {
        const trimmed = text.trim();
        if (trimmed !== "" && trimmed !== description) {
          updateTransaction(id, { description: trimmed });
        }
        return null;
      }}
    >
      <span className="block min-w-0 break-words">{description}</span>
    </InlineEdit>
  );
}
