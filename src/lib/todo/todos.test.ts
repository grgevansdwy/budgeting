import { describe, expect, it } from "vitest";
import { createEqualSplit, setShareAmount } from "../split/split";
import type { Split, Transaction } from "../types";
import { formatTodo, selectTodos } from "./todos";

function split(totalCents: number, ...names: string[]): Split {
  const result = createEqualSplit(totalCents, names);
  if (!result.ok) throw new Error(result.error);
  return result.split;
}

let nextId = 1;

function tx(overrides: Partial<Transaction>): Transaction {
  const s = overrides.split ?? null;
  return {
    id: `t${nextId++}`,
    date: "2026-03-10",
    description: "Dinner at Example Bistro",
    amountCents: s ? s.shares[0].amountCents : 1000,
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
    split: s,
    ...overrides,
  };
}

describe("selectTodos", () => {
  it("returns one item per other person's share", () => {
    const s = split(10000, "Sam", "Alex");
    const row = tx({ split: s });
    expect(selectTodos([row])).toEqual([
      {
        transactionId: row.id,
        shareId: s.shares[1].id,
        name: "Sam",
        amountCents: 3333,
        description: "Dinner at Example Bistro",
      },
      {
        transactionId: row.id,
        shareId: s.shares[2].id,
        name: "Alex",
        amountCents: 3333,
        description: "Dinner at Example Bistro",
      },
    ]);
  });

  it("returns nothing for no rows or unsplit rows", () => {
    expect(selectTodos([])).toEqual([]);
    expect(selectTodos([tx({}), tx({ kind: "income" })])).toEqual([]);
  });

  it("orders by transaction date, then share order, keeping row order on ties", () => {
    const late = tx({
      date: "2026-03-20",
      description: "Made-up Cinema",
      split: split(3000, "Robin", "Sam"),
    });
    const early = tx({
      date: "2026-03-02",
      description: "Sample Groceries",
      split: split(4000, "Alex"),
    });
    const sameDayA = tx({
      date: "2026-03-10",
      description: "Example Taxi",
      split: split(2000, "Sam"),
    });
    const sameDayB = tx({
      date: "2026-03-10",
      description: "Example Cafe",
      split: split(900, "Jo", "Alex"),
    });
    const todos = selectTodos([late, early, sameDayA, sameDayB]);
    expect(todos.map((t) => `${t.description}/${t.name}`)).toEqual([
      "Sample Groceries/Alex",
      "Example Taxi/Sam",
      "Example Cafe/Jo",
      "Example Cafe/Alex",
      "Made-up Cinema/Robin",
      "Made-up Cinema/Sam",
    ]);
  });

  it("skips zero shares", () => {
    const penny = split(1, "Sam"); // 1 / 0
    expect(selectTodos([tx({ split: penny })])).toEqual([]);

    const s = split(10000, "Sam", "Alex");
    const edited = setShareAmount(s, s.shares[1].id, 0);
    if (!edited.ok) throw new Error(edited.error);
    const todos = selectTodos([tx({ split: edited.split })]);
    expect(todos.map((t) => [t.name, t.amountCents])).toEqual([["Alex", 5000]]);
  });

  it("skips requested shares and never lists the user", () => {
    const s = split(10000, "Sam", "Alex");
    const requested: Split = {
      ...s,
      shares: s.shares.map((sh, i) =>
        i === 1 ? { ...sh, requested: true } : sh,
      ),
    };
    const todos = selectTodos([tx({ split: requested })]);
    expect(todos.map((t) => t.name)).toEqual(["Alex"]);
  });

  it("brings a requested to-do back when its amount changes", () => {
    const s = split(10000, "Sam");
    const requested: Split = {
      ...s,
      shares: s.shares.map((sh) =>
        sh.isUser ? sh : { ...sh, requested: true },
      ),
    };
    expect(selectTodos([tx({ split: requested })])).toEqual([]);
    const edited = setShareAmount(requested, s.shares[1].id, 1250);
    if (!edited.ok) throw new Error(edited.error);
    const todos = selectTodos([tx({ split: edited.split })]);
    expect(todos.map((t) => [t.name, t.amountCents])).toEqual([["Sam", 1250]]);
  });

  it("ignores transfer and income rows even if they carry a split", () => {
    const s = split(10000, "Sam");
    expect(
      selectTodos([
        tx({ split: s, isTransfer: true, transferReason: "card payment" }),
        tx({ split: s, kind: "income" }),
      ]),
    ).toEqual([]);
  });

  it("does not mutate or reorder the input", () => {
    const rows = [
      tx({ date: "2026-03-20", split: split(3000, "Sam") }),
      tx({ date: "2026-03-01", split: split(3000, "Alex") }),
    ];
    const before = structuredClone(rows);
    selectTodos(rows);
    expect(rows).toEqual(before);
  });
});

describe("formatTodo", () => {
  it("formats the collect line", () => {
    expect(
      formatTodo({
        transactionId: "t1",
        shareId: "s1",
        name: "Sam",
        amountCents: 1250,
        description: "Dinner at Example Bistro",
      }),
    ).toBe("Collect $12.50 from Sam — Dinner at Example Bistro");
  });

  it("formats large amounts with separators", () => {
    expect(
      formatTodo({
        transactionId: "t1",
        shareId: "s1",
        name: "Alex",
        amountCents: 123456,
        description: "Example Rent",
      }),
    ).toBe("Collect $1,234.56 from Alex — Example Rent");
  });
});
