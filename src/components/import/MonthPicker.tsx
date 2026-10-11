"use client";

import { formatMonthLabel, type MonthSummary } from "@/lib/ledger/months";

interface MonthPickerProps {
  /** Newest first, as returned by detectMonths. */
  months: MonthSummary[];
  selected: string | null;
  onSelect: (month: string) => void;
  onLoad: (month: string) => void;
  /** True while any file is still being read: loading is held back until the batch is complete. */
  busy: boolean;
}

function rowCount(n: number): string {
  return n === 1 ? "1 row" : `${n} rows`;
}

export function MonthPicker({
  months,
  selected,
  onSelect,
  onLoad,
  busy,
}: MonthPickerProps) {
  if (months.length === 0) {
    return (
      <p className="rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-600">
        {busy
          ? "Months will be listed here once the files have been read."
          : "No month detected. None of these files has dated transactions."}
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <fieldset>
        <legend className="text-sm font-semibold text-zinc-900">
          Pick a month
        </legend>
        <p className="mt-0.5 text-xs text-zinc-500">
          Only one month is loaded at a time. Rows from other months are left
          out.
        </p>
        <div className="mt-2 flex flex-col gap-1.5">
          {months.map((summary) => {
            const checked = summary.month === selected;
            return (
              <label
                key={summary.month}
                className={`flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 focus-within:ring-2 focus-within:ring-emerald-600 ${
                  checked
                    ? "border-emerald-600 bg-emerald-50"
                    : "border-zinc-200 hover:bg-zinc-50"
                }`}
              >
                <input
                  type="radio"
                  name="import-month"
                  value={summary.month}
                  checked={checked}
                  onChange={() => onSelect(summary.month)}
                  className="mt-0.5 h-4 w-4 accent-emerald-600 focus-visible:outline-none"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium text-zinc-900">
                      {formatMonthLabel(summary.month)}
                    </span>
                    <span className="shrink-0 text-xs text-zinc-600 tabular-nums">
                      {rowCount(summary.count)}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs break-words text-zinc-500">
                    {summary.perFile
                      .map((file) => `${file.fileName}: ${file.count}`)
                      .join(" · ")}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || selected === null}
          onClick={() => {
            if (selected !== null) onLoad(selected);
          }}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500"
        >
          {selected === null
            ? "Load month"
            : `Load ${formatMonthLabel(selected)}`}
        </button>
        {busy && (
          <p className="text-xs text-zinc-500">
            Still reading files. You can load once they are all done.
          </p>
        )}
      </div>
    </div>
  );
}
