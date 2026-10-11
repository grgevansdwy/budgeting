"use client";

import { useMemo } from "react";
import { CategoryChart } from "@/components/chart/CategoryChart";
import { ExportButton } from "@/components/export/ExportButton";
import { ImportPanel } from "@/components/import/ImportPanel";
import { Ledger } from "@/components/ledger/Ledger";
import { buildCategoryChartData } from "@/lib/chart/chartConfig";
import { computeTotals } from "@/lib/ledger/totals";
import { useBudgetStore } from "@/lib/store/store";

export function HomeContent() {
  const workingSet = useBudgetStore((s) => s.workingSet);
  const categories = useBudgetStore((s) => s.settings.categories);

  const chartData = useMemo(
    () =>
      workingSet
        ? buildCategoryChartData(
            computeTotals(workingSet.transactions).byCategory,
            categories,
          )
        : null,
    [workingSet, categories],
  );

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 p-4">
      <ImportPanel />
      {workingSet && chartData && (
        <>
          <Ledger />
          <section className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <h2 className="text-base font-semibold">Spending by category</h2>
              <ExportButton />
            </div>
            <CategoryChart data={chartData} />
          </section>
        </>
      )}
    </main>
  );
}
