import { describe, expect, it } from "vitest";
import {
  detectAccountType,
  matchSectionHeading,
  resolveKinds,
  type PolarityRow,
} from "./polarity";

const row = (
  signedCents: number,
  extra: Partial<PolarityRow> = {},
): PolarityRow => ({
  signedCents,
  columnKind: null,
  balanceKind: null,
  sectionKind: null,
  sectionId: null,
  marker: null,
  ...extra,
});

describe("detectAccountType", () => {
  it("recognises card and bank keywords", () => {
    expect(detectAccountType(["EXAMPLE CARD", "Credit limit $5,000.00"])).toBe(
      "card",
    );
    expect(detectAccountType(["Minimum payment due $35.00"])).toBe("card");
    expect(detectAccountType(["Everyday checking account"])).toBe("bank");
    expect(detectAccountType(["Available balance $1,204.11"])).toBe("bank");
    expect(detectAccountType(["ACME COFFEE ROASTERS 4.50"])).toBe("unknown");
    expect(detectAccountType([])).toBe("unknown");
  });

  it("is unknown when the keywords are evenly split", () => {
    expect(detectAccountType(["Credit limit", "Savings"])).toBe("unknown");
    expect(detectAccountType(["Credit limit", "Payment due", "Savings"])).toBe(
      "card",
    );
  });
});

describe("matchSectionHeading", () => {
  it.each([
    ["Payments and credits", "income"],
    ["PAYMENTS & CREDITS", "income"],
    ["Payments, credits", "income"],
    ["Payments and other credits", "income"],
    ["Deposits", "income"],
    ["Deposits and other credits", "income"],
    ["Purchases", "expense"],
    ["Purchases (continued)", "expense"],
    ["Purchases and adjustments", "expense"],
    ["Withdrawals", "expense"],
    ["Withdrawals and other debits", "expense"],
    ["ATM & debit card withdrawals", "expense"],
    ["Fees", "expense"],
    ["Fees charged", "expense"],
    ["Interest charged", "expense"],
    ["Transactions", "neutral"],
    ["Transactions (continued)", "neutral"],
    ["Account activity", "neutral"],
  ])("reads %s as %s", (text, kind) => {
    expect(matchSectionHeading(text)).toBe(kind);
  });

  it.each([
    "ACME COFFEE ROASTERS",
    "SEATTLE WA",
    "Total purchases",
    "Purchases at ACME",
    "Date Description Amount",
    "",
  ])("does not treat %s as a heading", (text) => {
    expect(matchSectionHeading(text)).toBeNull();
  });
});

describe("resolveKinds", () => {
  const kinds = (
    rows: PolarityRow[],
    type: Parameters<typeof resolveKinds>[1] = "unknown",
  ) => resolveKinds(rows, type).map((r) => r.kind);

  it("rule 1: debit and credit columns win over everything else", () => {
    const result = resolveKinds(
      [
        row(-500, {
          columnKind: "income",
          balanceKind: "expense",
          marker: "DR",
        }),
        row(500, {
          columnKind: "expense",
          sectionKind: "income",
          sectionId: 1,
        }),
      ],
      "card",
    );
    expect(result).toEqual([
      { kind: "income", rule: "columns", guessed: false },
      { kind: "expense", rule: "columns", guessed: false },
    ]);
  });

  it("rule 2: the running balance decides, ahead of sections and markers", () => {
    const result = resolveKinds(
      [
        row(500, {
          balanceKind: "income",
          sectionKind: "expense",
          sectionId: 1,
          marker: "DR",
        }),
      ],
      "card",
    );
    expect(result).toEqual([
      { kind: "income", rule: "balance", guessed: false },
    ]);
  });

  it("rule 2: rows the balance could not settle follow the sign convention it proved", () => {
    expect(
      resolveKinds(
        [
          row(-450), // first row: no balance before it
          row(-8210, { balanceKind: "expense" }),
          row(210000, { balanceKind: "income" }),
        ],
        "unknown",
      )[0],
    ).toEqual({ kind: "expense", rule: "balance", guessed: false });
  });

  it("rule 2: unsigned amounts prove no convention", () => {
    expect(
      resolveKinds(
        [
          row(450),
          row(8210, { balanceKind: "expense" }),
          row(210000, { balanceKind: "income" }),
        ],
        "unknown",
      )[0],
    ).toEqual({ kind: "expense", rule: "majority", guessed: true });
  });

  it("rule 3: section headings decide, whatever the sign style", () => {
    const payments = { sectionKind: "income" as const, sectionId: 1 };
    const purchases = { sectionKind: "expense" as const, sectionId: 2 };
    // Card style: payments printed negative.
    expect(
      kinds(
        [row(-25000, payments), row(-1240, payments), row(475, purchases)],
        "card",
      ),
    ).toEqual(["income", "income", "expense"]);
    // Payments printed positive under their heading.
    expect(kinds([row(25000, payments), row(475, purchases)], "card")).toEqual([
      "income",
      "expense",
    ]);
    // Bank style: withdrawals printed positive under their heading.
    expect(
      kinds([row(6420, purchases), row(185000, payments)], "bank"),
    ).toEqual(["expense", "income"]);
  });

  it("rule 3: a row with the opposite sign to its section goes the other way", () => {
    const purchases = { sectionKind: "expense" as const, sectionId: 1 };
    expect(
      kinds(
        [row(475, purchases), row(8613, purchases), row(-2000, purchases)],
        "unknown",
      ),
    ).toEqual(["expense", "expense", "income"]);
  });

  it("rule 3: an evenly split section uses the account type, else the heading", () => {
    const purchases = { sectionKind: "expense" as const, sectionId: 1 };
    const rows = [row(475, purchases), row(-2000, purchases)];
    expect(kinds(rows, "card")).toEqual(["expense", "income"]);
    expect(kinds(rows, "unknown")).toEqual(["expense", "expense"]);
  });

  it("rule 4: CR is income, DR or unmarked beside CR rows is expense", () => {
    const result = resolveKinds(
      [row(380), row(120000, { marker: "CR" }), row(4510, { marker: "DR" })],
      "unknown",
    );
    expect(result.map((r) => r.kind)).toEqual(["expense", "income", "expense"]);
    expect(result.every((r) => r.rule === "marker" && !r.guessed)).toBe(true);
  });

  it("rule 4: DR alone settles only its own row", () => {
    const result = resolveKinds(
      [row(380), row(4510, { marker: "DR" })],
      "unknown",
    );
    expect(result[1]).toEqual({
      kind: "expense",
      rule: "marker",
      guessed: false,
    });
    expect(result[0].rule).toBe("majority");
  });

  it("rule 5: on a card positive is an expense and negative is income", () => {
    const result = resolveKinds([row(475), row(-25000)], "card");
    expect(result).toEqual([
      { kind: "expense", rule: "account-type", guessed: false },
      { kind: "income", rule: "account-type", guessed: false },
    ]);
  });

  it("rule 5: on a bank account negative is an expense and positive is income", () => {
    const result = resolveKinds([row(-340), row(215000)], "bank");
    expect(result).toEqual([
      { kind: "expense", rule: "account-type", guessed: false },
      { kind: "income", rule: "account-type", guessed: false },
    ]);
  });

  it("rule 5 does not apply to a bank file with no negative amounts", () => {
    const result = resolveKinds([row(340), row(215000)], "bank");
    expect(result.every((r) => r.kind === "expense" && r.guessed)).toBe(true);
  });

  it("rule 6: the majority sign is the expense, flagged as a guess", () => {
    expect(resolveKinds([row(450), row(600), row(-2000)], "unknown")).toEqual([
      { kind: "expense", rule: "majority", guessed: true },
      { kind: "expense", rule: "majority", guessed: true },
      { kind: "income", rule: "majority", guessed: true },
    ]);
    expect(kinds([row(-450), row(-600), row(2000)])).toEqual([
      "expense",
      "expense",
      "income",
    ]);
    // A tie reads positive as the expense.
    expect(kinds([row(450), row(-2000)])).toEqual(["expense", "income"]);
  });

  it("returns nothing for no rows", () => {
    expect(resolveKinds([], "card")).toEqual([]);
  });
});
