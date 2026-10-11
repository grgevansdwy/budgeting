// Month detection and building the working set for the chosen month.

import {
  OTHER_CATEGORY_ID,
  type ParsedTransaction,
  type Settings,
  type SourceFile,
  type Transaction,
  type WorkingSet,
} from "../types";
import { guessCategory } from "./categorize";
import { tagTransfers } from "./transfers";

export interface ParsedFile {
  file: SourceFile;
  rows: ParsedTransaction[];
}

export interface MonthSummary {
  month: string; // YYYY-MM
  count: number;
  perFile: { fileId: string; fileName: string; count: number }[];
}

const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/;
const ISO_MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "YYYY-MM" for a well-formed ISO date, otherwise null. */
function monthOf(date: string): string | null {
  return ISO_DATE.test(date) ? date.slice(0, 7) : null;
}

/** Months found across all files, newest first, with a row count per contributing file. */
export function detectMonths(files: ParsedFile[]): MonthSummary[] {
  const byMonth = new Map<string, MonthSummary>();
  for (const { file, rows } of files) {
    for (const row of rows) {
      const month = monthOf(row.date);
      if (month === null) continue;
      let summary = byMonth.get(month);
      if (!summary) {
        summary = { month, count: 0, perFile: [] };
        byMonth.set(month, summary);
      }
      summary.count += 1;
      const entry = summary.perFile.find((p) => p.fileId === file.id);
      if (entry) entry.count += 1;
      else {
        summary.perFile.push({
          fileId: file.id,
          fileName: file.name,
          count: 1,
        });
      }
    }
  }
  return [...byMonth.values()].sort((a, b) =>
    a.month < b.month ? 1 : a.month > b.month ? -1 : 0,
  );
}

/**
 * The working set for one month: only rows dated in `month`, each given an id, its source file,
 * a guessed category (income defaults to Other) and transfer tags. Sorted by date, then by the
 * order the rows were given in.
 */
export function buildWorkingSet(
  files: ParsedFile[],
  month: string,
  settings: Settings,
  now: Date = new Date(),
): WorkingSet {
  const transactions: Transaction[] = [];
  const sourceFiles: SourceFile[] = [];

  for (const { file, rows } of files) {
    let contributed = false;
    for (const row of rows) {
      if (monthOf(row.date) !== month) continue;
      contributed = true;
      transactions.push({
        ...row,
        flags: [...row.flags],
        id: crypto.randomUUID(),
        sourceFileId: file.id,
        sourceFileName: file.name,
        categoryId:
          row.kind === "expense"
            ? guessCategory(row.description, settings.rules)
            : OTHER_CATEGORY_ID,
        isTransfer: false,
        transferReason: null,
        duplicateDismissed: false,
        reviewed: false,
        split: null,
      });
    }
    if (contributed) sourceFiles.push({ ...file });
  }

  // Array.prototype.sort is stable, so equal dates keep their original order.
  const sorted = tagTransfers(transactions).sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );

  return {
    month,
    transactions: sorted,
    sourceFiles,
    loadedAt: now.toISOString(),
  };
}

/** "2026-10" -> "October 2026". Built from the parts, so no timezone can shift the month. */
export function formatMonthLabel(month: string): string {
  const m = ISO_MONTH.exec(month);
  if (!m) return month;
  return `${MONTH_NAMES[Number(m[2]) - 1]} ${m[1]}`;
}
