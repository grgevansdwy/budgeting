// Column handling for lines that carry more than one amount: header-named columns matched by
// right edge, and running-balance detection when there is no header.

import type { TextToken } from "../extract/types";

export type ColumnRole = "debit" | "credit" | "balance" | "amount";

export interface HeaderColumn {
  role: ColumnRole;
  x0: number;
  x1: number;
}

export interface ColumnHeader {
  columns: HeaderColumn[];
}

const MAX_HEADER_TOKENS = 14;

const SINGLE_WORD_ROLES: Record<string, ColumnRole> = {
  debit: "debit",
  debits: "debit",
  withdrawal: "debit",
  withdrawals: "debit",
  charges: "debit",
  credit: "credit",
  credits: "credit",
  deposit: "credit",
  deposits: "credit",
  receipts: "credit",
  balance: "balance",
  amount: "amount",
};
// "Paid out" / "Paid in" / "Money out" / "Money in"
const TWO_WORD_LEADS = new Set(["paid", "money"]);
const TWO_WORD_ROLES: Record<string, ColumnRole> = {
  out: "debit",
  in: "credit",
};
const COMPANION_WORDS = new Set([
  "date",
  "description",
  "details",
  "transaction",
  "transactions",
  "particulars",
  "payee",
  "reference",
]);
// Words that sit in a header without naming a column: "Trans date", "Post date", "Check no".
const FILLER_WORDS = new Set([
  "trans",
  "post",
  "posting",
  "posted",
  "effective",
  "value",
  "check",
  "no",
  "number",
  "ref",
  "type",
  "",
]);
/** A header may hold at most this many words that are none of the above. */
const MAX_UNKNOWN_HEADER_WORDS = 1;

function word(token: TextToken): string {
  return token.text.toLowerCase().replace(/[^a-z]/g, "");
}

/**
 * Read a column header line such as "Date Description Withdrawals Deposits Balance".
 * Needs two named amount columns, or one beside a "Date" / "Description" label.
 */
export function detectHeader(
  tokens: readonly TextToken[],
): ColumnHeader | null {
  if (tokens.length === 0 || tokens.length > MAX_HEADER_TOKENS) return null;
  const columns: HeaderColumn[] = [];
  let companions = 0;
  let unknown = 0;
  for (let i = 0; i < tokens.length; i++) {
    const w = word(tokens[i]);
    let role: ColumnRole | undefined;
    let last = i;
    if (TWO_WORD_LEADS.has(w) && i + 1 < tokens.length) {
      role = TWO_WORD_ROLES[word(tokens[i + 1])];
      if (role) last = i + 1;
    }
    role ??= SINGLE_WORD_ROLES[w];
    if (role) {
      if (!columns.some((c) => c.role === role)) {
        columns.push({ role, x0: tokens[i].x0, x1: tokens[last].x1 });
      }
      i = last;
    } else if (COMPANION_WORDS.has(w)) {
      companions++;
    } else if (!FILLER_WORDS.has(w)) {
      unknown++;
    }
  }
  // A wrapped description such as "DEBIT CARD PURCHASE BALANCE INQUIRY" is not a header.
  if (unknown > MAX_UNKNOWN_HEADER_WORDS) return null;
  if (columns.length >= 2 || (columns.length === 1 && companions > 0)) {
    return { columns };
  }
  return null;
}

/**
 * Give each amount the header column whose right edge is nearest. Returns null when two amounts
 * land in the same column, which means the header does not describe this line.
 */
export function assignColumns(
  rightEdges: readonly number[],
  header: ColumnHeader,
): ColumnRole[] | null {
  if (header.columns.length === 0) return null;
  const roles: ColumnRole[] = [];
  for (const x1 of rightEdges) {
    let best = header.columns[0];
    for (const column of header.columns) {
      if (Math.abs(column.x1 - x1) < Math.abs(best.x1 - x1)) best = column;
    }
    if (roles.includes(best.role)) return null;
    roles.push(best.role);
  }
  return roles;
}

/** Group values that lie within `tolerance` of their neighbour. Clusters come back sorted left to right. */
export function clusterRightEdges(
  values: readonly number[],
  tolerance: number,
): number[][] {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const clusters: number[][] = [];
  for (const value of sorted) {
    const current = clusters[clusters.length - 1];
    if (current && value - current[current.length - 1] <= tolerance) {
      current.push(value);
    } else {
      clusters.push([value]);
    }
  }
  return clusters;
}

export interface BalanceItem {
  /** Absolute row amount in cents; null for a bare balance line such as "Opening balance". */
  amountCents: number | null;
  /** Signed balance printed on the line; null when the row shows none. */
  balanceCents: number | null;
}

export type BalanceDirection = "up" | "down" | null;

export interface BalanceAnalysis {
  /** True when the balances really do track the amounts, so the column can be trusted. */
  confirmed: boolean;
  /** True when the statement lists the newest row first. */
  newestFirst: boolean;
  /** Per item: whether the balance rose or fell by that row's amount; null when it could not be told. */
  directions: BalanceDirection[];
}

/** A balance column is trusted when at least this share of the checkable rows add up. */
export const BALANCE_MATCH_RATIO = 0.5;

function walk(items: readonly BalanceItem[]): {
  matches: number;
  testable: number;
  directions: BalanceDirection[];
} {
  const directions: BalanceDirection[] = items.map(() => null);
  let matches = 0;
  let testable = 0;
  let previous: number | null = null;
  // Rows since the last printed balance; some statements print it once per day.
  let group: number[] = [];
  items.forEach((item, index) => {
    if (item.amountCents !== null) group.push(index);
    if (item.balanceCents === null) return;
    if (previous !== null && group.length > 0) {
      testable++;
      const diff = item.balanceCents - previous;
      const total = group.reduce(
        (sum, i) => sum + Math.abs(items[i].amountCents ?? 0),
        0,
      );
      if (diff !== 0 && Math.abs(diff) === total) {
        matches++;
        for (const i of group) directions[i] = diff > 0 ? "up" : "down";
      }
    }
    previous = item.balanceCents;
    group = [];
  });
  return { matches, testable, directions };
}

/**
 * Test whether a column of balances is a running balance: each balance differs from the one
 * before by exactly the row amount (or by the sum of the rows since the last printed balance).
 * Tried in document order and in reverse, for statements that list the newest row first.
 */
export function analyseBalances(
  items: readonly BalanceItem[],
): BalanceAnalysis {
  const forward = walk(items);
  const reversedItems = [...items].reverse();
  const backward = walk(reversedItems);
  const useBackward = backward.matches > forward.matches;
  const best = useBackward ? backward : forward;
  const directions = useBackward
    ? [...best.directions].reverse()
    : best.directions;
  const confirmed =
    best.matches >= 1 && best.matches >= best.testable * BALANCE_MATCH_RATIO;
  return { confirmed, newestFirst: useBackward, directions };
}
