import { describe, expect, it } from "vitest";
import { isOpeningBalanceLine, isStopLine } from "./stopPhrases";

describe("isStopLine", () => {
  it.each([
    "Opening balance 1,500.00",
    "01/01/2026 Beginning balance 2,000.00",
    "Closing balance 2,263.77",
    "01/31/2026 Ending balance 3,612.75",
    "Previous balance $412.18",
    "Balance forward 88.10",
    "BALANCE BROUGHT FORWARD 88.10",
    "New balance 177.42",
    "Total purchases $1,147.87",
    "Totals 244.75 1,857.50",
    "02/28/2026 Total fees charged in 2026 0.00",
    "02/20/2026 Subtotal 103.55",
    "Sub total 103.55",
    "Minimum payment due $35.00",
    "Payment due date 04/15/2026",
    "Page 1 of 2",
    "EXAMPLE CARD SERVICES Page 2 of 3",
    "Page l of 2", // OCR
    "Transactions continued on next page",
    "Credit limit $5,000.00",
    "Available balance $1,204.11",
    "Statement period 12/15/2025 - 01/14/2026",
    "Statement closing date 03/20/2026",
  ])("skips %s", (text) => {
    expect(isStopLine(text, /^\d/.test(text))).toBe(true);
  });

  it.each([
    "03/14 ACME COFFEE ROASTERS 4.50",
    "02/15/2026 PAYMENT THANK YOU -150.00",
    "SEATTLE WA",
    "Payments and credits",
    "Date Description Withdrawals Deposits Balance",
    "03/05 FICTIONAL FUEL STOP 17 41.00",
    "01/22/2026 SAMPLE CAFE REFUND 7.50",
    "",
  ])("keeps %s", (text) => {
    expect(isStopLine(text, /^\d/.test(text))).toBe(false);
  });

  it("keeps a dated merchant whose name starts with Total, but not an undated one", () => {
    const line = "TOTAL FAKE WINES 007 31.50";
    expect(isStopLine(`02/07/2026 ${line}`, true)).toBe(false);
    expect(isStopLine(line, false)).toBe(true);
  });
});

describe("isOpeningBalanceLine", () => {
  it("recognises the balance before the first transaction", () => {
    expect(isOpeningBalanceLine("Opening balance 1,500.00")).toBe(true);
    expect(isOpeningBalanceLine("Previous balance $412.18")).toBe(true);
    expect(isOpeningBalanceLine("01/01/2026 Beginning balance 2,000.00")).toBe(
      true,
    );
    expect(isOpeningBalanceLine("Balance brought forward 10.00")).toBe(true);
    expect(isOpeningBalanceLine("Closing balance 2,263.77")).toBe(false);
    expect(isOpeningBalanceLine("New balance 177.42")).toBe(false);
  });
});
