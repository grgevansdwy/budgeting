import { describe, expect, it } from "vitest";
import type { TextLine } from "../extract/types";
import type { ParsedTransaction } from "../types";
import { bankColumnsLines } from "../../test/fixtures/bankColumns";
import { bankRunningBalanceLines } from "../../test/fixtures/bankRunningBalance";
import { statement } from "../../test/fixtures/build";
import { cardStatementLines } from "../../test/fixtures/cardStatement";
import { crSuffixLines } from "../../test/fixtures/crSuffix";
import { dayFirstLines } from "../../test/fixtures/dayFirst";
import { noiseLines } from "../../test/fixtures/noise";
import { noisyOcrLines } from "../../test/fixtures/noisyOcr";
import { wrappedLines } from "../../test/fixtures/wrapped";
import {
  yearlessDecJanLines,
  yearlessNoAnchorLines,
} from "../../test/fixtures/yearlessDecJan";
import { parseStatement, type ParseOptions } from "./lineParser";

const OPTIONS: ParseOptions = { dateOrder: "auto", fallbackDate: "2026-04-01" };

/** The fields every fixture test pins down exactly. */
const exact = (rows: ParsedTransaction[]) =>
  rows.map((r) => [r.date, r.description, r.amountCents, r.kind, r.flags]);

const descriptions = (rows: ParsedTransaction[]) =>
  rows.map((r) => r.description).join("\n");

const simple = {
  date: { x: 40 },
  desc: { x: 120 },
  amount: { x: 430, align: "right" },
  bal: { x: 520, align: "right" },
} as const;

describe("parseStatement: fixtures", () => {
  it("card statement with signed amounts and a Payments and credits section", () => {
    const result = parseStatement(cardStatementLines, OPTIONS);
    expect(result.accountType).toBe("card");
    expect(result.detectedDateOrder).toBe("MDY");
    expect(exact(result.rows)).toEqual([
      ["2026-02-25", "ONLINE PAYMENT THANK YOU", 25000, "income", []],
      ["2026-03-02", "EXAMPLE GROCER 042 REFUND", 1240, "income", []],
      ["2026-02-22", "ACME COFFEE ROASTERS", 475, "expense", []],
      ["2026-02-27", "EXAMPLE GROCER 042", 8613, "expense", []],
      ["2026-03-05", "FICTIONAL FUEL STOP 17", 4100, "expense", []],
      ["2026-03-11", "SAMPLE FURNITURE WAREHOUSE", 101599, "expense", []],
      ["2026-03-20", "LATE FEE", 2900, "expense", []],
    ]);
    expect(result.rows.every((r) => r.confidence === 1 && r.page === 1)).toBe(
      true,
    );
    // The posting date is dropped from the description and kept in the raw text.
    expect(result.rows[0].rawText).toBe(
      "02/25 02/26 ONLINE PAYMENT THANK YOU -$250.00",
    );
    expect(descriptions(result.rows)).not.toMatch(
      /total|balance|minimum|limit|interest|page|02\/26/i,
    );
  });

  it("bank statement with Withdrawals / Deposits / Balance columns", () => {
    const result = parseStatement(bankColumnsLines, OPTIONS);
    expect(result.accountType).toBe("bank");
    expect(result.detectedDateOrder).toBe("MDY");
    expect(exact(result.rows)).toEqual([
      ["2026-01-03", "EXAMPLE GROCER 042", 6420, "expense", []],
      ["2026-01-05", "ACME PAYROLL DIRECT DEPOSIT", 185000, "income", []],
      ["2026-01-09", "FICTIONAL POWER AND LIGHT", 12055, "expense", []],
      ["2026-01-15", "ATM CASH", 6000, "expense", []],
      ["2026-01-22", "SAMPLE CAFE REFUND", 750, "income", []],
    ]);
    expect(result.rows.every((r) => r.confidence === 1)).toBe(true);
    // Balances are never taken as amounts, and balance-only lines are not rows.
    expect(result.rows.map((r) => r.amountCents)).not.toContain(360525);
    expect(descriptions(result.rows)).not.toMatch(/balance|ledger|total/i);
  });

  it("bank statement with unsigned amounts and a running balance, no header", () => {
    const result = parseStatement(bankRunningBalanceLines, OPTIONS);
    expect(result.accountType).toBe("bank");
    expect(result.detectedDateOrder).toBeNull();
    expect(exact(result.rows)).toEqual([
      ["2026-02-02", "ACME COFFEE ROASTERS", 450, "expense", []],
      ["2026-02-03", "EXAMPLE GROCER 042", 8210, "expense", []],
      ["2026-02-06", "SAMPLE EMPLOYER PAYROLL", 210000, "income", []],
      ["2026-02-10", "MADE UP RENT CO", 125000, "expense", []],
      ["2026-02-14", "INTEREST PAID", 37, "income", []],
    ]);
    expect(descriptions(result.rows)).not.toMatch(/balance/i);
  });

  it("statement with CR / DR suffixes and month-name dates", () => {
    const result = parseStatement(crSuffixLines, OPTIONS);
    expect(result.accountType).toBe("unknown");
    expect(result.detectedDateOrder).toBeNull();
    expect(exact(result.rows)).toEqual([
      ["2026-03-12", "ACME COFFEE ROASTERS", 380, "expense", []],
      ["2026-03-13", "SAMPLE WAGES LTD", 120000, "income", []],
      ["2026-03-15", "EXAMPLE GROCER 042", 4510, "expense", []],
      ["2026-03-18", "MADE UP BOOKSHOP REFUND", 1250, "income", []],
      ["2026-03-20", "FICTIONAL RAIL TICKETS", 2700, "expense", []],
    ]);
    expect(descriptions(result.rows)).not.toMatch(/\b(CR|DR)\b/);
  });

  it("yearless December to January statement takes its years from the period", () => {
    const result = parseStatement(yearlessDecJanLines, OPTIONS);
    expect(result.accountType).toBe("card");
    expect(result.detectedDateOrder).toBe("MDY");
    expect(exact(result.rows)).toEqual([
      ["2025-12-16", "ACME COFFEE ROASTERS", 525, "expense", []],
      ["2025-12-24", "MADE UP TOY EMPORIUM", 14800, "expense", []],
      ["2025-12-31", "EXAMPLE GROCER 042", 7319, "expense", []],
      ["2026-01-02", "FICTIONAL GYM MEMBERSHIP", 3900, "expense", []],
      ["2026-01-09", "PAYMENT RECEIVED THANK YOU", 30000, "income", []],
      ["2026-01-13", "SAMPLE PHARMACY 009", 1248, "expense", []],
    ]);
  });

  it("yearless statement with no dated anchor uses the fallback date and says so", () => {
    const result = parseStatement(yearlessNoAnchorLines, {
      dateOrder: "auto",
      fallbackDate: "2026-01-20",
    });
    expect(exact(result.rows)).toEqual([
      ["2025-12-16", "ACME COFFEE ROASTERS", 525, "expense", ["year-inferred"]],
      [
        "2025-12-24",
        "MADE UP TOY EMPORIUM",
        14800,
        "expense",
        ["year-inferred"],
      ],
      ["2025-12-31", "EXAMPLE GROCER 042", 7319, "expense", ["year-inferred"]],
      [
        "2026-01-02",
        "FICTIONAL GYM MEMBERSHIP",
        3900,
        "expense",
        ["year-inferred"],
      ],
      [
        "2026-01-09",
        "PAYMENT RECEIVED THANK YOU",
        30000,
        "income",
        ["year-inferred"],
      ],
      ["2026-01-13", "SAMPLE PHARMACY 009", 1248, "expense", ["year-inferred"]],
    ]);
    expect(result.rows.every((r) => r.confidence === 0.8)).toBe(true);

    // The same file read eleven months later lands a year on.
    const later = parseStatement(yearlessNoAnchorLines, {
      dateOrder: "auto",
      fallbackDate: "2026-12-20",
    });
    expect(later.rows.map((r) => r.date)).toEqual([
      "2026-12-16",
      "2026-12-24",
      "2025-12-31",
      "2026-01-02",
      "2026-01-09",
      "2026-01-13",
    ]);
  });

  it("wrapped descriptions and rows split over a date line and an amount line", () => {
    const result = parseStatement(wrappedLines, OPTIONS);
    expect(result.accountType).toBe("unknown");
    const merged = ["sign-guessed", "multiline-merged"];
    expect(exact(result.rows)).toEqual([
      ["2026-03-14", "ACME COFFEE ROASTERS SEATTLE WA", 450, "expense", merged],
      [
        "2026-03-15",
        "FICTIONAL AIRWAYS TICKET 0012345678 PASSENGER EXAMPLE TRAVELLER",
        31240,
        "expense",
        merged,
      ],
      ["2026-03-16", "EXAMPLE GROCER 042", 5807, "expense", ["sign-guessed"]],
      ["2026-03-18", "SAMPLE HARDWARE", 2399, "expense", merged],
      ["2026-03-19", "MADE UP PARKING", 600, "expense", ["sign-guessed"]],
      ["2026-03-20", "FICTIONAL BOOKS ONLINE ORDER", 1825, "expense", merged],
    ]);
    expect(result.rows.map((r) => r.confidence)).toEqual([
      0.7, 0.7, 0.75, 0.7, 0.75, 0.7,
    ]);
    expect(result.rows[0].rawText).toBe(
      "03/14/2026 ACME COFFEE ROASTERS 4.50 SEATTLE WA",
    );
    // The third wrapped line, the distant note and the left-margin note are not merged.
    expect(descriptions(result.rows)).not.toMatch(
      /ROUTE|Thank you|Questions|555/,
    );
  });

  it("noisy OCR sample with confusable characters and low confidences", () => {
    const result = parseStatement(noisyOcrLines, OPTIONS);
    expect(result.accountType).toBe("bank");
    expect(result.detectedDateOrder).toBe("MDY");
    expect(exact(result.rows)).toEqual([
      ["2026-03-15", "ACME COFFEE ROASTERS", 450, "expense", ["ocr-corrected"]],
      ["2026-03-16", "EXAMPLE GROCER 042", 6218, "expense", []],
      // The description is left exactly as OCR read it; only date and amount are corrected.
      [
        "2026-03-17",
        "FlCTlONAL FUEL ST0P",
        4100,
        "expense",
        ["ocr-low", "ocr-corrected"],
      ],
      [
        "2026-03-18",
        "SAMPLE EMPLOYER PAYROLL",
        185000,
        "income",
        ["ocr-corrected"],
      ],
      ["2026-03-19", "MADE UP TRANSIT", 275, "expense", []],
    ]);
    const confidences = result.rows.map((r) => r.confidence);
    expect(confidences[0]).toBeCloseTo(0.93 - 0.15, 4);
    expect(confidences[1]).toBeCloseTo(0.96, 4);
    expect(confidences[2]).toBeCloseTo(0.53 - 0.15, 4);
    expect(confidences[3]).toBeCloseTo(0.96 - 0.15, 4);
    expect(confidences[4]).toBeCloseTo(0.96, 4);
    expect(descriptions(result.rows)).not.toMatch(/page|balance/i);
  });

  it("day-first statement with several minus styles", () => {
    const result = parseStatement(dayFirstLines, OPTIONS);
    expect(result.accountType).toBe("bank");
    expect(result.detectedDateOrder).toBe("DMY");
    expect(exact(result.rows)).toEqual([
      ["2026-03-02", "ACME COFFEE ROASTERS", 340, "expense", []],
      ["2026-03-05", "SAMPLE EMPLOYER SALARY", 215000, "income", []],
      ["2026-03-13", "EXAMPLE GROCER 042", 5490, "expense", []],
      ["2026-03-27", "FICTIONAL ENERGY CO", 8900, "expense", []],
      ["2026-03-30", "MADE UP CINEMA", 1200, "expense", []],
    ]);
  });

  it("statement full of header, footer and total lines", () => {
    const result = parseStatement(noiseLines, OPTIONS);
    expect(result.accountType).toBe("card");
    expect(exact(result.rows)).toEqual([
      ["2026-02-03", "ACME COFFEE ROASTERS", 425, "expense", []],
      ["2026-02-07", "TOTAL FAKE WINES 007", 3150, "expense", []],
      ["2026-02-11", "EXAMPLE GROCER 042 REF 88120045", 6780, "expense", []],
      ["2026-02-15", "PAYMENT THANK YOU", 15000, "income", []],
      ["2026-02-21", "SAMPLE CINEMA 555-0199", 2200, "expense", []],
    ]);
    expect(result.rows.map((r) => r.page)).toEqual([1, 1, 1, 1, 2]);
    expect(descriptions(result.rows)).not.toMatch(
      /balance|subtotal|total fees|minimum|page|continued|limit|rate|promo|service|ending/i,
    );
    // None of the skipped lines' amounts leak through.
    for (const cents of [20137, 10355, 17742, 2500, 12555, 2499, 0]) {
      expect(result.rows.map((r) => r.amountCents)).not.toContain(cents);
    }
  });

  it("every fixture row has a positive integer amount and a confidence in 0..1", () => {
    const all = [
      cardStatementLines,
      bankColumnsLines,
      bankRunningBalanceLines,
      crSuffixLines,
      yearlessDecJanLines,
      wrappedLines,
      noisyOcrLines,
      dayFirstLines,
      noiseLines,
    ].flatMap((lines) => parseStatement(lines, OPTIONS).rows);
    expect(all.length).toBeGreaterThan(40);
    for (const row of all) {
      expect(Number.isSafeInteger(row.amountCents)).toBe(true);
      expect(row.amountCents).toBeGreaterThan(0);
      expect(row.confidence).toBeGreaterThanOrEqual(0);
      expect(row.confidence).toBeLessThanOrEqual(1);
      expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("parseStatement: options", () => {
  it("flipKinds swaps expense and income for every row", () => {
    const normal = parseStatement(crSuffixLines, OPTIONS).rows;
    const flipped = parseStatement(crSuffixLines, {
      ...OPTIONS,
      flipKinds: true,
    }).rows;
    expect(flipped.map((r) => r.kind)).toEqual([
      "income",
      "expense",
      "income",
      "expense",
      "income",
    ]);
    expect(flipped.map((r) => r.amountCents)).toEqual(
      normal.map((r) => r.amountCents),
    );
  });

  const ambiguous = statement(simple)
    .row({ date: "03/04/2026", desc: "ACME COFFEE ROASTERS", amount: "-4.50" })
    .row({ date: "05/05/2026", desc: "EXAMPLE GROCER 042", amount: "-20.00" })
    .build();

  it("falls back to MDY and flags the row when nothing settles the date order", () => {
    const result = parseStatement(ambiguous, OPTIONS);
    expect(result.detectedDateOrder).toBeNull();
    expect(exact(result.rows)).toEqual([
      [
        "2026-03-04",
        "ACME COFFEE ROASTERS",
        450,
        "expense",
        ["date-order-ambiguous", "sign-guessed"],
      ],
      // 05/05 reads the same either way, so it is not flagged.
      ["2026-05-05", "EXAMPLE GROCER 042", 2000, "expense", ["sign-guessed"]],
    ]);
    expect(result.rows[0].confidence).toBe(0.55);
  });

  it("uses the user's date order when the file gives no evidence", () => {
    const result = parseStatement(ambiguous, { ...OPTIONS, dateOrder: "DMY" });
    expect(result.detectedDateOrder).toBeNull();
    expect(result.rows.map((r) => [r.date, r.flags])).toEqual([
      ["2026-04-03", ["sign-guessed"]],
      ["2026-05-05", ["sign-guessed"]],
    ]);
  });

  it("lets the file overrule a date order that would make its dates impossible", () => {
    const result = parseStatement(dayFirstLines, {
      ...OPTIONS,
      dateOrder: "MDY",
    });
    expect(result.detectedDateOrder).toBe("DMY");
    expect(result.rows.map((r) => r.date)).toEqual([
      "2026-03-02",
      "2026-03-05",
      "2026-03-13",
      "2026-03-27",
      "2026-03-30",
    ]);
  });
});

describe("parseStatement: columns and direction", () => {
  it("takes the leftmost amount and flags the row when a second column is not a balance", () => {
    const lines = statement(simple)
      .row({
        date: "03/14/2026",
        desc: "ACME COFFEE ROASTERS",
        amount: "4.50",
        bal: "9.99",
      })
      .row({
        date: "03/15/2026",
        desc: "EXAMPLE GROCER 042",
        amount: "5.00",
        bal: "1.23",
      })
      .build();
    expect(exact(parseStatement(lines, OPTIONS).rows)).toEqual([
      [
        "2026-03-14",
        "ACME COFFEE ROASTERS",
        450,
        "expense",
        ["sign-guessed", "columns-ambiguous"],
      ],
      [
        "2026-03-15",
        "EXAMPLE GROCER 042",
        500,
        "expense",
        ["sign-guessed", "columns-ambiguous"],
      ],
    ]);
  });

  it("reads a newest-first list with a running balance", () => {
    const lines = statement(simple)
      .row({
        date: "2026-02-10",
        desc: "MADE UP RENT CO",
        amount: "1,250.00",
        bal: "2,263.40",
      })
      .row({
        date: "2026-02-06",
        desc: "SAMPLE EMPLOYER PAYROLL",
        amount: "2,100.00",
        bal: "3,513.40",
      })
      .row({
        date: "2026-02-03",
        desc: "EXAMPLE GROCER 042",
        amount: "82.10",
        bal: "1,413.40",
      })
      .row({
        date: "2026-02-02",
        desc: "ACME COFFEE ROASTERS",
        amount: "4.50",
        bal: "1,495.50",
      })
      .row({ desc: "Opening balance", bal: "1,500.00" })
      .build();
    expect(exact(parseStatement(lines, OPTIONS).rows)).toEqual([
      ["2026-02-10", "MADE UP RENT CO", 125000, "expense", []],
      ["2026-02-06", "SAMPLE EMPLOYER PAYROLL", 210000, "income", []],
      ["2026-02-03", "EXAMPLE GROCER 042", 8210, "expense", []],
      ["2026-02-02", "ACME COFFEE ROASTERS", 450, "expense", []],
    ]);
  });

  it("guesses the first row when there is no balance before it", () => {
    const lines = statement(simple)
      .row({
        date: "2026-02-02",
        desc: "ACME COFFEE ROASTERS",
        amount: "4.50",
        bal: "1,495.50",
      })
      .row({
        date: "2026-02-03",
        desc: "EXAMPLE GROCER 042",
        amount: "82.10",
        bal: "1,413.40",
      })
      .row({
        date: "2026-02-06",
        desc: "SAMPLE EMPLOYER PAYROLL",
        amount: "2,100.00",
        bal: "3,513.40",
      })
      .build();
    expect(exact(parseStatement(lines, OPTIONS).rows)).toEqual([
      ["2026-02-02", "ACME COFFEE ROASTERS", 450, "expense", ["sign-guessed"]],
      ["2026-02-03", "EXAMPLE GROCER 042", 8210, "expense", []],
      ["2026-02-06", "SAMPLE EMPLOYER PAYROLL", 210000, "income", []],
    ]);
  });

  it("treats a refund listed under Purchases as income", () => {
    const lines = statement(simple)
      .text("Credit limit $1,000.00")
      .text("Purchases")
      .row({ date: "03/14/2026", desc: "ACME COFFEE ROASTERS", amount: "4.50" })
      .row({ date: "03/15/2026", desc: "EXAMPLE GROCER 042", amount: "58.07" })
      .row({
        date: "03/16/2026",
        desc: "EXAMPLE GROCER 042 RETURN",
        amount: "-20.00",
      })
      .build();
    expect(
      parseStatement(lines, OPTIONS).rows.map((r) => [r.amountCents, r.kind]),
    ).toEqual([
      [450, "expense"],
      [5807, "expense"],
      [2000, "income"],
    ]);
  });

  it("does not treat an empty-column dash as a minus sign", () => {
    const layout = {
      date: { x: 40 },
      desc: { x: 110 },
      out: { x: 400, align: "right" },
      in: { x: 470, align: "right" },
      bal: { x: 550, align: "right" },
    } as const;
    const lines = statement(layout)
      .row({
        date: "Date",
        desc: "Details",
        out: "Paid out",
        in: "Paid in",
        bal: "Balance",
      })
      .row({
        date: "14/03/2026",
        desc: "ACME COFFEE ROASTERS",
        out: "4.50",
        in: "-",
        bal: "95.50",
      })
      .row({
        date: "15/03/2026",
        desc: "SAMPLE WAGES LTD",
        out: "-",
        in: "900.00",
        bal: "995.50",
      })
      .build();
    expect(exact(parseStatement(lines, OPTIONS).rows)).toEqual([
      ["2026-03-14", "ACME COFFEE ROASTERS", 450, "expense", []],
      ["2026-03-15", "SAMPLE WAGES LTD", 90000, "income", []],
    ]);
  });

  it("reads comma-decimal amounts when the file uses them", () => {
    const lines = statement(simple)
      .row({
        date: "12.03.2026",
        desc: "ACME COFFEE ROASTERS",
        amount: "-3,40",
      })
      .row({ date: "15.03.2026", desc: "SAMPLE EMPLOYER", amount: "+2.150,00" })
      .row({ date: "16.03.2026", desc: "EXAMPLE GROCER 042", amount: "-54,90" })
      .build();
    const result = parseStatement(lines, OPTIONS);
    expect(result.detectedDateOrder).toBe("DMY");
    expect(exact(result.rows)).toEqual([
      ["2026-03-12", "ACME COFFEE ROASTERS", 340, "expense", ["sign-guessed"]],
      ["2026-03-15", "SAMPLE EMPLOYER", 215000, "income", ["sign-guessed"]],
      ["2026-03-16", "EXAMPLE GROCER 042", 5490, "expense", ["sign-guessed"]],
    ]);
  });
});

describe("parseStatement: dates", () => {
  it("flags rows outside the stated statement period", () => {
    const lines = statement(simple)
      .text("Statement period 01/01/2026 - 01/31/2026")
      .text("Credit limit $1,000.00")
      .row({ date: "01/15/2026", desc: "ACME COFFEE ROASTERS", amount: "4.50" })
      .row({ date: "03/15/2025", desc: "EXAMPLE GROCER 042", amount: "58.07" })
      .build();
    const result = parseStatement(lines, OPTIONS);
    expect(result.rows.map((r) => [r.date, r.flags, r.confidence])).toEqual([
      ["2026-01-15", [], 1],
      ["2025-03-15", ["outside-period"], 0.7],
    ]);
  });

  it("finds 29 February in the right year and drops impossible dates", () => {
    const lines = statement(simple)
      .text("Credit limit $1,000.00")
      .text("Closing date 01/15/2025")
      .row({ date: "02/29", desc: "ACME COFFEE ROASTERS", amount: "4.50" })
      .row({ date: "02/30", desc: "EXAMPLE GROCER 042", amount: "58.07" })
      .row({ date: "02/30/2025", desc: "SAMPLE HARDWARE", amount: "9.00" })
      .build();
    expect(
      parseStatement(lines, OPTIONS).rows.map((r) => [r.date, r.description]),
    ).toEqual([["2024-02-29", "ACME COFFEE ROASTERS"]]);
  });

  it("skips a bullet before the date and reads the amount of an amount-only line", () => {
    const lines = statement(simple)
      .text("Credit limit $1,000.00")
      .row({ date: "• 03/14/2026", desc: "ACME COFFEE ROASTERS" })
      // 12.03 could be a date; alone on a line under a dated line it is the amount.
      .row({ amount: "12.03" })
      .build();
    expect(exact(parseStatement(lines, OPTIONS).rows)).toEqual([
      [
        "2026-03-14",
        "ACME COFFEE ROASTERS",
        1203,
        "expense",
        ["multiline-merged"],
      ],
    ]);
  });
});

describe("parseStatement: descriptions", () => {
  it("flags an empty or very short description", () => {
    const lines = statement(simple)
      .text("Credit limit $1,000.00")
      .row({ date: "03/14/2026", amount: "4.50" })
      .row({ date: "03/15/2026", desc: "A1", amount: "5.00" })
      .row({ date: "03/16/2026", desc: "- * -", amount: "6.00" })
      .row({ date: "03/17/2026", desc: "ABC", amount: "7.00" })
      .build();
    expect(exact(parseStatement(lines, OPTIONS).rows)).toEqual([
      ["2026-03-14", "", 450, "expense", ["weak-description"]],
      ["2026-03-15", "A1", 500, "expense", ["weak-description"]],
      ["2026-03-16", "", 600, "expense", ["weak-description"]],
      ["2026-03-17", "ABC", 700, "expense", []],
    ]);
  });

  it("does not merge a line from the next page into a description", () => {
    const lines = statement(simple)
      .text("Credit limit $1,000.00")
      .row({ date: "03/14/2026", desc: "ACME COFFEE ROASTERS", amount: "4.50" })
      .newPage()
      .row({ desc: "EXAMPLE FOOTNOTE" })
      .build();
    expect(
      parseStatement(lines, OPTIONS).rows.map((r) => r.description),
    ).toEqual(["ACME COFFEE ROASTERS"]);
  });
});

describe("parseStatement: defensive input handling", () => {
  it("returns no rows for empty or non-array input", () => {
    const empty = { rows: [], detectedDateOrder: null, accountType: "unknown" };
    expect(parseStatement([], OPTIONS)).toEqual(empty);
    expect(parseStatement(null as never, OPTIONS)).toEqual(empty);
    expect(parseStatement(undefined as never, undefined as never)).toEqual(
      empty,
    );
    expect(parseStatement("03/14/2026 ACME 4.50" as never, OPTIONS)).toEqual(
      empty,
    );
  });

  it("ignores malformed lines and tokens without throwing", () => {
    const good = statement(simple)
      .text("Credit limit $1,000.00")
      .row({ date: "03/14/2026", desc: "ACME COFFEE ROASTERS", amount: "4.50" })
      .build();
    const garbage = [
      null,
      42,
      "text",
      {},
      { tokens: "nope" },
      { tokens: [null, 7, { text: 5 }, { text: "   " }] },
      { text: "", tokens: [], y: NaN, height: -1, page: 0, source: "fax" },
      { tokens: [{ text: "\u0000�", x0: NaN, x1: Infinity }], y: "top" },
      { tokens: [{ text: "99/99/9999" }, { text: "1e9.00" }, { text: "$$$" }] },
    ] as unknown as TextLine[];
    const result = parseStatement([...garbage, ...good, ...garbage], {
      dateOrder: "sideways" as never,
      fallbackDate: "not a date",
    });
    expect(exact(result.rows)).toEqual([
      ["2026-03-14", "ACME COFFEE ROASTERS", 450, "expense", []],
    ]);
  });

  it("copes with missing coordinates, text-only lines and whole-phrase tokens", () => {
    const lines = [
      { text: "Credit limit $1,000.00" },
      // No tokens at all: built from the text.
      { text: "03/14/2026 ACME COFFEE ROASTERS 4.50" },
      // One token holding several words, as pdf.js often emits.
      {
        text: "03/15/2026 EXAMPLE GROCER 042 58.07",
        tokens: [
          { text: "03/15/2026 EXAMPLE GROCER 042", x0: 40, x1: 214 },
          { text: "58.07", x0: 400, x1: 430 },
        ],
        y: 60,
        height: 10,
        page: 1,
        source: "pdf",
      },
      // Tokens with no coordinates.
      {
        tokens: [
          { text: "03/16/2026" },
          { text: "SAMPLE" },
          { text: "HARDWARE" },
          { text: "9.00" },
        ],
      },
    ] as unknown as TextLine[];
    expect(exact(parseStatement(lines, OPTIONS).rows)).toEqual([
      ["2026-03-14", "ACME COFFEE ROASTERS", 450, "expense", []],
      ["2026-03-15", "EXAMPLE GROCER 042", 5807, "expense", []],
      ["2026-03-16", "SAMPLE HARDWARE", 900, "expense", []],
    ]);
  });

  it("does not mutate its input", () => {
    const before = JSON.stringify(cardStatementLines);
    parseStatement(cardStatementLines, OPTIONS);
    expect(JSON.stringify(cardStatementLines)).toBe(before);
  });
});
