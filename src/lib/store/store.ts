import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEFAULT_CATEGORIES, DEFAULT_RULES } from "../ledger/defaultRules";
import { assertCents } from "../money";
import type {
  Cents,
  DateOrder,
  Settings,
  Split,
  Transaction,
  TransactionKind,
  WorkingSet,
} from "../types";
import { createSafeStorage } from "./storage";

export const STORAGE_KEY = "budget.v1";

export interface TransactionPatch {
  description?: string;
  amountCents?: Cents;
  categoryId?: string;
  kind?: TransactionKind;
}

export interface BudgetState {
  settings: Settings;
  workingSet: WorkingSet | null;

  /** Load a month, replacing whatever was there. Settings are kept. */
  replaceWorkingSet: (workingSet: WorkingSet) => void;
  clearWorkingSet: () => void;

  /** Edit a row. Marks it reviewed. amountCents is ignored on split rows (edit the split instead). */
  updateTransaction: (id: string, patch: TransactionPatch) => void;
  deleteTransaction: (id: string) => void;
  /** Tag or untag a row as a transfer (excluded from totals). Ignored when tagging a split row. */
  setTransfer: (id: string, isTransfer: boolean) => void;
  markReviewed: (id: string) => void;
  dismissDuplicate: (id: string) => void;

  /**
   * Set, replace or remove (null) the split on an expense row. The row's amountCents becomes the
   * user's share; removing the split restores the original total.
   */
  setSplit: (id: string, split: Split | null) => void;
  /** Delete a to-do: the money for this share has been requested. */
  markShareRequested: (transactionId: string, shareId: string) => void;

  /** Returns the id of the new (or already existing, case-insensitive) category. */
  addCategory: (name: string) => string;
  setDateOrder: (dateOrder: DateOrder) => void;
}

export function defaultSettings(): Settings {
  return {
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    rules: DEFAULT_RULES.map((r) => ({ ...r, keywords: [...r.keywords] })),
    dateOrder: "auto",
  };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function mapTransaction(
  workingSet: WorkingSet | null,
  id: string,
  fn: (t: Transaction) => Transaction,
): WorkingSet | null {
  if (!workingSet) return workingSet;
  return {
    ...workingSet,
    transactions: workingSet.transactions.map((t) => (t.id === id ? fn(t) : t)),
  };
}

export const useBudgetStore = create<BudgetState>()(
  persist(
    (set, get) => ({
      settings: defaultSettings(),
      workingSet: null,

      replaceWorkingSet: (workingSet) => set({ workingSet }),
      clearWorkingSet: () => set({ workingSet: null }),

      updateTransaction: (id, patch) =>
        set((s) => ({
          workingSet: mapTransaction(s.workingSet, id, (t) => {
            const next: Transaction = { ...t, reviewed: true };
            if (patch.description !== undefined)
              next.description = patch.description;
            if (patch.categoryId !== undefined)
              next.categoryId = patch.categoryId;
            if (patch.kind !== undefined && !t.split) next.kind = patch.kind;
            if (patch.amountCents !== undefined && !t.split) {
              assertCents(patch.amountCents);
              if (patch.amountCents > 0) next.amountCents = patch.amountCents;
            }
            return next;
          }),
        })),

      deleteTransaction: (id) =>
        set((s) =>
          s.workingSet
            ? {
                workingSet: {
                  ...s.workingSet,
                  transactions: s.workingSet.transactions.filter(
                    (t) => t.id !== id,
                  ),
                },
              }
            : s,
        ),

      setTransfer: (id, isTransfer) =>
        set((s) => ({
          workingSet: mapTransaction(s.workingSet, id, (t) =>
            isTransfer && t.split
              ? t
              : {
                  ...t,
                  isTransfer,
                  transferReason: isTransfer
                    ? (t.transferReason ?? "Tagged by you")
                    : null,
                  reviewed: true,
                },
          ),
        })),

      markReviewed: (id) =>
        set((s) => ({
          workingSet: mapTransaction(s.workingSet, id, (t) => ({
            ...t,
            reviewed: true,
          })),
        })),

      dismissDuplicate: (id) =>
        set((s) => ({
          workingSet: mapTransaction(s.workingSet, id, (t) => ({
            ...t,
            duplicateDismissed: true,
          })),
        })),

      setSplit: (id, split) =>
        set((s) => ({
          workingSet: mapTransaction(s.workingSet, id, (t) => {
            if (t.kind !== "expense" || t.isTransfer) return t;
            if (split === null) {
              return t.split
                ? {
                    ...t,
                    split: null,
                    amountCents: t.split.totalCents,
                    reviewed: true,
                  }
                : t;
            }
            const sum = split.shares.reduce(
              (acc, sh) => acc + sh.amountCents,
              0,
            );
            const userShare = split.shares.find((sh) => sh.isUser);
            if (!userShare || sum !== split.totalCents) {
              throw new Error(
                "Split shares must include you and sum to the total",
              );
            }
            split.shares.forEach((sh) => assertCents(sh.amountCents));
            return {
              ...t,
              split,
              amountCents: userShare.amountCents,
              reviewed: true,
            };
          }),
        })),

      markShareRequested: (transactionId, shareId) =>
        set((s) => ({
          workingSet: mapTransaction(s.workingSet, transactionId, (t) =>
            t.split
              ? {
                  ...t,
                  split: {
                    ...t.split,
                    shares: t.split.shares.map((sh) =>
                      sh.id === shareId ? { ...sh, requested: true } : sh,
                    ),
                  },
                }
              : t,
          ),
        })),

      addCategory: (name) => {
        const trimmed = name.trim();
        const { settings } = get();
        const existing = settings.categories.find(
          (c) => c.name.toLowerCase() === trimmed.toLowerCase(),
        );
        if (existing || trimmed === "") return existing?.id ?? "other";
        let id = slugify(trimmed) || "category";
        while (settings.categories.some((c) => c.id === id)) id = `${id}-2`;
        set({
          settings: {
            ...settings,
            categories: [
              ...settings.categories,
              { id, name: trimmed, builtIn: false },
            ],
          },
        });
        return id;
      },

      setDateOrder: (dateOrder) =>
        set((s) => ({ settings: { ...s.settings, dateOrder } })),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => createSafeStorage(() => localStorage)),
      partialize: (s) => ({ settings: s.settings, workingSet: s.workingSet }),
      // Rehydrated by HydrationGate on the client, so server and first client render match.
      skipHydration: true,
    },
  ),
);
