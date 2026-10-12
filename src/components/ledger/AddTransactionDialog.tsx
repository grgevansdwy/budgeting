"use client";

import { useId, useState } from "react";
import { guessCategory } from "@/lib/ledger/categorize";
import { parseAmountToCents } from "@/lib/money";
import { useBudgetStore } from "@/lib/store/store";
import { OTHER_CATEGORY_ID, type TransactionKind } from "@/lib/types";
import { Modal } from "./Modal";
import { focusRing, primaryButton, secondaryButton } from "./styles";

const field = `mt-1 w-full rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm ${focusRing}`;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Today when it falls in `month` (YYYY-MM), otherwise the first of the month. */
function defaultDate(month: string): string {
  const now = new Date();
  const today = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  return today.startsWith(month) ? today : `${month}-01`;
}

function lastDay(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${pad2(new Date(y, m, 0).getDate())}`;
}

/** Adds one expense or income row by hand to the loaded month. */
export function AddTransactionDialog({
  kind,
  month,
  onClose,
}: {
  kind: TransactionKind;
  month: string;
  onClose: () => void;
}) {
  const addTransaction = useBudgetStore((s) => s.addTransaction);
  const categories = useBudgetStore((s) => s.settings.categories);
  const rules = useBudgetStore((s) => s.settings.rules);

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => defaultDate(month));
  const [chosenCategory, setChosenCategory] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ids = { d: useId(), a: useId(), t: useId(), c: useId() };

  // Until the user picks one, expenses follow the same keyword rules the importer uses.
  const categoryId =
    chosenCategory ??
    (kind === "expense"
      ? guessCategory(description, rules)
      : OTHER_CATEGORY_ID);
  const label = kind === "expense" ? "expense" : "income";

  return (
    <Modal title={`Add ${label}`} onClose={onClose}>
      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const text = description.trim();
          const cents = parseAmountToCents(amount);
          if (text === "") return setError("Give it a description.");
          if (cents === null || cents <= 0)
            return setError("Enter an amount greater than zero, like 12.50.");
          if (!date.startsWith(month))
            return setError("Pick a date inside the loaded month.");
          addTransaction({
            kind,
            date,
            description: text,
            amountCents: cents,
            categoryId,
          });
          onClose();
        }}
      >
        <div>
          <label
            htmlFor={ids.d}
            className="block text-sm font-medium text-zinc-700"
          >
            Description
          </label>
          <input
            id={ids.d}
            type="text"
            value={description}
            maxLength={120}
            autoComplete="off"
            onChange={(e) => {
              setDescription(e.target.value);
              setError(null);
            }}
            className={field}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor={ids.a}
              className="block text-sm font-medium text-zinc-700"
            >
              Amount ($)
            </label>
            <input
              id={ids.a}
              type="text"
              inputMode="decimal"
              value={amount}
              autoComplete="off"
              onChange={(e) => {
                setAmount(e.target.value);
                setError(null);
              }}
              className={field}
            />
          </div>
          <div>
            <label
              htmlFor={ids.t}
              className="block text-sm font-medium text-zinc-700"
            >
              Date
            </label>
            <input
              id={ids.t}
              type="date"
              value={date}
              min={`${month}-01`}
              max={lastDay(month)}
              onChange={(e) => {
                setDate(e.target.value);
                setError(null);
              }}
              className={field}
            />
          </div>
        </div>
        {kind === "expense" && (
          <div>
            <label
              htmlFor={ids.c}
              className="block text-sm font-medium text-zinc-700"
            >
              Category
            </label>
            <select
              id={ids.c}
              value={categoryId}
              onChange={(e) => setChosenCategory(e.target.value)}
              className={field}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {error && (
          <p role="alert" className="text-xs text-red-700">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={secondaryButton} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={primaryButton}>
            Add {label}
          </button>
        </div>
      </form>
    </Modal>
  );
}
