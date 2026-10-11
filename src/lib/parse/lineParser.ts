// The generic statement parser: positioned text lines in, candidate transactions out.
// It never sees a file and never throws; lines it cannot read are left out.

import type { TextLine, TextToken } from "../extract/types";
import type {
  DateOrder,
  ParsedTransaction,
  ReviewFlag,
  TransactionKind,
} from "../types";
import {
  detectCommaDecimal,
  findTrailingAmounts,
  parseAmountToken,
  type AmountHit,
} from "./amounts";
import {
  analyseBalances,
  assignColumns,
  clusterRightEdges,
  detectHeader,
  type BalanceItem,
  type ColumnHeader,
  type ColumnRole,
} from "./columns";
import {
  computeConfidence,
  MIN_DESCRIPTION_ALNUM,
  OCR_LOW_THRESHOLD,
  ocrMeanConfidence,
} from "./confidence";
import {
  countOrderEvidence,
  isOrderAmbiguous,
  matchDateAt,
  parseIsoDate,
  resolveDate,
  toIsoDate,
  type DateMatch,
  type DateParts,
  type ResolvedOrder,
} from "./dates";
import {
  detectAccountType,
  matchSectionHeading,
  resolveKinds,
  type AccountType,
  type PolarityRow,
} from "./polarity";
import { isOpeningBalanceLine, isStopLine } from "./stopPhrases";
import {
  fallbackAnchor,
  findAnchor,
  inferYear,
  isOutsidePeriod,
  labelledDateParts,
} from "./yearInference";

export interface ParseOptions {
  /** User setting; "auto" means infer, falling back to MDY. */
  dateOrder: DateOrder;
  /** ISO YYYY-MM-DD; year anchor when the document gives none. */
  fallbackDate: string;
  /** User override: swap expense/income for every row of this file. */
  flipKinds?: boolean;
}

export interface ParseResult {
  /** amountCents always positive; date ISO; in document order. */
  rows: ParsedTransaction[];
  detectedDateOrder: "MDY" | "DMY" | null;
  accountType: "card" | "bank" | "unknown";
}

/** A continuation line must start within this many line heights below the line before it. */
const CONTINUATION_MAX_GAP = 1.6;
/** At most this many extra lines are appended to one description. */
const CONTINUATION_MAX_LINES = 2;
/** A continuation line must start within this many line heights of the description column. */
const DESCRIPTION_X_TOLERANCE = 3;
/** Amount right edges within this many line heights of each other are one column. */
const CLUSTER_TOLERANCE = 0.75;
/** Bullets and rules before the date are skipped, up to this many tokens. */
const MAX_LEADING_JUNK = 2;
const DEFAULT_HEIGHT = 10;
const DEFAULT_CHAR_WIDTH = 6;

const FLAG_ORDER: ReviewFlag[] = [
  "ocr-low",
  "year-inferred",
  "date-order-ambiguous",
  "sign-guessed",
  "columns-ambiguous",
  "multiline-merged",
  "ocr-corrected",
  "outside-period",
  "weak-description",
];

const ALNUM_RE = /[\p{L}\p{N}]/u;
const ALNUM_GLOBAL_RE = /[\p{L}\p{N}]/gu;

// ---------------------------------------------------------------------------------------------
// Input clean-up
// ---------------------------------------------------------------------------------------------

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Append a token, splitting it into words when the extractor handed over a whole phrase. */
function pushWords(out: TextToken[], raw: unknown, cursor: number): number {
  if (typeof raw !== "object" || raw === null) return cursor;
  const t = raw as Partial<Record<keyof TextToken, unknown>>;
  if (typeof t.text !== "string") return cursor;
  const text = t.text.trim();
  if (text === "") return cursor;
  const x0 = isFiniteNumber(t.x0) ? t.x0 : cursor;
  const x1 =
    isFiniteNumber(t.x1) && t.x1 >= x0
      ? t.x1
      : x0 + text.length * DEFAULT_CHAR_WIDTH;
  const conf = isFiniteNumber(t.conf)
    ? Math.min(1, Math.max(0, t.conf))
    : undefined;
  const perChar = (x1 - x0) / text.length;
  const wordRe = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = wordRe.exec(text)) !== null) {
    const token: TextToken = {
      text: m[0],
      x0: x0 + m.index * perChar,
      x1: x0 + (m.index + m[0].length) * perChar,
    };
    if (conf !== undefined) token.conf = conf;
    out.push(token);
  }
  return x1 + DEFAULT_CHAR_WIDTH;
}

function sanitiseLine(raw: unknown): TextLine | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Partial<Record<keyof TextLine, unknown>>;
  const tokens: TextToken[] = [];
  let cursor = 0;
  if (Array.isArray(r.tokens)) {
    for (const t of r.tokens) cursor = pushWords(tokens, t, cursor);
  }
  if (tokens.length === 0 && typeof r.text === "string") {
    pushWords(tokens, { text: r.text, x0: 0 }, 0);
  }
  if (tokens.length === 0) return null;
  tokens.sort((a, b) => a.x0 - b.x0);
  return {
    text: tokens.map((t) => t.text).join(" "),
    tokens,
    y: isFiniteNumber(r.y) ? r.y : 0,
    height:
      isFiniteNumber(r.height) && r.height > 0 ? r.height : DEFAULT_HEIGHT,
    page: isFiniteNumber(r.page) && r.page >= 1 ? Math.floor(r.page) : 1,
    source: r.source === "ocr" ? "ocr" : "pdf",
  };
}

// ---------------------------------------------------------------------------------------------
// Per-line classification
// ---------------------------------------------------------------------------------------------

interface LineInfo {
  line: TextLine;
  /** Position in the document, for ordering. */
  index: number;
  texts: string[];
  date: DateMatch | null;
  secondDate: DateMatch | null;
  /** First token after the leading date(s); 0 for an undated line. */
  bodyStart: number;
  hits: AmountHit[];
}

function classify(
  line: TextLine,
  index: number,
  commaDecimal: boolean,
): LineInfo {
  const texts = line.tokens.map((t) => t.text);
  const ocr = line.source === "ocr";
  const amountOptions = { ocr, commaDecimal, height: line.height };

  let start = 0;
  while (
    start < Math.min(MAX_LEADING_JUNK, texts.length - 1) &&
    !ALNUM_RE.test(texts[start])
  ) {
    start++;
  }
  let date = matchDateAt(texts, start, { ocr });
  let secondDate: DateMatch | null = null;
  let bodyStart = 0;
  if (date) {
    bodyStart = start + date.tokenCount;
    const next = matchDateAt(texts, bodyStart, { ocr });
    // A posting date looks like the transaction date before it; anything else is description.
    if (
      next &&
      next.parts.form === date.parts.form &&
      next.amountLike === date.amountLike
    ) {
      secondDate = next;
      bodyStart += next.tokenCount;
    }
  }
  let hits = findTrailingAmounts(line.tokens, {
    ...amountOptions,
    from: bodyStart,
  });

  // A bare "12.03" opening a line with no other amount is the amount 12.03, not 12 March.
  if (
    date &&
    date.amountLike &&
    hits.length === 0 &&
    parseAmountToken(texts[start], amountOptions) !== null
  ) {
    date = null;
    secondDate = null;
    bodyStart = 0;
    hits = findTrailingAmounts(line.tokens, { ...amountOptions, from: 0 });
  }
  return { line, index, texts, date, secondDate, bodyStart, hits };
}

function inHit(
  hits: readonly AmountHit[],
  tokenIndex: number,
): AmountHit | null {
  return hits.find((h) => tokenIndex >= h.start && tokenIndex <= h.end) ?? null;
}

/** Tokens that are neither the leading date nor a trailing amount. */
function descriptionTokens(info: LineInfo): TextToken[] {
  return info.line.tokens.filter(
    (_, i) => i >= info.bodyStart && inHit(info.hits, i) === null,
  );
}

function joinDescription(tokens: readonly TextToken[]): string {
  const words = tokens.map((t) => t.text);
  // Stray bullets, pipes and currency symbols at either end are layout, not description.
  while (words.length > 0 && !ALNUM_RE.test(words[0])) words.shift();
  while (words.length > 0 && !ALNUM_RE.test(words[words.length - 1]))
    words.pop();
  return words.join(" ");
}

// ---------------------------------------------------------------------------------------------
// Row assembly
// ---------------------------------------------------------------------------------------------

interface Section {
  id: number;
  kind: TransactionKind;
}

interface Draft {
  /** The lines the row was built from, in order. */
  parts: LineInfo[];
  date: DateMatch;
  /** Amounts found on the row's amount line, left to right. */
  hits: AmountHit[];
  descX0: number | null;
  extraLines: number;
  header: ColumnHeader | null;
  section: Section | null;
  lastY: number;
  lastHeight: number;
  page: number;
  // Filled by column resolution.
  amount: AmountHit | null;
  balance: AmountHit | null;
  columnKind: TransactionKind | null;
  balanceKind: TransactionKind | null;
  columnsAmbiguous: boolean;
  balanceCandidate: boolean;
  /** A dated line whose only amount sits in the balance column: a balance, not a transaction. */
  balanceOnly: boolean;
}

interface BalanceMarker {
  index: number;
  balanceCents: number;
}

function newDraft(
  info: LineInfo,
  date: DateMatch,
  header: ColumnHeader | null,
  section: Section | null,
): Draft {
  const desc = descriptionTokens(info);
  return {
    parts: [info],
    date,
    hits: info.hits,
    descX0: desc.length > 0 ? desc[0].x0 : null,
    extraLines: 0,
    header,
    section,
    lastY: info.line.y,
    lastHeight: info.line.height,
    page: info.line.page,
    amount: null,
    balance: null,
    columnKind: null,
    balanceKind: null,
    columnsAmbiguous: false,
    balanceCandidate: false,
    balanceOnly: false,
  };
}

function isDirectlyBelow(draft: Draft, line: TextLine): boolean {
  if (line.page !== draft.page) return false;
  const gap = line.y - draft.lastY;
  return (
    gap > 0 &&
    gap <= CONTINUATION_MAX_GAP * Math.max(draft.lastHeight, line.height)
  );
}

function startsNearDescription(draft: Draft, line: TextLine): boolean {
  if (draft.descX0 === null) return true;
  return (
    Math.abs(line.tokens[0].x0 - draft.descX0) <=
    DESCRIPTION_X_TOLERANCE * line.height
  );
}

function append(draft: Draft, info: LineInfo): void {
  draft.parts.push(info);
  draft.extraLines++;
  draft.lastY = info.line.y;
  draft.lastHeight = info.line.height;
  if (draft.descX0 === null) {
    const desc = descriptionTokens(info);
    if (desc.length > 0) draft.descX0 = desc[0].x0;
  }
}

/** Signed balance: "DR" after a balance means overdrawn. */
function balanceValue(hit: AmountHit): number {
  return hit.marker === "DR" ? -Math.abs(hit.cents) : hit.cents;
}

function collectDrafts(infos: readonly LineInfo[]): {
  drafts: Draft[];
  markers: BalanceMarker[];
} {
  const drafts: Draft[] = [];
  const markers: BalanceMarker[] = [];
  let header: ColumnHeader | null = null;
  let section: Section | null = null;
  let sectionCount = 0;
  // The last finished row, while later lines may still continue its description.
  let open: Draft | null = null;
  // A dated line still waiting for its amount.
  let pending: Draft | null = null;

  for (const info of infos) {
    const dated = info.date !== null;
    const hasAmount = info.hits.length > 0;

    if (!dated) {
      const heading = matchSectionHeading(
        joinDescription(descriptionTokens(info)),
      );
      if (heading !== null) {
        section =
          heading === "neutral" ? null : { id: ++sectionCount, kind: heading };
        open = null;
        pending = null;
        continue;
      }
    }
    if (isStopLine(info.line.text, dated)) {
      if (hasAmount && isOpeningBalanceLine(info.line.text)) {
        markers.push({
          index: info.index,
          balanceCents: balanceValue(info.hits[info.hits.length - 1]),
        });
      }
      open = null;
      pending = null;
      continue;
    }
    if (!dated && !hasAmount) {
      const found = detectHeader(info.line.tokens);
      if (found) {
        header = found;
        open = null;
        pending = null;
        continue;
      }
    }

    if (info.date !== null) {
      const draft = newDraft(info, info.date, header, section);
      if (hasAmount) {
        drafts.push(draft);
        open = draft;
        pending = null;
      } else {
        open = null;
        pending = draft;
      }
      continue;
    }

    if (pending !== null) {
      if (!isDirectlyBelow(pending, info.line)) {
        pending = null;
      } else if (hasAmount) {
        // Date on one line, amount on the next: one row.
        append(pending, info);
        pending.hits = info.hits;
        drafts.push(pending);
        open = pending;
        pending = null;
        continue;
      } else if (pending.extraLines < CONTINUATION_MAX_LINES) {
        append(pending, info);
        continue;
      } else {
        pending = null;
      }
    }

    if (
      open !== null &&
      !hasAmount &&
      open.extraLines < CONTINUATION_MAX_LINES &&
      isDirectlyBelow(open, info.line) &&
      startsNearDescription(open, info.line)
    ) {
      append(open, info);
      continue;
    }
    open = null;
  }
  return { drafts, markers };
}

// ---------------------------------------------------------------------------------------------
// Columns and running balance
// ---------------------------------------------------------------------------------------------

function takeLeftmost(draft: Draft): void {
  draft.amount = draft.hits[0];
  draft.balance = null;
  draft.columnsAmbiguous = true;
  draft.balanceCandidate = false;
}

function applyHeader(draft: Draft, header: ColumnHeader): boolean {
  const roles = assignColumns(
    draft.hits.map((h) => h.x1),
    header,
  );
  if (!roles) return false;
  const at = (role: ColumnRole): AmountHit | null => {
    const i = roles.indexOf(role);
    return i >= 0 ? draft.hits[i] : null;
  };
  const debit = at("debit");
  const credit = at("credit");
  const amount = at("amount");
  const balance = at("balance");
  if (debit && credit) {
    takeLeftmost(draft);
    return true;
  }
  if (debit || credit) {
    draft.amount = debit ?? credit;
    draft.columnKind = debit ? "expense" : "income";
    draft.balance = balance;
    return true;
  }
  if (amount) {
    draft.amount = amount;
    draft.balance = balance;
    return true;
  }
  draft.balance = balance;
  draft.balanceOnly = true;
  return true;
}

function resolveColumns(
  drafts: readonly Draft[],
  markers: readonly BalanceMarker[],
  accountType: AccountType,
  medianHeight: number,
): void {
  const headerless: Draft[] = [];
  for (const draft of drafts) {
    const header = draft.header;
    const headerHelps =
      header !== null && header.columns.some((c) => c.role !== "amount");
    if (headerHelps && applyHeader(draft, header)) continue;
    headerless.push(draft);
    if (draft.hits.length === 1) {
      draft.amount = draft.hits[0];
    } else {
      // Possibly "amount, running balance"; confirmed or rejected below.
      draft.amount = draft.hits[draft.hits.length - 2];
      draft.balance = draft.hits[draft.hits.length - 1];
      draft.balanceCandidate = true;
    }
  }

  // The balance column, if there is one, is the rightmost cluster of amount right edges.
  const clusters = clusterRightEdges(
    headerless.flatMap((d) => d.hits.map((h) => h.x1)),
    CLUSTER_TOLERANCE * medianHeight,
  );
  const rightmost = clusters[clusters.length - 1];
  for (const draft of headerless) {
    if (!draft.balanceCandidate || !draft.balance) continue;
    if (!rightmost || draft.balance.x1 < rightmost[0]) takeLeftmost(draft);
  }

  type Entry = { index: number; item: BalanceItem; draft: Draft | null };
  const entries: Entry[] = [
    ...markers.map((m) => ({
      index: m.index,
      item: { amountCents: null, balanceCents: m.balanceCents },
      draft: null,
    })),
    ...drafts.map((d) => ({
      index: d.parts[0].index,
      item: {
        amountCents:
          d.balanceOnly || !d.amount ? null : Math.abs(d.amount.cents),
        balanceCents: d.balance ? balanceValue(d.balance) : null,
      },
      draft: d,
    })),
  ].sort((a, b) => a.index - b.index);

  const analysis = analyseBalances(entries.map((e) => e.item));
  entries.forEach((entry, i) => {
    const draft = entry.draft;
    if (!draft) return;
    if (!analysis.confirmed) {
      if (draft.balanceCandidate) takeLeftmost(draft);
      return;
    }
    const direction = analysis.directions[i];
    if (direction === null) return;
    // More owed on a card is spending; more in a bank account is income.
    const rose: TransactionKind = accountType === "card" ? "expense" : "income";
    const fell: TransactionKind = accountType === "card" ? "income" : "expense";
    draft.balanceKind = direction === "up" ? rose : fell;
  });
}

// ---------------------------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------------------------

function median(values: readonly number[]): number {
  if (values.length === 0) return DEFAULT_HEIGHT;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function chooseDateOrder(
  setting: unknown,
  dates: readonly DateParts[],
): {
  order: ResolvedOrder;
  detected: ResolvedOrder | null;
  ambiguous: boolean;
} {
  const evidence = countOrderEvidence(dates);
  const detected: ResolvedOrder | null =
    evidence.mdy === evidence.dmy
      ? null
      : evidence.mdy > evidence.dmy
        ? "MDY"
        : "DMY";
  if (setting === "MDY" || setting === "DMY") {
    // The user's choice stands unless every dated line in the file contradicts it.
    const own = setting === "MDY" ? evidence.mdy : evidence.dmy;
    const other = setting === "MDY" ? evidence.dmy : evidence.mdy;
    const order = own === 0 && other > 0 ? (detected ?? setting) : setting;
    return { order, detected, ambiguous: false };
  }
  return { order: detected ?? "MDY", detected, ambiguous: detected === null };
}

function buildRow(
  draft: Draft,
  amount: AmountHit,
  kind: TransactionKind,
  isoDate: string,
  flags: Set<ReviewFlag>,
): ParsedTransaction {
  const descTokens = draft.parts.flatMap((p) => descriptionTokens(p));
  const description = joinDescription(descTokens);
  const alnum = description.match(ALNUM_GLOBAL_RE)?.length ?? 0;
  if (alnum < MIN_DESCRIPTION_ALNUM) flags.add("weak-description");
  if (draft.parts.length > 1) flags.add("multiline-merged");
  if (draft.date.corrected || amount.corrected) flags.add("ocr-corrected");

  let ocrMean: number | null = null;
  if (draft.parts.some((p) => p.line.source === "ocr")) {
    const amountConfs: number[] = [];
    const otherConfs: number[] = [];
    for (const part of draft.parts) {
      part.line.tokens.forEach((token, i) => {
        if (typeof token.conf !== "number") return;
        const hit = inHit(part.hits, i);
        if (hit === amount) amountConfs.push(token.conf);
        else if (hit === null) otherConfs.push(token.conf);
      });
    }
    ocrMean = ocrMeanConfidence(amountConfs, otherConfs);
    if (ocrMean !== null && ocrMean < OCR_LOW_THRESHOLD) flags.add("ocr-low");
  }

  const ordered = FLAG_ORDER.filter((f) => flags.has(f));
  return {
    date: isoDate,
    description,
    amountCents: Math.abs(amount.cents),
    kind,
    confidence: computeConfidence(ordered, ocrMean),
    flags: ordered,
    page: draft.page,
    rawText: draft.parts.map((p) => p.line.text).join(" "),
  };
}

function parse(rawLines: unknown, options: Partial<ParseOptions>): ParseResult {
  const lines = (Array.isArray(rawLines) ? rawLines : [])
    .map(sanitiseLine)
    .filter((l): l is TextLine => l !== null);
  const lineTexts = lines.map((l) => l.text);
  const tokenTexts = lines.map((l) => l.tokens.map((t) => t.text));

  const accountType = detectAccountType(lineTexts);
  const commaDecimal = detectCommaDecimal(tokenTexts.flat());
  const infos = lines.map((line, i) => classify(line, i, commaDecimal));

  const leadingDates = infos.flatMap((info) =>
    [info.date, info.secondDate]
      .filter((d): d is DateMatch => d !== null)
      .map((d) => d.parts),
  );
  const { order, detected, ambiguous } = chooseDateOrder(options.dateOrder, [
    ...leadingDates,
    ...labelledDateParts(tokenTexts),
  ]);
  const anchor =
    findAnchor(tokenTexts, order, parseIsoDate(options.fallbackDate)) ??
    fallbackAnchor(options.fallbackDate);

  const { drafts, markers } = collectDrafts(infos);
  resolveColumns(
    drafts,
    markers,
    accountType,
    median(lines.map((l) => l.height)),
  );

  // Balance-only lines and zero amounts are not transactions.
  const kept = drafts.filter(
    (d): d is Draft & { amount: AmountHit } =>
      !d.balanceOnly && d.amount !== null && d.amount.cents !== 0,
  );
  const kinds = resolveKinds(
    kept.map((d): PolarityRow => ({
      signedCents: d.amount.cents,
      columnKind: d.columnKind,
      balanceKind: d.balanceKind,
      sectionKind: d.section?.kind ?? null,
      sectionId: d.section?.id ?? null,
      marker: d.amount.marker,
    })),
    accountType,
  );

  const rows: ParsedTransaction[] = [];
  kept.forEach((draft, i) => {
    const flags = new Set<ReviewFlag>();
    const { month, day, year } = resolveDate(draft.date.parts, order);
    let iso: string | null;
    if (year !== null) {
      iso = toIsoDate(year, month, day);
    } else {
      const inferred = inferYear(month, day, anchor);
      // 29 February only exists in one of the two candidate years.
      iso =
        toIsoDate(inferred, month, day) ?? toIsoDate(inferred - 1, month, day);
      if (anchor.source === "fallback") flags.add("year-inferred");
    }
    if (iso === null) return;
    const ymd = parseIsoDate(iso);
    if (ymd && isOutsidePeriod(ymd, anchor)) flags.add("outside-period");
    if (ambiguous && isOrderAmbiguous(draft.date.parts)) {
      flags.add("date-order-ambiguous");
    }
    if (draft.columnsAmbiguous) flags.add("columns-ambiguous");
    if (kinds[i].guessed) flags.add("sign-guessed");

    let kind = kinds[i].kind;
    if (options.flipKinds === true) {
      kind = kind === "expense" ? "income" : "expense";
    }
    rows.push(buildRow(draft, draft.amount, kind, iso, flags));
  });

  return { rows, detectedDateOrder: detected, accountType };
}

/**
 * Parse one file's text lines into candidate transactions. Handles card and bank statements
 * from PDF text or OCR without any bank-specific rules. Never throws: garbage in, fewer rows out.
 */
export function parseStatement(
  lines: TextLine[],
  options: ParseOptions,
): ParseResult {
  try {
    return parse(lines, options ?? {});
  } catch {
    return { rows: [], detectedDateOrder: null, accountType: "unknown" };
  }
}
