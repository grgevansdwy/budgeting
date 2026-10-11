import { describe, expect, it } from "vitest";
import type { Transaction } from "../types";
import { computeTotals, runningTotals } from "./totals";

let seq = 0;
function tx(over: Partial<Transaction> = {}): Transaction {
  seq += 1;
  return {
    id: `t${seq}`,
    sourceFileId: "file-a",
    sourceFileName: "fake-a.pdf",
    page: 1,
    rawText: "",
    date: "2026-10-10",
    description: "Fake Merchant",
    amountCents: 1000,
    kind: "expense",
    categoryId: "groceries",
    isTransfer: false,
    transferReason: null,
    duplicateDismissed: false,
    confidence: 1,
    flags: [],
    reviewed: false,
    split: null,
    ...over,
  };
}

const splitThreeWays = {
  totalCents: 10000,
  shares: [
    {
      id: "s1",
      name: "Me",
      isUser: true,
      amountCents: 3334,
      manual: false,
      requested: false,
    },
    {
      id: "s2",
      name: "Sam",
      isUser: false,
      amountCents: 3333,
      manual: false,
      requested: false,
    },
    {
      id: "s3",
      name: "Alex",
      isUser: false,
      amountCents: 3333,
      manual: false,
      requested: false,
    },
  ],
};

describe("computeTotals", () => {
  it("sums expenses, income and expenses per category", () => {
    const totals = computeTotals([
      tx({ amountCents: 1010, categoryId: "groceries" }),
      tx({ amountCents: 2020, categoryId: "groceries" }),
      tx({ amountCents: 999, categoryId: "transport" }),
      tx({ amountCents: 250000, kind: "income", categoryId: "other" }),
      tx({ amountCents: 320, kind: "income", categoryId: "groceries" }),
    ]);
    expect(totals).toEqual({
      expenseCents: 4029,
      incomeCents: 250320,
      byCategory: { groceries: 3030, transport: 999 },
    });
  });

  it("excludes transfers from every total", () => {
    const totals = computeTotals([
      tx({ amountCents: 500, categoryId: "transport" }),
      tx({ amountCents: 30000, categoryId: "rent", isTransfer: true }),
      tx({ amountCents: 30000, kind: "income", isTransfer: true }),
      tx({ amountCents: 700, kind: "income" }),
    ]);
    expect(totals).toEqual({
      expenseCents: 500,
      incomeCents: 700,
      byCategory: { transport: 500 },
    });
  });

  it("counts only the user's share of a split row", () => {
    const totals = computeTotals([
      tx({
        amountCents: 3334,
        categoryId: "food-outside",
        split: splitThreeWays,
      }),
      tx({ amountCents: 100, categoryId: "food-outside" }),
    ]);
    expect(totals.expenseCents).toBe(3434);
    expect(totals.byCategory).toEqual({ "food-outside": 3434 });
  });

  it("omits categories that sum to zero or have only income or transfers", () => {
    const totals = computeTotals([
      tx({ amountCents: 0, categoryId: "health" }),
      tx({ amountCents: 900, kind: "income", categoryId: "shopping" }),
      tx({ amountCents: 900, categoryId: "rent", isTransfer: true }),
    ]);
    expect(totals.byCategory).toEqual({});
    expect(Object.keys(totals.byCategory)).toEqual([]);
  });

  it("returns zeros for no rows", () => {
    expect(computeTotals([])).toEqual({
      expenseCents: 0,
      incomeCents: 0,
      byCategory: {},
    });
  });

  it("stays exact where floats would drift", () => {
    // 0.10 + 0.20 as cents, then many odd amounts.
    expect(
      computeTotals([tx({ amountCents: 10 }), tx({ amountCents: 20 })])
        .expenseCents,
    ).toBe(30);

    const rows = Array.from({ length: 1000 }, (_, i) =>
      tx({
        amountCents: 1999 + i,
        kind: i % 4 === 0 ? "income" : "expense",
        categoryId: `c${i % 3}`,
      }),
    );
    const totals = computeTotals(rows);
    expect(Number.isSafeInteger(totals.expenseCents)).toBe(true);
    expect(Number.isSafeInteger(totals.incomeCents)).toBe(true);
    for (const cents of Object.values(totals.byCategory)) {
      expect(Number.isSafeInteger(cents)).toBe(true);
    }
    // sum of (1999 + i) for i in 0..999 = 1999000 + 499500
    expect(totals.expenseCents + totals.incomeCents).toBe(2498500);
    expect(Object.values(totals.byCategory).reduce((a, b) => a + b, 0)).toBe(
      totals.expenseCents,
    );
  });

  it("rejects a non-integer amount instead of producing a float total", () => {
    expect(() => computeTotals([tx({ amountCents: 10.5 })])).toThrow();
    expect(() => runningTotals([tx({ amountCents: 0.1 })])).toThrow();
  });
});

describe("runningTotals", () => {
  it("accumulates in the given order", () => {
    expect(
      runningTotals([
        tx({ amountCents: 100 }),
        tx({ amountCents: 250 }),
        tx({ amountCents: 1 }),
      ]),
    ).toEqual([100, 350, 351]);
  });

  it("adds nothing for a transfer row but still returns an entry for it", () => {
    expect(
      runningTotals([
        tx({ amountCents: 100, isTransfer: true }),
        tx({ amountCents: 250 }),
        tx({ amountCents: 9999, isTransfer: true }),
        tx({ amountCents: 50 }),
      ]),
    ).toEqual([0, 250, 250, 300]);
  });

  it("uses the user's share for split rows", () => {
    expect(
      runningTotals([
        tx({ amountCents: 3334, split: splitThreeWays }),
        tx({ amountCents: 1 }),
      ]),
    ).toEqual([3334, 3335]);
  });

  it("ends on the same figure as computeTotals and stays in safe integers", () => {
    const rows = Array.from({ length: 200 }, (_, i) =>
      tx({ amountCents: 333 + i * 7, isTransfer: i % 9 === 0 }),
    );
    const running = runningTotals(rows);
    expect(running).toHaveLength(rows.length);
    expect(running.every((c) => Number.isSafeInteger(c))).toBe(true);
    expect(running[running.length - 1]).toBe(computeTotals(rows).expenseCents);
  });

  it("returns an empty list for no rows", () => {
    expect(runningTotals([])).toEqual([]);
  });
});
