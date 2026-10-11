// Shared data model. Every amount is an integer number of cents.

export type Cents = number;

export interface Category {
  id: string;
  name: string;
  builtIn: boolean;
}

export interface CategoryRule {
  id: string;
  categoryId: string;
  // Lowercase keywords, matched on word boundaries against the normalised description.
  keywords: string[];
}

export interface SplitShare {
  id: string;
  name: string;
  isUser: boolean;
  amountCents: Cents;
  // True once the user typed this share's amount by hand. Never true for the user's own share.
  manual: boolean;
  // True once the to-do for this share was deleted (the money has been requested).
  requested: boolean;
}

export interface Split {
  // The original row amount. Invariant: shares sum to totalCents.
  totalCents: Cents;
  // The user's share is always first.
  shares: SplitShare[];
}

export type ReviewFlag =
  | "ocr-low"
  | "year-inferred"
  | "date-order-ambiguous"
  | "sign-guessed"
  | "columns-ambiguous"
  | "multiline-merged"
  | "ocr-corrected"
  | "outside-period"
  | "weak-description";

export type TransactionKind = "expense" | "income";

// What the generic parser produces for one statement line.
export interface ParsedTransaction {
  date: string; // ISO YYYY-MM-DD
  description: string;
  amountCents: Cents; // always positive
  kind: TransactionKind;
  confidence: number; // 0..1
  flags: ReviewFlag[];
  page: number;
  rawText: string;
}

export interface Transaction extends ParsedTransaction {
  id: string;
  sourceFileId: string;
  sourceFileName: string;
  // amountCents is the user's own share when the row is split.
  categoryId: string;
  isTransfer: boolean;
  transferReason: string | null;
  duplicateDismissed: boolean;
  reviewed: boolean;
  split: Split | null;
}

// Derived from splits, never stored.
export interface TodoItem {
  transactionId: string;
  shareId: string;
  name: string;
  amountCents: Cents;
  description: string;
}

export interface SourceFile {
  id: string;
  name: string;
  kind: "pdf" | "image";
}

export interface WorkingSet {
  month: string; // YYYY-MM
  transactions: Transaction[];
  sourceFiles: SourceFile[];
  loadedAt: string; // ISO timestamp
}

export type DateOrder = "MDY" | "DMY" | "auto";

export interface Settings {
  categories: Category[];
  rules: CategoryRule[];
  dateOrder: DateOrder;
}

export const OTHER_CATEGORY_ID = "other";
// Rows the parser is less sure about than this are highlighted for review.
export const REVIEW_THRESHOLD = 0.75;

// Month totals. Transfers are excluded; split rows count the user's share only.
export interface Totals {
  expenseCents: Cents;
  incomeCents: Cents;
  // Expenses only, keyed by category id. Categories with no spending are absent.
  byCategory: Record<string, Cents>;
}
