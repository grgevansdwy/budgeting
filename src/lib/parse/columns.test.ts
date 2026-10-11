import { describe, expect, it } from "vitest";
import { statement } from "../../test/fixtures/build";
import {
  analyseBalances,
  assignColumns,
  clusterRightEdges,
  detectHeader,
} from "./columns";

const layout = {
  date: { x: 40 },
  desc: { x: 110 },
  out: { x: 400, align: "right" },
  in: { x: 470, align: "right" },
  bal: { x: 550, align: "right" },
} as const;

const headerTokens = (cells: Record<string, string>) =>
  statement(layout).row(cells).build()[0].tokens;

describe("detectHeader", () => {
  it("records the right edge of each named column", () => {
    const header = detectHeader(
      headerTokens({
        date: "Date",
        desc: "Description",
        out: "Withdrawals",
        in: "Deposits",
        bal: "Balance",
      }),
    );
    expect(header?.columns.map((c) => [c.role, c.x1])).toEqual([
      ["debit", 400],
      ["credit", 470],
      ["balance", 550],
    ]);
  });

  it("reads two-word and alternative column names", () => {
    const header = detectHeader(
      headerTokens({
        date: "Date",
        desc: "Details",
        out: "Paid out",
        in: "Paid in",
        bal: "Balance",
      }),
    );
    expect(header?.columns.map((c) => [c.role, c.x1])).toEqual([
      ["debit", 400],
      ["credit", 470],
      ["balance", 550],
    ]);
    expect(
      detectHeader(
        headerTokens({ date: "Date", out: "Debit", in: "Credit" }),
      )?.columns.map((c) => c.role),
    ).toEqual(["debit", "credit"]);
    expect(
      detectHeader(
        headerTokens({
          date: "Trans date",
          desc: "Description",
          out: "Charges",
          in: "Credits",
        }),
      )?.columns.map((c) => c.role),
    ).toEqual(["debit", "credit"]);
  });

  it("accepts a single Amount column beside a Date or Description label", () => {
    expect(
      detectHeader(
        headerTokens({ date: "Date", desc: "Description", bal: "Amount" }),
      )?.columns,
    ).toEqual([{ role: "amount", x0: 514, x1: 550 }]);
  });

  it("rejects lines that are not headers", () => {
    expect(detectHeader(headerTokens({ desc: "Balance" }))).toBeNull();
    expect(
      detectHeader(headerTokens({ desc: "ACME COFFEE ROASTERS" })),
    ).toBeNull();
    expect(
      detectHeader(
        headerTokens({ desc: "DEBIT CARD PURCHASE BALANCE INQUIRY" }),
      ),
    ).toBeNull();
    expect(detectHeader([])).toBeNull();
  });
});

describe("assignColumns", () => {
  const header = {
    columns: [
      { role: "debit" as const, x0: 334, x1: 400 },
      { role: "credit" as const, x0: 422, x1: 470 },
      { role: "balance" as const, x0: 508, x1: 550 },
    ],
  };

  it("matches amounts to columns by right edge", () => {
    expect(assignColumns([400, 550], header)).toEqual(["debit", "balance"]);
    expect(assignColumns([470, 550], header)).toEqual(["credit", "balance"]);
    expect(assignColumns([403.5], header)).toEqual(["debit"]);
    expect(assignColumns([548], header)).toEqual(["balance"]);
    expect(assignColumns([], header)).toEqual([]);
  });

  it("gives up when two amounts land in the same column", () => {
    expect(assignColumns([395, 405], header)).toBeNull();
    expect(assignColumns([400], { columns: [] })).toBeNull();
  });
});

describe("clusterRightEdges", () => {
  it("groups nearby edges and sorts the clusters", () => {
    expect(clusterRightEdges([520, 430, 431, 519.5, 429, 521], 5)).toEqual([
      [429, 430, 431],
      [519.5, 520, 521],
    ]);
    expect(clusterRightEdges([], 5)).toEqual([]);
    expect(clusterRightEdges([NaN, 10], 5)).toEqual([[10]]);
  });
});

describe("analyseBalances", () => {
  it("confirms a running balance and reports each row's direction", () => {
    const result = analyseBalances([
      { amountCents: null, balanceCents: 150000 },
      { amountCents: 450, balanceCents: 149550 },
      { amountCents: 8210, balanceCents: 141340 },
      { amountCents: 210000, balanceCents: 351340 },
    ]);
    expect(result).toEqual({
      confirmed: true,
      newestFirst: false,
      directions: [null, "down", "down", "up"],
    });
  });

  it("cannot tell the first row's direction without a balance before it", () => {
    const result = analyseBalances([
      { amountCents: 450, balanceCents: 149550 },
      { amountCents: 8210, balanceCents: 141340 },
    ]);
    expect(result.confirmed).toBe(true);
    expect(result.directions).toEqual([null, "down"]);
  });

  it("handles statements that list the newest row first", () => {
    const result = analyseBalances([
      { amountCents: 210000, balanceCents: 351340 },
      { amountCents: 8210, balanceCents: 141340 },
      { amountCents: 450, balanceCents: 149550 },
      { amountCents: null, balanceCents: 150000 },
    ]);
    expect(result).toEqual({
      confirmed: true,
      newestFirst: true,
      directions: ["up", "down", "down", null],
    });
  });

  it("handles a balance printed once for several rows", () => {
    const result = analyseBalances([
      { amountCents: null, balanceCents: 100000 },
      { amountCents: 1000, balanceCents: null },
      { amountCents: 2500, balanceCents: 96500 },
      { amountCents: 500, balanceCents: null },
      { amountCents: 700, balanceCents: 96700 }, // one in, one out: cannot be told
    ]);
    expect(result.confirmed).toBe(true);
    expect(result.directions).toEqual([null, "down", "down", null, null]);
  });

  it("rejects a second column that is not a running balance", () => {
    const result = analyseBalances([
      { amountCents: 450, balanceCents: 999 },
      { amountCents: 500, balanceCents: 123 },
      { amountCents: 700, balanceCents: 4000 },
    ]);
    expect(result.confirmed).toBe(false);
  });

  it("is unconfirmed with nothing to compare", () => {
    expect(analyseBalances([]).confirmed).toBe(false);
    expect(
      analyseBalances([{ amountCents: 450, balanceCents: 999 }]).confirmed,
    ).toBe(false);
  });
});
