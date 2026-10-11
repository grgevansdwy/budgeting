import { describe, expect, it } from "vitest";
import type { Transaction } from "../types";
import { findDuplicateIds } from "./duplicates";

function tx(id: string, over: Partial<Transaction> = {}): Transaction {
  return {
    id,
    sourceFileId: "file-a",
    sourceFileName: "fake-a.pdf",
    page: 1,
    rawText: "",
    date: "2026-10-10",
    description: "Fake Coffee Hut",
    amountCents: 450,
    kind: "expense",
    categoryId: "other",
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

const fileB = { sourceFileId: "file-b", sourceFileName: "fake-b.png" };

describe("findDuplicateIds", () => {
  it("flags identical rows from two files", () => {
    const ids = findDuplicateIds([
      tx("a"),
      tx("b", fileB),
      tx("c", { amountCents: 900 }),
    ]);
    expect([...ids].sort()).toEqual(["a", "b"]);
  });

  it("does not flag identical rows from the same file", () => {
    expect(findDuplicateIds([tx("a"), tx("b")]).size).toBe(0);
  });

  it("flags the whole group once it spans two files", () => {
    const ids = findDuplicateIds([tx("a"), tx("b"), tx("c", fileB)]);
    expect([...ids].sort()).toEqual(["a", "b", "c"]);
  });

  it("compares descriptions on lowercase alphanumerics only", () => {
    const ids = findDuplicateIds([
      tx("a", { description: "FAKE COFFEE-HUT #12" }),
      tx("b", { ...fileB, description: "fake coffee hut 12" }),
    ]);
    expect(ids.size).toBe(2);
  });

  it.each<[string, Partial<Transaction>]>([
    ["date", { date: "2026-10-11" }],
    ["amount", { amountCents: 451 }],
    ["kind", { kind: "income" }],
    ["description", { description: "Fake Coffee Hut 2" }],
  ])("does not flag rows that differ by %s", (_label, over) => {
    expect(
      findDuplicateIds([tx("a"), tx("b", { ...fileB, ...over })]).size,
    ).toBe(0);
  });

  it("ignores dismissed rows, which also clears the remaining partner", () => {
    const ids = findDuplicateIds([
      tx("a", { duplicateDismissed: true }),
      tx("b", fileB),
    ]);
    expect(ids.size).toBe(0);
  });

  it("still flags the rest of a group when one of three is dismissed", () => {
    const ids = findDuplicateIds([
      tx("a", { duplicateDismissed: true }),
      tx("b", fileB),
      tx("c", { sourceFileId: "file-c", sourceFileName: "fake-c.pdf" }),
    ]);
    expect([...ids].sort()).toEqual(["b", "c"]);
  });

  it("clears the flag when one of two is removed", () => {
    const rows = [tx("a"), tx("b", fileB)];
    expect(findDuplicateIds(rows).size).toBe(2);
    expect(findDuplicateIds(rows.filter((r) => r.id !== "a")).size).toBe(0);
  });

  it("compares split rows on the original total, not the user's share", () => {
    const split = {
      totalCents: 450,
      shares: [
        {
          id: "s1",
          name: "Me",
          isUser: true,
          amountCents: 225,
          manual: false,
          requested: false,
        },
        {
          id: "s2",
          name: "Sam",
          isUser: false,
          amountCents: 225,
          manual: false,
          requested: false,
        },
      ],
    };
    const ids = findDuplicateIds([
      tx("a", { amountCents: 225, split }),
      tx("b", fileB),
      // Same as the user's share, but a different statement amount: not a duplicate.
      tx("c", { ...fileB, amountCents: 225 }),
    ]);
    expect([...ids].sort()).toEqual(["a", "b"]);
  });

  it("returns an empty set for no rows", () => {
    expect(findDuplicateIds([]).size).toBe(0);
  });
});
