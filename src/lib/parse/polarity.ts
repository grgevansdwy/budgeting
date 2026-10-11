// Direction of each row: expense or income. Rules are tried in a fixed order and the first one
// that applies wins.

import type { TransactionKind } from "../types";
import type { AmountMarker } from "./amounts";

export type AccountType = "card" | "bank" | "unknown";

const CARD_KEYWORDS: RegExp[] = [
  /\bcredit limit\b/,
  /\bminimum payment\b/,
  /\bpayment due\b/,
  /\bavailable credit\b/,
  /\bcredit card\b/,
  /\bcash advances?\b/,
];
const BANK_KEYWORDS: RegExp[] = [
  /\bchecking\b/,
  /\bsavings\b/,
  /\bavailable balance\b/,
  /\bcurrent account\b/,
  /\boverdraft\b/,
];

/** Decide card or bank from keywords anywhere in the document; whichever kind has more distinct keywords wins. */
export function detectAccountType(lineTexts: Iterable<string>): AccountType {
  const text = Array.from(lineTexts).join("\n").toLowerCase();
  const card = CARD_KEYWORDS.filter((re) => re.test(text)).length;
  const bank = BANK_KEYWORDS.filter((re) => re.test(text)).length;
  if (card === bank) return "unknown";
  return card > bank ? "card" : "bank";
}

export type SectionKind = TransactionKind | "neutral";

const INCOME_HEADINGS: RegExp[] = [
  /^payments?(,| and)? (other )?credits$/,
  /^payments( received)?$/,
  /^(other )?credits$/,
  /^(electronic |direct |other )?deposits( and (other )?(credits|additions))?$/,
  /^refunds( and credits)?$/,
  /^credits and refunds$/,
  /^(money|paid) in$/,
  /^additions$/,
  /^income$/,
];
const EXPENSE_HEADINGS: RegExp[] = [
  /^(standard |card |new |debit card )?purchases( and (adjustments|other charges|debits|cash advances))?$/,
  /^(electronic |other |atm |card |atm and debit card )?withdrawals( and (other )?(debits|subtractions))?$/,
  /^fees( charged)?$/,
  /^interest( charged)?$/,
  /^(new |other )?(charges|debits)$/,
  /^checks( paid)?$/,
  /^cash advances$/,
  /^(money|paid) out$/,
  /^subtractions$/,
];
const NEUTRAL_HEADINGS: RegExp[] = [
  /^transactions?$/,
  /^(account |transaction |recent |card )?(activity|history|details|transactions)$/,
  /^(account )?summary$/,
];

/**
 * Recognise a section heading ("Payments and credits", "Purchases", "Fees"). A neutral heading
 * such as "Transactions" ends the current section without starting a directional one.
 */
export function matchSectionHeading(text: string): SectionKind | null {
  const t = text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\(?\bcont(inued|'?d)\b\.?\)?/g, " ")
    .replace(/[^a-z, ]/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/^[, ]+|[, ]+$/g, "");
  if (t === "") return null;
  if (INCOME_HEADINGS.some((re) => re.test(t))) return "income";
  if (EXPENSE_HEADINGS.some((re) => re.test(t))) return "expense";
  if (NEUTRAL_HEADINGS.some((re) => re.test(t))) return "neutral";
  return null;
}

export interface PolarityRow {
  /** Amount exactly as printed: negative for -, trailing - or parentheses. */
  signedCents: number;
  /** Rule 1: the amount sat in a debit or credit column. */
  columnKind: TransactionKind | null;
  /** Rule 2: the running balance moved by this amount. */
  balanceKind: TransactionKind | null;
  /** Rule 3: the section the row sits under, and an id shared by the rows of that section. */
  sectionKind: TransactionKind | null;
  sectionId: number | null;
  /** Rule 4. */
  marker: AmountMarker | null;
}

export type PolarityRule =
  "columns" | "balance" | "section" | "marker" | "account-type" | "majority";

export interface PolarityResult {
  kind: TransactionKind;
  rule: PolarityRule;
  /** True when only the majority fallback applied; the row gets "sign-guessed". */
  guessed: boolean;
}

function opposite(kind: TransactionKind): TransactionKind {
  return kind === "expense" ? "income" : "expense";
}

function byAccountType(
  signedCents: number,
  accountType: AccountType,
): TransactionKind | null {
  if (accountType === "card") return signedCents < 0 ? "income" : "expense";
  if (accountType === "bank") return signedCents < 0 ? "expense" : "income";
  return null;
}

/** What each printed sign meant on the rows the running balance settled, when that is consistent. */
function learnSignConvention(
  rows: readonly PolarityRow[],
): { positive: TransactionKind; negative: TransactionKind } | null {
  const seen = {
    positive: new Set<TransactionKind>(),
    negative: new Set<TransactionKind>(),
  };
  for (const row of rows) {
    if (row.columnKind !== null || row.balanceKind === null) continue;
    seen[row.signedCents < 0 ? "negative" : "positive"].add(row.balanceKind);
  }
  if (seen.positive.size !== 1 || seen.negative.size !== 1) return null;
  const [positive] = seen.positive;
  const [negative] = seen.negative;
  return positive === negative ? null : { positive, negative };
}

/**
 * Resolve expense / income for every row of one file.
 *  1. Separate debit and credit columns.
 *  2. Running-balance difference (and the sign convention it proves for the file's other rows).
 *  3. Section headings. The section names the direction of its usual sign; a row with the
 *     opposite sign (a refund listed under Purchases) goes the other way.
 *  4. CR is income; DR, or unmarked in a file that uses CR, is expense.
 *  5. Account type: card positive = expense, negative = income; bank negative = expense,
 *     positive = income. A bank file with no negative amounts tells us nothing, so it falls through.
 *  6. Majority sign is expense; flagged as a guess.
 */
export function resolveKinds(
  rows: readonly PolarityRow[],
  accountType: AccountType,
): PolarityResult[] {
  const convention = learnSignConvention(rows);
  const fileUsesCr = rows.some((r) => r.marker === "CR");
  const fileHasNegative = rows.some((r) => r.signedCents < 0);

  const sectionSigns = new Map<
    number,
    { positive: number; negative: number }
  >();
  for (const row of rows) {
    if (row.sectionId === null || row.sectionKind === null) continue;
    const counts = sectionSigns.get(row.sectionId) ?? {
      positive: 0,
      negative: 0,
    };
    if (row.signedCents < 0) counts.negative++;
    else counts.positive++;
    sectionSigns.set(row.sectionId, counts);
  }

  let positive = 0;
  let negative = 0;
  for (const row of rows) {
    if (row.signedCents < 0) negative++;
    else positive++;
  }
  const majorityNegative = negative > positive;

  return rows.map((row): PolarityResult => {
    const isNegative = row.signedCents < 0;
    if (row.columnKind !== null) {
      return { kind: row.columnKind, rule: "columns", guessed: false };
    }
    if (row.balanceKind !== null) {
      return { kind: row.balanceKind, rule: "balance", guessed: false };
    }
    if (convention) {
      return {
        kind: isNegative ? convention.negative : convention.positive,
        rule: "balance",
        guessed: false,
      };
    }
    if (row.sectionKind !== null && row.sectionId !== null) {
      const counts = sectionSigns.get(row.sectionId) ?? {
        positive: 0,
        negative: 0,
      };
      let kind: TransactionKind;
      if (counts.positive === counts.negative) {
        kind = byAccountType(row.signedCents, accountType) ?? row.sectionKind;
      } else {
        const usualIsNegative = counts.negative > counts.positive;
        kind =
          isNegative === usualIsNegative
            ? row.sectionKind
            : opposite(row.sectionKind);
      }
      return { kind, rule: "section", guessed: false };
    }
    if (row.marker === "CR") {
      return { kind: "income", rule: "marker", guessed: false };
    }
    if (row.marker === "DR" || fileUsesCr) {
      return { kind: "expense", rule: "marker", guessed: false };
    }
    if (accountType === "card" || (accountType === "bank" && fileHasNegative)) {
      const kind = byAccountType(row.signedCents, accountType);
      if (kind) return { kind, rule: "account-type", guessed: false };
    }
    return {
      kind: isNegative === majorityNegative ? "expense" : "income",
      rule: "majority",
      guessed: true,
    };
  });
}
