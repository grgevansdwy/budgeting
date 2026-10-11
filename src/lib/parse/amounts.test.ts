import { describe, expect, it } from "vitest";
import { statement } from "../../test/fixtures/build";
import {
  detectCommaDecimal,
  findTrailingAmounts,
  fixConfusables,
  parseAmountToken,
} from "./amounts";

describe("parseAmountToken", () => {
  it.each([
    ["1,234.56", 123456],
    ["1234.56", 123456],
    ["$1,234.56", 123456],
    ["-12.34", -1234],
    ["-$12.34", -1234],
    ["$-12.34", -1234],
    ["12.34-", -1234],
    ["+12.34", 1234],
    ["+$12.34", 1234],
    ["(12.34)", -1234],
    ["($12.34)", -1234],
    ["−12.34", -1234], // Unicode minus
    ["–12.34", -1234], // en dash
    ["0.07", 7],
    [".50", 50],
    ["0.00", 0],
    ["-0.00", 0],
    ["1,000,000.00", 100000000],
    ["£9.99", 999],
  ])("reads %s as %i cents", (text, cents) => {
    expect(parseAmountToken(text)).toEqual({
      cents,
      marker: null,
      corrected: false,
    });
  });

  it.each([
    ["12.34 CR", 1234, "CR"],
    ["12.34CR", 1234, "CR"],
    ["12.34cr", 1234, "CR"],
    ["12.34 DR", 1234, "DR"],
    ["$1,200.00DR", 120000, "DR"],
  ])("reads %s with its marker", (text, cents, marker) => {
    expect(parseAmountToken(text)).toEqual({ cents, marker, corrected: false });
  });

  it.each([
    "555-0100", // phone number
    "555.0100",
    "5550100",
    "88120045", // reference number
    "0012345678",
    "007.50", // leading zeros: a reference, not money
    "1234", // card last four
    "12", // no decimals
    "12.3",
    "12.345",
    "1,23.45",
    "1.234.56",
    "12.34.56",
    "03/14",
    "03/14/2026",
    "2026-03-14",
    "12.34%",
    "4.5O", // only corrected for OCR text
    "CR",
    "$",
    "-",
    "",
    "ACME",
    "12,34", // comma decimal only when the file uses it
    "9999999999999999.99", // not a safe integer of cents
  ])("rejects %s", (text) => {
    expect(parseAmountToken(text)).toBeNull();
  });

  it("corrects OCR confusables inside the number only when asked", () => {
    const ocr = { ocr: true };
    expect(parseAmountToken("4.5O", ocr)).toEqual({
      cents: 450,
      marker: null,
      corrected: true,
    });
    expect(parseAmountToken("l2.OO", ocr)?.cents).toBe(1200);
    expect(parseAmountToken("-$1B.75", ocr)?.cents).toBe(-1875);
    expect(parseAmountToken("$I,2S4.56", ocr)?.cents).toBe(125456);
    expect(parseAmountToken("$62.18", ocr)).toEqual({
      cents: 6218,
      marker: null,
      corrected: false,
    });
  });

  it("treats a leading S on an OCR amount as a misread dollar sign", () => {
    expect(parseAmountToken("S12.34", { ocr: true })).toEqual({
      cents: 1234,
      marker: null,
      corrected: true,
    });
    expect(parseAmountToken("S12.34")).toBeNull();
  });

  it("does not turn OCR words into amounts", () => {
    const ocr = { ocr: true };
    expect(parseAmountToken("BOSS", ocr)).toBeNull();
    expect(parseAmountToken("ACME.CO", ocr)).toBeNull();
    expect(parseAmountToken("555-0lOO", ocr)).toBeNull();
  });

  it("reads comma-decimal amounts when the file uses them", () => {
    const comma = { commaDecimal: true };
    expect(parseAmountToken("1.234,56", comma)?.cents).toBe(123456);
    expect(parseAmountToken("-3,40", comma)?.cents).toBe(-340);
    expect(parseAmountToken("1,234.56", comma)).toBeNull();
    expect(parseAmountToken("12.03", comma)).toBeNull();
  });

  it("never returns a fractional number of cents", () => {
    for (const text of ["0.10", "0.20", "0.30", "19.99", "1,000.01", "4.35"]) {
      expect(Number.isInteger(parseAmountToken(text)?.cents)).toBe(true);
    }
    expect(parseAmountToken("4.35")?.cents).toBe(435);
    expect(parseAmountToken("1.15")?.cents).toBe(115);
  });
});

describe("findTrailingAmounts", () => {
  const layout = {
    date: { x: 40 },
    desc: { x: 110 },
    out: { x: 400, align: "right" },
    in: { x: 470, align: "right" },
    bal: { x: 550, align: "right" },
  } as const;
  const tokensOf = (
    cells: Parameters<ReturnType<typeof statement<typeof layout>>["row"]>[0],
  ) => statement(layout).row(cells).build()[0].tokens;
  const find = (cells: Parameters<typeof tokensOf>[0], from = 0) =>
    findTrailingAmounts(tokensOf(cells), { height: 10, from });

  it("finds one amount at the right end and reports its right edge", () => {
    const hits = find({ desc: "ACME COFFEE ROASTERS", out: "4.50" });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ cents: 450, x1: 400, start: 3, end: 3 });
  });

  it("finds every amount in a run of columns", () => {
    const hits = find({ desc: "ACME", out: "45.00", bal: "1,200.00" });
    expect(hits.map((h) => [h.cents, h.x1])).toEqual([
      [4500, 400],
      [120000, 550],
    ]);
  });

  it("looks past a dash that marks an empty column", () => {
    const hits = find({ desc: "ACME", out: "45.00", in: "-", bal: "1,200.00" });
    expect(hits.map((h) => h.cents)).toEqual([4500, 120000]);
  });

  it("joins a detached currency symbol, sign or CR marker to its number", () => {
    expect(find({ desc: "ACME", out: "$ 12.34" })[0]).toMatchObject({
      cents: 1234,
      start: 1,
      end: 2,
    });
    expect(find({ desc: "ACME", out: "- 12.34" })[0].cents).toBe(-1234);
    expect(find({ desc: "ACME", out: "12.34 -" })[0].cents).toBe(-1234);
    expect(find({ desc: "ACME", out: "12.34 CR" })[0]).toMatchObject({
      cents: 1234,
      marker: "CR",
    });
  });

  it("leaves a number inside the description alone", () => {
    const hits = find({ desc: "SALE 12.50 OFF COUPON", out: "30.00" });
    expect(hits.map((h) => h.cents)).toEqual([3000]);
  });

  it("ignores percentages and tokens before `from`", () => {
    expect(find({ desc: "Purchase rate 24.99 %" })).toEqual([]);
    expect(find({ desc: "Purchase rate 24.99%" })).toEqual([]);
    expect(find({ date: "12.03", desc: "ACME" }, 1)).toEqual([]);
  });

  it("returns nothing for a line with no amount", () => {
    expect(find({ desc: "Customer service 555-0100 ref 88120045" })).toEqual(
      [],
    );
    expect(findTrailingAmounts([], { height: 10 })).toEqual([]);
  });

  it("carries the lowest OCR confidence of the amount's tokens", () => {
    const tokens = statement(layout, { source: "ocr" })
      .row({ desc: "ACME", out: { text: "$ 12.34", conf: 0.4 } })
      .build()[0].tokens;
    expect(findTrailingAmounts(tokens, { height: 10, ocr: true })[0].conf).toBe(
      0.4,
    );
  });
});

describe("detectCommaDecimal", () => {
  it("is true only when comma decimals outnumber dot decimals", () => {
    expect(detectCommaDecimal(["-3,40", "+2.150,00", "54,90"])).toBe(true);
    expect(detectCommaDecimal(["3.40", "2,150.00", "54,90"])).toBe(false);
    expect(detectCommaDecimal(["1,234", "ACME", "12/03"])).toBe(false);
    expect(detectCommaDecimal([])).toBe(false);
  });
});

describe("fixConfusables", () => {
  it("maps the characters OCR confuses with digits", () => {
    expect(fixConfusables("O3/l5|I SB o")).toBe("03/1511 58 0");
  });
});
