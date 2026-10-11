import { describe, expect, it } from "vitest";
import {
  OTHER_CATEGORY_ID,
  type ParsedTransaction,
  type Settings,
} from "../types";
import { DEFAULT_CATEGORIES, DEFAULT_RULES } from "./defaultRules";
import {
  buildWorkingSet,
  detectMonths,
  formatMonthLabel,
  type ParsedFile,
} from "./months";

function row(
  date: string,
  description: string,
  amountCents: number,
  kind: "expense" | "income" = "expense",
): ParsedTransaction {
  return {
    date,
    description,
    amountCents,
    kind,
    confidence: 0.9,
    flags: ["year-inferred"],
    page: 2,
    rawText: `${date} ${description}`,
  };
}

const settings: Settings = {
  categories: DEFAULT_CATEGORIES,
  rules: DEFAULT_RULES,
  dateOrder: "auto",
};

const card: ParsedFile = {
  file: { id: "card", name: "fake-card.pdf", kind: "pdf" },
  rows: [
    row("2026-10-20", "Pretend Supermarket", 5210),
    row("2026-10-03", "Moonlight Ramen House", 1875),
    row("2026-09-30", "Nowhere Parking Lot", 600),
    row("2026-10-03", "Zzz Unknown Thing", 999),
    row("2026-10-15", "PAYMENT THANK YOU", 30000, "income"),
    row("2026-10-08", "Refund Pretend Supermarket", 320, "income"),
  ],
};

const bank: ParsedFile = {
  file: { id: "bank", name: "fake-bank.png", kind: "image" },
  rows: [
    row("2026-10-14", "FAKECARD BILL 4421", 30000),
    row("2026-10-01", "Imaginary Employer Payroll", 250000, "income"),
    row("2026-11-02", "Imaginary Pharmacy", 1200),
    row("bad-date", "Garbled line", 100),
  ],
};

const septemberOnly: ParsedFile = {
  file: { id: "old", name: "fake-old.pdf", kind: "pdf" },
  rows: [row("2026-09-12", "Fictional Cinema", 1400)],
};

const files = [card, bank, septemberOnly];

describe("detectMonths", () => {
  it("lists months newest first with total and per-file counts", () => {
    expect(detectMonths(files)).toEqual([
      {
        month: "2026-11",
        count: 1,
        perFile: [{ fileId: "bank", fileName: "fake-bank.png", count: 1 }],
      },
      {
        month: "2026-10",
        count: 7,
        perFile: [
          { fileId: "card", fileName: "fake-card.pdf", count: 5 },
          { fileId: "bank", fileName: "fake-bank.png", count: 2 },
        ],
      },
      {
        month: "2026-09",
        count: 2,
        perFile: [
          { fileId: "card", fileName: "fake-card.pdf", count: 1 },
          { fileId: "old", fileName: "fake-old.pdf", count: 1 },
        ],
      },
    ]);
  });

  it("orders across years and skips malformed dates", () => {
    const months = detectMonths([
      {
        file: { id: "f", name: "f.pdf", kind: "pdf" },
        rows: [
          row("2025-12-31", "A", 1),
          row("2026-01-01", "B", 1),
          row("2026-13-01", "C", 1),
          row("", "D", 1),
        ],
      },
    ]);
    expect(months.map((m) => m.month)).toEqual(["2026-01", "2025-12"]);
  });

  it("returns nothing for no files or empty files", () => {
    expect(detectMonths([])).toEqual([]);
    expect(
      detectMonths([
        { file: { id: "e", name: "e.pdf", kind: "pdf" }, rows: [] },
      ]),
    ).toEqual([]);
  });
});

describe("buildWorkingSet", () => {
  const now = new Date("2026-10-11T08:30:00.000Z");
  const ws = buildWorkingSet(files, "2026-10", settings, now);

  it("keeps only rows from the chosen month", () => {
    expect(ws.month).toBe("2026-10");
    expect(ws.transactions).toHaveLength(7);
    expect(ws.transactions.every((t) => t.date.startsWith("2026-10-"))).toBe(
      true,
    );
  });

  it("sorts by date, then by original order", () => {
    expect(ws.transactions.map((t) => t.description)).toEqual([
      "Imaginary Employer Payroll",
      "Moonlight Ramen House",
      "Zzz Unknown Thing",
      "Refund Pretend Supermarket",
      "FAKECARD BILL 4421",
      "PAYMENT THANK YOU",
      "Pretend Supermarket",
    ]);
  });

  it("guesses categories for expenses and uses Other for income", () => {
    const byDescription = Object.fromEntries(
      ws.transactions.map((t) => [t.description, t.categoryId]),
    );
    expect(byDescription["Pretend Supermarket"]).toBe("groceries");
    expect(byDescription["Moonlight Ramen House"]).toBe("food-outside");
    expect(byDescription["Zzz Unknown Thing"]).toBe(OTHER_CATEGORY_ID);
    // Income is not categorised even when a keyword would match.
    expect(byDescription["Refund Pretend Supermarket"]).toBe(OTHER_CATEGORY_ID);
  });

  it("applies transfer tagging across all files", () => {
    const transfers = ws.transactions.filter((t) => t.isTransfer);
    expect(transfers.map((t) => t.description).sort()).toEqual([
      "FAKECARD BILL 4421",
      "PAYMENT THANK YOU",
    ]);
    expect(transfers.every((t) => t.transferReason !== null)).toBe(true);
    expect(
      ws.transactions
        .filter((t) => !t.isTransfer)
        .every((t) => t.transferReason === null),
    ).toBe(true);
  });

  it("copies the source file and parsed fields, and sets the defaults", () => {
    const ramen = ws.transactions.find(
      (t) => t.description === "Moonlight Ramen House",
    )!;
    expect(ramen).toMatchObject({
      sourceFileId: "card",
      sourceFileName: "fake-card.pdf",
      amountCents: 1875,
      kind: "expense",
      confidence: 0.9,
      flags: ["year-inferred"],
      page: 2,
      rawText: "2026-10-03 Moonlight Ramen House",
      duplicateDismissed: false,
      reviewed: false,
      split: null,
    });
    expect(ramen.flags).not.toBe(card.rows[1].flags);
  });

  it("gives every row a unique id", () => {
    const ids = ws.transactions.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^[0-9a-f-]{36}$/.test(id))).toBe(true);
  });

  it("lists only files that contributed a row", () => {
    expect(ws.sourceFiles).toEqual([
      { id: "card", name: "fake-card.pdf", kind: "pdf" },
      { id: "bank", name: "fake-bank.png", kind: "image" },
    ]);
  });

  it("stamps loadedAt from now", () => {
    expect(ws.loadedAt).toBe("2026-10-11T08:30:00.000Z");
    const defaulted = buildWorkingSet(files, "2026-10", settings);
    expect(Number.isNaN(Date.parse(defaulted.loadedAt))).toBe(false);
  });

  it("returns an empty set for a month with no rows", () => {
    const empty = buildWorkingSet(files, "2026-07", settings, now);
    expect(empty.transactions).toEqual([]);
    expect(empty.sourceFiles).toEqual([]);
  });
});

describe("formatMonthLabel", () => {
  it.each([
    ["2026-10", "October 2026"],
    ["2026-01", "January 2026"],
    ["2025-12", "December 2025"],
  ])("%s -> %s", (month, label) => {
    expect(formatMonthLabel(month)).toBe(label);
  });

  it("returns malformed input unchanged", () => {
    expect(formatMonthLabel("2026-13")).toBe("2026-13");
    expect(formatMonthLabel("October")).toBe("October");
  });
});
