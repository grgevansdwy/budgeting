"use client";

import { useMemo, useState } from "react";
import { buildWorkingSet, formatMonthLabel } from "@/lib/ledger/months";
import { useBudgetStore } from "@/lib/store/store";
import { selectTodos } from "@/lib/todo/todos";
import { ConfirmDialog } from "./ConfirmDialog";
import { FileResultList } from "./FileResultList";
import { MonthPicker } from "./MonthPicker";
import { UploadDropzone } from "./UploadDropzone";
import { useImport } from "./useImport";

type PendingConfirm =
  { type: "replace"; month: string } | { type: "start-over" } | null;

const STEPS = [
  {
    title: "Upload statements",
    body: "PDFs or screenshots from your card and bank.",
  },
  { title: "Pick a month", body: "One month is loaded at a time." },
  {
    title: "Review and export",
    body: "Check the rows, split shared costs, then export to Excel.",
  },
];

const SECONDARY_BUTTON =
  "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 focus-visible:outline-none";

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Upload statements, pick one month, and load it as the working set. Takes no props. */
export function ImportPanel() {
  const workingSet = useBudgetStore((s) => s.workingSet);
  const settings = useBudgetStore((s) => s.settings);
  const replaceWorkingSet = useBudgetStore((s) => s.replaceWorkingSet);
  const clearWorkingSet = useBudgetStore((s) => s.clearWorkingSet);

  const batch = useImport();
  const [expanded, setExpanded] = useState(false);
  const [chosenMonth, setChosenMonth] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingConfirm>(null);

  const outstandingTodos = useMemo(
    () => (workingSet ? selectTodos(workingSet.transactions).length : 0),
    [workingSet],
  );

  // The newest month is preselected until the user picks one that is still on offer.
  const selectedMonth =
    chosenMonth !== null && batch.months.some((m) => m.month === chosenMonth)
      ? chosenMonth
      : (batch.months[0]?.month ?? null);

  const currentSummary = workingSet
    ? `${formatMonthLabel(workingSet.month)} (${plural(
        workingSet.transactions.length,
        "row",
        "rows",
      )}, ${plural(outstandingTodos, "outstanding to-do", "outstanding to-dos")})`
    : "";

  function loadMonth(month: string) {
    if (batch.busy) return;
    replaceWorkingSet(buildWorkingSet(batch.parsedFiles, month, settings));
    // Raw lines and the other months are not kept once a month is loaded.
    batch.reset();
    setChosenMonth(null);
    setPending(null);
    setExpanded(false);
  }

  function requestLoad(month: string) {
    if (batch.busy) return;
    if (workingSet && workingSet.transactions.length > 0) {
      setPending({ type: "replace", month });
    } else {
      loadMonth(month);
    }
  }

  function startOver() {
    batch.reset();
    clearWorkingSet();
    setChosenMonth(null);
    setPending(null);
    setExpanded(false);
  }

  const showFlow = workingSet === null || expanded;
  const hasItems = batch.items.length > 0;

  return (
    <section
      aria-label="Import statements"
      className="rounded-xl border border-zinc-200 bg-white p-4 text-zinc-900"
    >
      {workingSet !== null && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            <span className="font-semibold">
              {formatMonthLabel(workingSet.month)}
            </span>
            <span className="text-zinc-600">
              {" · "}
              {plural(workingSet.transactions.length, "row", "rows")} from{" "}
              {plural(workingSet.sourceFiles.length, "file", "files")}
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((open) => !open)}
              className={SECONDARY_BUTTON}
            >
              {expanded ? "Hide import" : "Import other statements"}
            </button>
            <button
              type="button"
              onClick={() => setPending({ type: "start-over" })}
              className={SECONDARY_BUTTON}
            >
              Start over
            </button>
          </div>
        </div>
      )}

      {showFlow && (
        <div
          className={`flex flex-col gap-3 ${workingSet !== null ? "mt-4" : ""}`}
        >
          {workingSet === null && (
            <div>
              <h2 className="text-base font-semibold">
                Import your statements
              </h2>
              <ol className="mt-2 grid gap-2 sm:grid-cols-3">
                {STEPS.map((step, index) => (
                  <li key={step.title} className="flex gap-2 text-sm">
                    <span
                      aria-hidden="true"
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white"
                    >
                      {index + 1}
                    </span>
                    <span>
                      <span className="font-medium">{step.title}</span>
                      <span className="block text-xs text-zinc-500">
                        {step.body}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <UploadDropzone
            onFiles={batch.addFiles}
            compact={hasItems || workingSet !== null}
          />

          {batch.skippedDuplicates.length > 0 && (
            <p role="status" className="text-xs text-zinc-600">
              Already in this import, so not added again:{" "}
              {batch.skippedDuplicates.join(", ")}
            </p>
          )}

          <FileResultList
            items={batch.items}
            onRemove={batch.removeFile}
            onFlipKinds={batch.setFlipKinds}
            onDateOrder={batch.setDateOrder}
          />

          {hasItems && (
            <MonthPicker
              months={batch.months}
              selected={selectedMonth}
              onSelect={setChosenMonth}
              onLoad={requestLoad}
              busy={batch.busy}
            />
          )}
        </div>
      )}

      {pending?.type === "replace" && (
        <ConfirmDialog
          title={`Load ${formatMonthLabel(pending.month)}?`}
          message={`This replaces ${currentSummary}.`}
          confirmLabel={`Replace with ${formatMonthLabel(pending.month)}`}
          onConfirm={() => loadMonth(pending.month)}
          onCancel={() => setPending(null)}
        />
      )}
      {pending?.type === "start-over" && (
        <ConfirmDialog
          title="Start over?"
          message={`This clears ${currentSummary}. Your categories and settings are kept.`}
          confirmLabel="Start over"
          destructive
          onConfirm={startOver}
          onCancel={() => setPending(null)}
        />
      )}
    </section>
  );
}
