import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { Settings, Totals, Transaction, WorkingSet } from "../types";
import { exportFileName } from "./download";
import { buildWorkbookBuffer, monthTitle } from "./workbook";

// A 1x1 transparent PNG.
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

// All merchants, people and amounts below are made up.
function tx(over: Partial<Transaction> & { id: string }): Transaction {
  return {
    date: "2026-10-01",
    description: "Placeholder",
    amountCents: 0,
    kind: "expense",
    confidence: 1,
    flags: [],
    page: 1,
    rawText: "",
    sourceFileId: "f1",
    sourceFileName: "made-up-statement.pdf",
    categoryId: "other",
    isTransfer: false,
    transferReason: null,
    duplicateDismissed: false,
    reviewed: true,
    split: null,
    ...over,
  };
}

const settings: Settings = {
  categories: [
    { id: "groceries", name: "Groceries", builtIn: true },
    { id: "dining", name: "Dining", builtIn: true },
    { id: "income", name: "Salary", builtIn: true },
    { id: "other", name: "Other", builtIn: true },
  ],
  rules: [],
  dateOrder: "MDY",
};

function share(
  id: string,
  name: string,
  amountCents: number,
  requested: boolean,
  isUser = false,
) {
  return { id, name, isUser, amountCents, manual: false, requested };
}

function makeWorkingSet(requested: boolean): WorkingSet {
  return {
    month: "2026-10",
    loadedAt: "2026-10-31T12:00:00.000Z",
    sourceFiles: [{ id: "f1", name: "made-up-statement.pdf", kind: "pdf" }],
    transactions: [
      tx({
        id: "t3",
        date: "2026-10-31",
        description: "Fernleaf Bistro",
        amountCents: 3334,
        categoryId: "dining",
        split: {
          totalCents: 10000,
          shares: [
            share("s0", "Me", 3334, false, true),
            share("s1", "Sam", 3333, requested),
            share("s2", "Alex", 3333, requested),
          ],
        },
      }),
      tx({
        id: "t1",
        date: "2026-10-01",
        description: "Pinecone Market",
        amountCents: 8219,
        categoryId: "groceries",
      }),
      tx({
        id: "t2",
        date: "2026-10-15",
        description: "Quillfeather Books",
        amountCents: 1999,
        categoryId: "deleted-category",
      }),
      tx({
        id: "t4",
        date: "2026-10-20",
        description: "Card payment thank you",
        amountCents: 50000,
        isTransfer: true,
        transferReason: "card payment",
      }),
      tx({
        id: "t5",
        date: "2026-10-28",
        description: "Northwind Payroll",
        amountCents: 250010,
        kind: "income",
        categoryId: "income",
      }),
      tx({
        id: "t6",
        date: "2026-10-21",
        description: "Transfer from savings",
        amountCents: 70000,
        kind: "income",
        isTransfer: true,
      }),
    ],
  };
}

const totals: Totals = {
  expenseCents: 13552,
  incomeCents: 250010,
  byCategory: { groceries: 8219, dining: 3334, "deleted-category": 1999 },
};

async function roundTrip(
  chartPngDataUrl: string | null,
  requested = true,
): Promise<ExcelJS.Workbook> {
  const buffer = await buildWorkbookBuffer({
    workingSet: makeWorkingSet(requested),
    settings,
    totals,
    chartPngDataUrl,
  });
  expect(buffer).toBeInstanceOf(ArrayBuffer);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}

function sheetOf(workbook: ExcelJS.Workbook, name: string): ExcelJS.Worksheet {
  const sheet = workbook.getWorksheet(name);
  if (!sheet) throw new Error(`Missing sheet ${name}`);
  return sheet;
}

function columnText(sheet: ExcelJS.Worksheet, column: number): string[] {
  const out: string[] = [];
  sheet.eachRow((row) => out.push(String(row.getCell(column).value ?? "")));
  return out;
}

function imageCount(workbook: ExcelJS.Workbook): number {
  return workbook.worksheets.reduce((n, s) => n + s.getImages().length, 0);
}

describe("buildWorkbookBuffer", () => {
  it("writes the three sheets in order", async () => {
    const workbook = await roundTrip(TINY_PNG);
    expect(workbook.worksheets.map((s) => s.name)).toEqual([
      "Summary",
      "Expenses",
      "Income",
    ]);
  });

  it("writes the Expenses sheet sorted by date, without transfers, with a total", async () => {
    const sheet = sheetOf(await roundTrip(TINY_PNG), "Expenses");
    expect(sheet.getRow(1).values).toEqual([
      undefined, // ExcelJS row values are 1-based
      "Date",
      "Description",
      "Category",
      "Amount",
      "Original total",
      "Shared with",
      "Source file",
    ]);
    expect(sheet.getRow(1).font?.bold).toBe(true);
    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });

    expect(columnText(sheet, 2)).toEqual([
      "Description",
      "Pinecone Market",
      "Quillfeather Books",
      "Fernleaf Bistro",
      "Total",
    ]);

    const first = sheet.getRow(2);
    expect(first.getCell(1).value).toEqual(new Date(Date.UTC(2026, 9, 1)));
    expect(first.getCell(1).numFmt).toBe("yyyy-mm-dd");
    expect(first.getCell(3).value).toBe("Groceries");
    expect(first.getCell(4).value).toBe(82.19);
    expect(first.getCell(4).numFmt).toBe("$#,##0.00");
    expect(first.getCell(5).value).toBeNull();
    expect(first.getCell(6).value).toBeNull();
    expect(first.getCell(7).value).toBe("made-up-statement.pdf");

    // Unknown category ids fall back to Other.
    expect(sheet.getRow(3).getCell(3).value).toBe("Other");

    // The last day of the month must not roll into November.
    const split = sheet.getRow(4);
    expect(split.getCell(1).value).toEqual(new Date(Date.UTC(2026, 9, 31)));
    expect(split.getCell(4).value).toBe(33.34);
    expect(split.getCell(5).value).toBe(100);
    expect(split.getCell(5).numFmt).toBe("$#,##0.00");
    expect(split.getCell(6).value).toBe("Sam $33.33, Alex $33.33");

    const total = sheet.getRow(5);
    expect(total.getCell(4).value).toBe(totals.expenseCents / 100);
    expect(total.getCell(4).type).toBe(ExcelJS.ValueType.Number);
    expect(total.getCell(4).font?.bold).toBe(true);
    expect(sheet.rowCount).toBe(5);
  });

  it("writes the Income sheet without transfers, with a total", async () => {
    const sheet = sheetOf(await roundTrip(TINY_PNG), "Income");
    expect(sheet.getRow(1).values).toEqual([
      undefined,
      "Date",
      "Description",
      "Category",
      "Amount",
      "Source file",
    ]);
    expect(sheet.getRow(1).font?.bold).toBe(true);
    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(columnText(sheet, 2)).toEqual([
      "Description",
      "Northwind Payroll",
      "Total",
    ]);
    const row = sheet.getRow(2);
    expect(row.getCell(1).value).toEqual(new Date(Date.UTC(2026, 9, 28)));
    expect(row.getCell(3).value).toBe("Salary");
    expect(row.getCell(4).value).toBe(2500.1);
    expect(row.getCell(5).value).toBe("made-up-statement.pdf");
    const total = sheet.getRow(3);
    expect(total.getCell(4).value).toBe(totals.incomeCents / 100);
    expect(total.getCell(4).font?.bold).toBe(true);
  });

  it("writes the Summary sheet as values", async () => {
    const sheet = sheetOf(await roundTrip(TINY_PNG), "Summary");
    expect(sheet.getCell("A1").value).toBe("Budget — October 2026");
    expect(sheet.getCell("A3").value).toBe("Total spending");
    expect(sheet.getCell("B3").value).toBe(135.52);
    expect(sheet.getCell("A4").value).toBe("Total income");
    expect(sheet.getCell("B4").value).toBe(2500.1);
    expect(sheet.getCell("A5").value).toBe("Net");
    expect(sheet.getCell("B5").value).toBe(2364.58);
    expect(sheet.getCell("B5").type).toBe(ExcelJS.ValueType.Number);

    expect(sheet.getCell("A7").value).toBe("Spending by category");
    expect(sheet.getRow(8).values).toEqual([
      undefined,
      "Category",
      "Amount",
      "% of spending",
    ]);
    const table = [9, 10, 11].map((r) => [
      sheet.getCell(r, 1).value,
      sheet.getCell(r, 2).value,
      sheet.getCell(r, 3).value,
    ]);
    expect(table).toEqual([
      ["Groceries", 82.19, 0.606],
      ["Dining", 33.34, 0.246],
      ["Other", 19.99, 0.148],
    ]);
    expect(sheet.getCell("C9").numFmt).toBe("0.0%");
    expect(sheet.getCell("B9").numFmt).toBe("$#,##0.00");
    // Everything was requested, so there is no outstanding block.
    expect(columnText(sheet, 1)).not.toContain("Outstanding to collect");
  });

  it("embeds exactly one image, on the Summary sheet", async () => {
    const workbook = await roundTrip(TINY_PNG);
    expect(imageCount(workbook)).toBe(1);
    expect(sheetOf(workbook, "Summary").getImages()).toHaveLength(1);
    expect(workbook.model.media).toHaveLength(1);
  });

  it("works without a chart image", async () => {
    const workbook = await roundTrip(null);
    expect(imageCount(workbook)).toBe(0);
    expect(workbook.worksheets.map((s) => s.name)).toEqual([
      "Summary",
      "Expenses",
      "Income",
    ]);
    expect(sheetOf(workbook, "Summary").getCell("B3").value).toBe(135.52);
  });

  it("lists split shares that were not requested yet", async () => {
    const sheet = sheetOf(await roundTrip(null, false), "Summary");
    expect(sheet.getCell("A13").value).toBe("Outstanding to collect");
    expect(sheet.getRow(14).values).toEqual([
      undefined,
      "Name",
      "Amount",
      "Date",
      "Description",
    ]);
    expect(sheet.getCell("A15").value).toBe("Sam");
    expect(sheet.getCell("B15").value).toBe(33.33);
    expect(sheet.getCell("C15").value).toEqual(new Date(Date.UTC(2026, 9, 31)));
    expect(sheet.getCell("D15").value).toBe("Fernleaf Bistro");
    expect(sheet.getCell("A16").value).toBe("Alex");
    expect(sheet.getCell("A17").value).toBeNull();
  });

  it("handles an empty month", async () => {
    const buffer = await buildWorkbookBuffer({
      workingSet: { ...makeWorkingSet(true), transactions: [] },
      settings,
      totals: { expenseCents: 0, incomeCents: 0, byCategory: {} },
      chartPngDataUrl: null,
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const expenses = sheetOf(workbook, "Expenses");
    expect(columnText(expenses, 2)).toEqual(["Description", "Total"]);
    expect(expenses.getRow(2).getCell(4).value).toBe(0);
  });
});

describe("names", () => {
  it("builds the month title without Date", () => {
    expect(monthTitle("2026-10")).toBe("October 2026");
    expect(monthTitle("2026-01")).toBe("January 2026");
    expect(monthTitle("2026-12")).toBe("December 2026");
    expect(monthTitle("nonsense")).toBe("nonsense");
  });

  it("builds the export file name", () => {
    expect(exportFileName("2026-10")).toBe("budget-2026-10.xlsx");
  });
});
