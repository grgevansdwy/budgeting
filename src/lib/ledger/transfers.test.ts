import { describe, expect, it } from "vitest";
import type { Transaction } from "../types";
import { tagTransfers } from "./transfers";

let seq = 0;
function tx(over: Partial<Transaction> = {}): Transaction {
  seq += 1;
  return {
    id: `t${seq}`,
    sourceFileId: "card",
    sourceFileName: "fake-card.pdf",
    page: 1,
    rawText: "",
    date: "2026-10-10",
    description: "Fake Merchant",
    amountCents: 1000,
    kind: "expense",
    categoryId: "other",
    isTransfer: false,
    transferReason: null,
    duplicateDismissed: false,
    confidence: 1,
    flags: [],
    reviewed: false,
    split: null,
    ...over,
  };
}

const bank = { sourceFileId: "bank", sourceFileName: "fake-bank.pdf" };

describe("tagTransfers keyword pass", () => {
  it.each([
    "PAYMENT THANK YOU - WEB",
    "Payment Received",
    "AUTOPAY 1234",
    "Online Payment to Fake Card",
    "EPAYMENT FAKE BANK",
    "Credit Card Payment",
    "FAKEBANK CRCARDPMT 9981",
    "Transfer to Savings x1234",
    "Transfer from Checking",
    "ONLINE TRANSFER REF 111",
    "XFER 2231",
    "Move to savings",
    "Deposit from checking",
  ])("tags %j", (description) => {
    const [row] = tagTransfers([tx({ description })]);
    expect(row.isTransfer).toBe(true);
    expect(row.transferReason).toMatch(/^Description contains "/);
  });

  it("leaves ordinary rows alone", () => {
    const [row] = tagTransfers([tx({ description: "Fake Coffee Hut" })]);
    expect(row.isTransfer).toBe(false);
    expect(row.transferReason).toBeNull();
  });

  it("matches keywords on word boundaries", () => {
    const [row] = tagTransfers([tx({ description: "FIXFERRY TICKETS" })]);
    expect(row.isTransfer).toBe(false);
  });

  it("does not tag Zelle or Venmo, whatever else the description says", () => {
    const rows = tagTransfers([
      tx({ description: "Zelle Transfer to Sam Example" }),
      tx({ description: "VENMO PAYMENT RECEIVED", kind: "income" }),
      tx({ description: "Zelle payment from Alex Sample", kind: "income" }),
    ]);
    expect(rows.map((r) => r.isTransfer)).toEqual([false, false, false]);
  });

  it("never tags a split row", () => {
    const [row] = tagTransfers([
      tx({
        description: "Online Payment",
        amountCents: 500,
        split: {
          totalCents: 1000,
          shares: [
            {
              id: "s1",
              name: "Me",
              isUser: true,
              amountCents: 500,
              manual: false,
              requested: false,
            },
            {
              id: "s2",
              name: "Sam",
              isUser: false,
              amountCents: 500,
              manual: false,
              requested: false,
            },
          ],
        },
      }),
    ]);
    expect(row.isTransfer).toBe(false);
  });

  it("keeps rows that are already tagged, with their reason", () => {
    const [row] = tagTransfers([
      tx({
        description: "Fake Coffee Hut",
        isTransfer: true,
        transferReason: "Tagged by you",
      }),
    ]);
    expect(row.isTransfer).toBe(true);
    expect(row.transferReason).toBe("Tagged by you");
  });

  it("returns new objects and does not mutate the input", () => {
    const input = [tx({ description: "AUTOPAY" }), tx()];
    const out = tagTransfers(input);
    expect(out[0]).not.toBe(input[0]);
    expect(out[1]).not.toBe(input[1]);
    expect(input[0].isTransfer).toBe(false);
    expect(out.map((r) => r.id)).toEqual(input.map((r) => r.id));
  });
});

describe("tagTransfers pairing pass", () => {
  it("tags both sides of a cross-file pair", () => {
    const out = tagTransfers([
      tx({
        ...bank,
        description: "FAKECARD PAYMENT 4421",
        amountCents: 25000,
        date: "2026-10-05",
      }),
      tx({
        description: "THANK YOU",
        amountCents: 25000,
        kind: "income",
        date: "2026-10-06",
      }),
    ]);
    expect(out.map((r) => r.isTransfer)).toEqual([true, true]);
    expect(out[0].transferReason).toContain("2026-10-06");
    expect(out[0].transferReason).toContain("fake-card.pdf");
    expect(out[1].transferReason).toContain("2026-10-05");
    expect(out[1].transferReason).toContain("fake-bank.pdf");
  });

  it("tags the counterpart of a keyword-tagged row and keeps the keyword reason", () => {
    const out = tagTransfers([
      tx({
        description: "PAYMENT THANK YOU",
        amountCents: 4200,
        kind: "income",
      }),
      tx({ ...bank, description: "FAKECARD BILL 99", amountCents: 4200 }),
    ]);
    expect(out[0].transferReason).toBe(
      'Description contains "payment thank you"',
    );
    expect(out[1].isTransfer).toBe(true);
  });

  it("uses a three-day window, inclusive", () => {
    const pair = (incomeDate: string) =>
      tagTransfers([
        tx({
          ...bank,
          description: "Card payment 1",
          date: "2026-10-28",
        }),
        tx({ description: "Credit", kind: "income", date: incomeDate }),
      ]).map((r) => r.isTransfer);

    expect(pair("2026-10-31")).toEqual([true, true]);
    expect(pair("2026-10-25")).toEqual([true, true]);
    expect(pair("2026-11-01")).toEqual([false, false]);
    expect(pair("2026-10-24")).toEqual([false, false]);
  });

  it("needs payment or transfer wording on at least one side", () => {
    const out = tagTransfers([
      tx({ ...bank, description: "Fake Hardware" }),
      tx({ description: "Fake Hardware refund", kind: "income" }),
    ]);
    expect(out.map((r) => r.isTransfer)).toEqual([false, false]);
  });

  it("needs equal amounts, opposite kinds and different files", () => {
    const differentAmount = tagTransfers([
      tx({ ...bank, description: "Card payment 1", amountCents: 1000 }),
      tx({ description: "Credit", kind: "income", amountCents: 1001 }),
    ]);
    expect(differentAmount.map((r) => r.isTransfer)).toEqual([false, false]);

    const sameKind = tagTransfers([
      tx({ ...bank, description: "Card payment 1" }),
      tx({ description: "Card payment 2" }),
    ]);
    expect(sameKind.map((r) => r.isTransfer)).toEqual([false, false]);

    const sameFile = tagTransfers([
      tx({ description: "Card payment 1" }),
      tx({ description: "Credit", kind: "income" }),
    ]);
    expect(sameFile.map((r) => r.isTransfer)).toEqual([false, false]);
  });

  it("does not pair Zelle or Venmo rows", () => {
    const out = tagTransfers([
      tx({ ...bank, description: "Zelle payment to Sam Example" }),
      tx({ description: "Venmo cashout", kind: "income" }),
      tx({ description: "Credit", kind: "income" }),
    ]);
    expect(out.map((r) => r.isTransfer)).toEqual([false, false, false]);
  });

  it("pairs each row once, preferring the closest date", () => {
    const out = tagTransfers([
      tx({ ...bank, description: "Card payment A", date: "2026-10-10" }),
      tx({ ...bank, description: "Card payment B", date: "2026-10-12" }),
      tx({ description: "Credit", kind: "income", date: "2026-10-12" }),
    ]);
    // The first expense takes the only income; the second has nothing left to pair with.
    expect(out.map((r) => r.isTransfer)).toEqual([true, false, true]);

    const closest = tagTransfers([
      tx({ ...bank, description: "Card payment A", date: "2026-10-10" }),
      tx({ description: "Credit far", kind: "income", date: "2026-10-13" }),
      tx({ description: "Credit near", kind: "income", date: "2026-10-11" }),
    ]);
    expect(closest.map((r) => r.isTransfer)).toEqual([true, false, true]);
  });

  it("skips rows with malformed dates", () => {
    const out = tagTransfers([
      tx({ ...bank, description: "Card payment 1", date: "not-a-date" }),
      tx({ description: "Credit", kind: "income" }),
    ]);
    expect(out.map((r) => r.isTransfer)).toEqual([false, false]);
  });
});
