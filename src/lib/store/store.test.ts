import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Split, Transaction, WorkingSet } from "../types";

const memory = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
});

const { STORAGE_KEY, defaultSettings, useBudgetStore } =
  await import("./store");

function tx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: "t1",
    sourceFileId: "f1",
    sourceFileName: "fake-card.pdf",
    page: 1,
    rawText: "10/03 EXAMPLE BISTRO 90.00",
    date: "2026-10-03",
    description: "EXAMPLE BISTRO",
    amountCents: 9000,
    kind: "expense",
    categoryId: "food-outside",
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

function workingSet(
  transactions: Transaction[],
  month = "2026-10",
): WorkingSet {
  return {
    month,
    transactions,
    sourceFiles: [{ id: "f1", name: "fake-card.pdf", kind: "pdf" }],
    loadedAt: "2026-10-11T00:00:00.000Z",
  };
}

const threeWay: Split = {
  totalCents: 9000,
  shares: [
    {
      id: "u",
      name: "You",
      isUser: true,
      amountCents: 3000,
      manual: false,
      requested: false,
    },
    {
      id: "a",
      name: "Sam",
      isUser: false,
      amountCents: 3000,
      manual: false,
      requested: false,
    },
    {
      id: "b",
      name: "Alex",
      isUser: false,
      amountCents: 3000,
      manual: false,
      requested: false,
    },
  ],
};

const row = () => useBudgetStore.getState().workingSet!.transactions[0];

beforeEach(() => {
  memory.clear();
  useBudgetStore.setState({ settings: defaultSettings(), workingSet: null });
});

describe("budget store", () => {
  it("persists and restores the working set and settings", async () => {
    useBudgetStore.getState().replaceWorkingSet(workingSet([tx()]));
    const id = useBudgetStore.getState().addCategory("Pets");
    expect(memory.has(STORAGE_KEY)).toBe(true);

    useBudgetStore.setState({ settings: defaultSettings(), workingSet: null });
    memory.set(STORAGE_KEY, memory.get(STORAGE_KEY)!); // setState above re-saved; restore below
    const saved = JSON.stringify({
      state: {
        settings: {
          ...defaultSettings(),
          categories: [{ id, name: "Pets", builtIn: false }],
        },
        workingSet: workingSet([tx()]),
      },
      version: 1,
    });
    memory.set(STORAGE_KEY, saved);
    await useBudgetStore.persist.rehydrate();
    expect(useBudgetStore.getState().workingSet?.transactions).toHaveLength(1);
    expect(useBudgetStore.getState().settings.categories).toEqual([
      { id, name: "Pets", builtIn: false },
    ]);
  });

  it("replaces the month but keeps settings", () => {
    const s = useBudgetStore.getState();
    s.replaceWorkingSet(workingSet([tx()]));
    const id = s.addCategory("Pets");
    s.replaceWorkingSet(workingSet([tx({ id: "t2" })], "2026-09"));
    const after = useBudgetStore.getState();
    expect(after.workingSet?.month).toBe("2026-09");
    expect(after.workingSet?.transactions.map((t) => t.id)).toEqual(["t2"]);
    expect(after.settings.categories.some((c) => c.id === id)).toBe(true);
  });

  it("edits and deletes rows", () => {
    const s = useBudgetStore.getState();
    s.replaceWorkingSet(workingSet([tx()]));
    s.updateTransaction("t1", {
      description: "Dinner",
      amountCents: 1234,
      categoryId: "other",
    });
    expect(row()).toMatchObject({
      description: "Dinner",
      amountCents: 1234,
      categoryId: "other",
      reviewed: true,
    });
    s.updateTransaction("t1", { amountCents: 0 });
    expect(row().amountCents).toBe(1234);
    expect(() => s.updateTransaction("t1", { amountCents: 12.5 })).toThrow();
    s.deleteTransaction("t1");
    expect(useBudgetStore.getState().workingSet?.transactions).toEqual([]);
  });

  it("applies a split, tracks requests and restores the total on un-split", () => {
    const s = useBudgetStore.getState();
    s.replaceWorkingSet(workingSet([tx()]));
    s.setSplit("t1", threeWay);
    expect(row().amountCents).toBe(3000);
    s.updateTransaction("t1", { amountCents: 1 });
    expect(row().amountCents).toBe(3000);
    s.setTransfer("t1", true);
    expect(row().isTransfer).toBe(false);
    s.markShareRequested("t1", "a");
    expect(row().split?.shares.map((sh) => sh.requested)).toEqual([
      false,
      true,
      false,
    ]);
    s.setSplit("t1", null);
    expect(row()).toMatchObject({ amountCents: 9000, split: null });
  });

  it("rejects a split that does not sum to the total", () => {
    const s = useBudgetStore.getState();
    s.replaceWorkingSet(workingSet([tx()]));
    expect(() => s.setSplit("t1", { ...threeWay, totalCents: 9001 })).toThrow();
  });

  it("tags and untags transfers and deduplicates category names", () => {
    const s = useBudgetStore.getState();
    s.replaceWorkingSet(workingSet([tx()]));
    s.setTransfer("t1", true);
    expect(row()).toMatchObject({
      isTransfer: true,
      transferReason: "Tagged by you",
    });
    s.setTransfer("t1", false);
    expect(row()).toMatchObject({ isTransfer: false, transferReason: null });
    expect(s.addCategory("groceries")).toBe("groceries");
    const before = useBudgetStore.getState().settings.categories.length;
    expect(s.addCategory("  ")).toBe("other");
    expect(useBudgetStore.getState().settings.categories.length).toBe(before);
  });
});
