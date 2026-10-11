import { describe, expect, it } from "vitest";
import { centsToDecimalString, formatCents, parseAmountToCents } from "./money";

describe("parseAmountToCents", () => {
  it.each([
    ["0.10", 10],
    ["0.1", 10],
    ["0.30", 30],
    ["12", 1200],
    ["1,234.56", 123456],
    ["1234.56", 123456],
    ["$1,234.56", 123456],
    ["-12.34", -1234],
    ["-$12.34", -1234],
    ["$-12.34", -1234],
    ["12.34-", -1234],
    ["(12.34)", -1234],
    ["+5.00", 500],
    ["−12.34", -1234],
    [" 7.05 ", 705],
    ["0", 0],
  ])("parses %s", (input, expected) => {
    expect(parseAmountToCents(input)).toBe(expected);
  });

  it.each(["", "  ", "abc", "1.234", "12.3.4", "1,23.45", "$", "--5", "1e3"])(
    "rejects %j",
    (input) => {
      expect(parseAmountToCents(input)).toBeNull();
    },
  );

  it("adds dimes exactly", () => {
    expect(parseAmountToCents("0.1")! + parseAmountToCents("0.2")!).toBe(30);
  });
});

describe("formatting", () => {
  it("formats with symbol and separators", () => {
    expect(formatCents(123456)).toBe("$1,234.56");
    expect(formatCents(5)).toBe("$0.05");
    expect(formatCents(-1234)).toBe("-$12.34");
    expect(formatCents(0)).toBe("$0.00");
  });
  it("formats plain decimals", () => {
    expect(centsToDecimalString(123456)).toBe("1234.56");
    expect(centsToDecimalString(-5)).toBe("-0.05");
  });
  it("refuses fractional cents", () => {
    expect(() => formatCents(1.5)).toThrow();
  });
});
