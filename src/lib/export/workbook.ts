// Builds the month's .xlsx. Runs in Node (tests) and in the browser (loaded through a dynamic import on click).
// Every sum arrives as integer cents; cents become decimal numbers only as cell values, so Excel can sum them.

import ExcelJS from "exceljs";
import { buildCategoryChartData } from "../chart/chartConfig";
import { formatCents } from "../money";
import {
  OTHER_CATEGORY_ID,
  type Cents,
  type Settings,
  type Totals,
  type Transaction,
  type TransactionKind,
  type WorkingSet,
} from "../types";

export interface WorkbookInput {
  workingSet: WorkingSet;
  settings: Settings;
  /** Computed elsewhere from integer cents; written as values, not Excel formulas. */
  totals: Totals;
  /** Embedded on the Summary sheet when present. */
  chartPngDataUrl: string | null;
}

const MONEY_FORMAT = "$#,##0.00";
const DATE_FORMAT = "yyyy-mm-dd";
const PERCENT_FORMAT = "0.0%";
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
// The chart PNG is 900x480 at 2x; shown at two thirds size on the sheet.
const CHART_IMAGE_SIZE = { width: 600, height: 320 };

/** "2026-10" -> "October 2026", by string parsing so no timezone can shift the month. */
export function monthTitle(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  const name = m ? MONTH_NAMES[Number(m[2]) - 1] : undefined;
  return m && name ? `${name} ${m[1]}` : month;
}

/** The one cents-to-decimal conversion, at the spreadsheet boundary. */
function centsToNumber(cents: Cents): number {
  if (!Number.isSafeInteger(cents)) {
    throw new Error(`Not an integer cent amount: ${cents}`);
  }
  return cents / 100;
}

/** ISO YYYY-MM-DD as UTC midnight, which is what ExcelJS serialises, so the day never shifts. */
function isoToExcelDate(iso: string): Date | string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(date.getTime()) ? iso : date;
}

function rowsOfKind(workingSet: WorkingSet, kind: TransactionKind) {
  return workingSet.transactions
    .filter((t) => t.kind === kind && !t.isTransfer)
    .map((t, index) => ({ t, index }))
    .sort((a, b) => a.t.date.localeCompare(b.t.date) || a.index - b.index)
    .map(({ t }) => t);
}

function sharedWith(t: Transaction): string {
  if (!t.split) return "";
  return t.split.shares
    .filter((s) => !s.isUser)
    .map((s) => `${s.name} ${formatCents(s.amountCents)}`)
    .join(", ");
}

function addTransactionSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  rows: Transaction[],
  totalCents: Cents,
  categoryName: (id: string) => string,
  withSplitColumns: boolean,
): void {
  const sheet = workbook.addWorksheet(name, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const columns: Partial<ExcelJS.Column>[] = [
    { header: "Date", key: "date", width: 12 },
    { header: "Description", key: "description", width: 40 },
    { header: "Category", key: "category", width: 20 },
    { header: "Amount", key: "amount", width: 14 },
  ];
  if (withSplitColumns) {
    columns.push(
      { header: "Original total", key: "originalTotal", width: 16 },
      { header: "Shared with", key: "sharedWith", width: 36 },
    );
  }
  columns.push({ header: "Source file", key: "sourceFile", width: 28 });
  sheet.columns = columns;
  sheet.getRow(1).font = { bold: true };
  sheet.getColumn("date").numFmt = DATE_FORMAT;
  sheet.getColumn("amount").numFmt = MONEY_FORMAT;
  if (withSplitColumns) sheet.getColumn("originalTotal").numFmt = MONEY_FORMAT;

  for (const t of rows) {
    sheet.addRow({
      date: isoToExcelDate(t.date),
      description: t.description,
      category: categoryName(t.categoryId),
      amount: centsToNumber(t.amountCents),
      originalTotal: t.split ? centsToNumber(t.split.totalCents) : null,
      sharedWith: t.split ? sharedWith(t) : null,
      sourceFile: t.sourceFileName,
    });
  }

  const totalRow = sheet.addRow({
    description: "Total",
    amount: centsToNumber(totalCents),
  });
  totalRow.font = { bold: true };
}

function addSummarySheet(
  workbook: ExcelJS.Workbook,
  input: WorkbookInput,
): void {
  const { workingSet, settings, totals, chartPngDataUrl } = input;
  const sheet = workbook.addWorksheet("Summary");
  sheet.columns = [{ width: 28 }, { width: 16 }, { width: 14 }, { width: 14 }];

  const title = sheet.getCell("A1");
  title.value = `Budget — ${monthTitle(workingSet.month)}`;
  title.font = { bold: true, size: 14 };

  const money = (rowNumber: number, label: string, cents: Cents) => {
    sheet.getCell(rowNumber, 1).value = label;
    const cell = sheet.getCell(rowNumber, 2);
    cell.value = centsToNumber(cents);
    cell.numFmt = MONEY_FORMAT;
  };
  money(3, "Total spending", totals.expenseCents);
  money(4, "Total income", totals.incomeCents);
  money(5, "Net", totals.incomeCents - totals.expenseCents);
  sheet.getRow(5).font = { bold: true };

  sheet.getCell("A7").value = "Spending by category";
  sheet.getCell("A7").font = { bold: true, size: 12 };
  sheet.getRow(8).values = ["Category", "Amount", "% of spending"];
  sheet.getRow(8).font = { bold: true };

  // Same merge and ordering as the chart, so the table and the picture agree.
  const byCategory = buildCategoryChartData(
    totals.byCategory,
    settings.categories,
  );
  const spendingCents = byCategory.valuesCents.reduce((a, b) => a + b, 0);
  let rowNumber = 9;
  byCategory.labels.forEach((label, i) => {
    const cents = byCategory.valuesCents[i] ?? 0;
    money(rowNumber, label, cents);
    const percent = sheet.getCell(rowNumber, 3);
    // A fraction rounded to one decimal place of a percent, from integer arithmetic.
    percent.value =
      spendingCents > 0 ? Math.round((cents * 1000) / spendingCents) / 1000 : 0;
    percent.numFmt = PERCENT_FORMAT;
    rowNumber += 1;
  });

  const outstanding = workingSet.transactions
    .filter((t) => !t.isTransfer && t.split)
    .flatMap((t) =>
      (t.split?.shares ?? [])
        .filter((s) => !s.isUser && s.amountCents > 0 && !s.requested)
        .map((s) => ({ t, s })),
    );
  if (outstanding.length > 0) {
    rowNumber += 1;
    sheet.getCell(rowNumber, 1).value = "Outstanding to collect";
    sheet.getCell(rowNumber, 1).font = { bold: true, size: 12 };
    rowNumber += 1;
    sheet.getRow(rowNumber).values = ["Name", "Amount", "Date", "Description"];
    sheet.getRow(rowNumber).font = { bold: true };
    rowNumber += 1;
    for (const { t, s } of outstanding) {
      money(rowNumber, s.name, s.amountCents);
      const date = sheet.getCell(rowNumber, 3);
      date.value = isoToExcelDate(t.date);
      date.numFmt = DATE_FORMAT;
      sheet.getCell(rowNumber, 4).value = t.description;
      rowNumber += 1;
    }
  }

  if (chartPngDataUrl) {
    const imageId = workbook.addImage({
      base64: chartPngDataUrl,
      extension: "png",
    });
    // Beside the tables: column F, level with the title.
    sheet.addImage(imageId, { tl: { col: 5, row: 0 }, ext: CHART_IMAGE_SIZE });
  }
}

export async function buildWorkbookBuffer(
  input: WorkbookInput,
): Promise<ArrayBuffer> {
  const { workingSet, settings, totals } = input;
  const names = new Map(settings.categories.map((c) => [c.id, c.name]));
  const otherName = names.get(OTHER_CATEGORY_ID) ?? "Other";
  const categoryName = (id: string) => names.get(id) ?? otherName;

  const workbook = new ExcelJS.Workbook();
  addSummarySheet(workbook, input);
  addTransactionSheet(
    workbook,
    "Expenses",
    rowsOfKind(workingSet, "expense"),
    totals.expenseCents,
    categoryName,
    true,
  );
  addTransactionSheet(
    workbook,
    "Income",
    rowsOfKind(workingSet, "income"),
    totals.incomeCents,
    categoryName,
    false,
  );

  // Node returns a Buffer that may sit inside a shared pool; copy out exactly our bytes.
  const written: ArrayBuffer | Uint8Array = await workbook.xlsx.writeBuffer();
  const bytes =
    written instanceof Uint8Array ? written : new Uint8Array(written);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
