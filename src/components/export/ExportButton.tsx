"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { buildCategoryChartData } from "@/lib/chart/chartConfig";
import { computeTotals } from "@/lib/ledger/totals";
import { formatMonthLabel } from "@/lib/ledger/months";
import { useBudgetStore } from "@/lib/store/store";
import { selectTodos } from "@/lib/todo/todos";

/** Exports the loaded month to .xlsx. Disabled until every to-do has been dealt with. */
export function ExportButton() {
  const workingSet = useBudgetStore((s) => s.workingSet);
  const settings = useBudgetStore((s) => s.settings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const todoCount = useMemo(
    () => (workingSet ? selectTodos(workingSet.transactions).length : 0),
    [workingSet],
  );

  if (!workingSet) return null;
  const blocked = todoCount > 0;
  const empty = workingSet.transactions.length === 0;

  async function handleExport() {
    if (!workingSet || blocked || busy) return;
    setBusy(true);
    setError(null);
    try {
      const totals = computeTotals(workingSet.transactions);
      const chartData = buildCategoryChartData(
        totals.byCategory,
        settings.categories,
      );
      // Loaded on demand: Chart.js and ExcelJS are large and only needed here.
      const [
        { renderChartPng },
        { buildWorkbookBuffer },
        { downloadBuffer, exportFileName },
      ] = await Promise.all([
        import("@/lib/chart/renderChartPng"),
        import("@/lib/export/workbook"),
        import("@/lib/export/download"),
      ]);
      const chartPngDataUrl = await renderChartPng(
        chartData,
        `Spending by category — ${formatMonthLabel(workingSet.month)}`,
      );
      const buffer = await buildWorkbookBuffer({
        workingSet,
        settings,
        totals,
        chartPngDataUrl,
      });
      downloadBuffer(buffer, exportFileName(workingSet.month));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleExport}
        disabled={blocked || empty || busy}
        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:bg-zinc-300"
      >
        {busy ? "Building…" : "Export to Excel"}
      </button>
      {blocked && (
        <p className="text-xs text-zinc-600">
          Finish your{" "}
          <Link href="/todo" className="font-medium text-emerald-700 underline">
            to-do list
          </Link>{" "}
          first ({todoCount} left to collect).
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
