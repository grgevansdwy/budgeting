"use client";

import type { DateOrder, ParsedTransaction } from "@/lib/types";
import type { ImportItem } from "./useImport";

interface FileResultListProps {
  items: ImportItem[];
  onRemove: (key: string) => void;
  onFlipKinds: (key: string, flipKinds: boolean) => void;
  onDateOrder: (key: string, dateOrder: DateOrder) => void;
}

const DATE_ORDER_LABELS: Record<DateOrder, string> = {
  auto: "Auto",
  MDY: "Month first",
  DMY: "Day first",
};

const ACCOUNT_LABELS = {
  card: "Card statement",
  bank: "Bank statement",
  unknown: "Account type not detected",
} as const;

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "2026-10-03" -> "Oct 3, 2026". Built from the parts, so no timezone can shift the day. */
function formatDay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const month = SHORT_MONTHS[Number(m[2]) - 1];
  if (!month) return iso;
  return `${month} ${Number(m[3])}, ${m[1]}`;
}

function dateRange(rows: ParsedTransaction[]): string | null {
  let min: string | null = null;
  let max: string | null = null;
  for (const row of rows) {
    if (min === null || row.date < min) min = row.date;
    if (max === null || row.date > max) max = row.date;
  }
  if (min === null || max === null) return null;
  return min === max
    ? formatDay(min)
    : `${formatDay(min)} to ${formatDay(max)}`;
}

function rowCount(n: number): string {
  return n === 1 ? "1 row" : `${n} rows`;
}

function FileRow({
  item,
  onRemove,
  onFlipKinds,
  onDateOrder,
}: {
  item: ImportItem;
  onRemove: (key: string) => void;
  onFlipKinds: (key: string, flipKinds: boolean) => void;
  onDateOrder: (key: string, dateOrder: DateOrder) => void;
}) {
  const percent = Math.round(item.progress * 100);
  const rows = item.result?.rows ?? [];
  const range = dateRange(rows);
  const detected = item.result?.detectedDateOrder ?? null;

  return (
    <li className="px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="shrink-0 rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600">
          {item.kind === "pdf" ? "PDF" : "Image"}
        </span>
        <span
          className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-900"
          title={item.name}
        >
          {item.name}
        </span>
        <button
          type="button"
          onClick={() => onRemove(item.key)}
          aria-label={`Remove ${item.name}`}
          className="shrink-0 rounded px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:outline-none"
        >
          Remove
        </button>
      </div>

      {item.status === "queued" && (
        <p className="mt-1 text-xs text-zinc-500">Waiting for its turn</p>
      )}

      {item.status === "reading" && (
        <div className="mt-1.5">
          <div
            role="progressbar"
            aria-label={`Reading ${item.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="h-1.5 overflow-hidden rounded-full bg-zinc-200"
          >
            <div
              className="h-full rounded-full bg-emerald-600 transition-[width]"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {item.stage} · {percent}%
          </p>
        </div>
      )}

      {item.status === "error" && (
        <p role="alert" className="mt-1 text-xs text-red-700">
          {item.error}
        </p>
      )}

      {item.status === "done" && (
        <>
          {item.result && (
            <p className="mt-1 text-xs text-zinc-600">
              {ACCOUNT_LABELS[item.result.accountType]} ·{" "}
              {rowCount(rows.length)}
              {range && ` · ${range}`}
            </p>
          )}
          {item.error && (
            <p role="alert" className="mt-1 text-xs text-red-700">
              {item.error}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-700">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={item.flipKinds}
                onChange={(event) =>
                  onFlipKinds(item.key, event.target.checked)
                }
                className="h-3.5 w-3.5 rounded border-zinc-300 accent-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1 focus-visible:outline-none"
              />
              Flip income/expenses
            </label>
            <label className="flex items-center gap-1.5">
              Date order
              <select
                value={item.dateOrder}
                onChange={(event) =>
                  onDateOrder(item.key, event.target.value as DateOrder)
                }
                className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs text-zinc-800 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:outline-none"
              >
                {(["auto", "MDY", "DMY"] as const).map((order) => (
                  <option key={order} value={order}>
                    {DATE_ORDER_LABELS[order]}
                  </option>
                ))}
              </select>
            </label>
            {detected && (
              <span className="text-zinc-500">
                detected: {DATE_ORDER_LABELS[detected].toLowerCase()}
              </span>
            )}
          </div>
        </>
      )}
    </li>
  );
}

export function FileResultList({
  items,
  onRemove,
  onFlipKinds,
  onDateOrder,
}: FileResultListProps) {
  if (items.length === 0) return null;
  return (
    <ul
      aria-label="Files in this import"
      className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white"
    >
      {items.map((item) => (
        <FileRow
          key={item.key}
          item={item}
          onRemove={onRemove}
          onFlipKinds={onFlipKinds}
          onDateOrder={onDateOrder}
        />
      ))}
    </ul>
  );
}
