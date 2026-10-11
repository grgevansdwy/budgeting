// Invented bank statement with a header naming Withdrawals / Deposits / Balance columns.

import { statement } from "./build";

const layout = {
  date: { x: 40 },
  desc: { x: 110 },
  out: { x: 400, align: "right" },
  in: { x: 470, align: "right" },
  bal: { x: 550, align: "right" },
} as const;

export const bankColumnsLines = statement(layout)
  .text("EXAMPLE COMMUNITY BANK")
  .text("Everyday checking account statement")
  .text("Statement period 01/01/2026 - 01/31/2026")
  .space()
  .row({
    date: "Date",
    desc: "Description",
    out: "Withdrawals",
    in: "Deposits",
    bal: "Balance",
  })
  .row({ date: "01/01/2026", desc: "Beginning balance", bal: "2,000.00" })
  .row({
    date: "01/03/2026",
    desc: "EXAMPLE GROCER 042",
    out: "64.20",
    bal: "1,935.80",
  })
  .row({
    date: "01/05/2026",
    desc: "ACME PAYROLL DIRECT DEPOSIT",
    in: "1,850.00",
    bal: "3,785.80",
  })
  .row({
    date: "01/09/2026",
    desc: "FICTIONAL POWER AND LIGHT",
    out: "120.55",
    bal: "3,665.25",
  })
  .row({
    date: "01/15/2026",
    desc: "ATM CASH",
    out: "60.00",
    bal: "3,605.25",
  })
  // A dated line with nothing but a balance: not a transaction.
  .row({ date: "01/16/2026", desc: "DAILY LEDGER FIGURE", bal: "3,605.25" })
  .row({
    date: "01/22/2026",
    desc: "SAMPLE CAFE REFUND",
    in: "7.50",
    bal: "3,612.75",
  })
  .row({ date: "01/31/2026", desc: "Ending balance", bal: "3,612.75" })
  .space()
  .text("Total withdrawals 244.75")
  .text("Total deposits 1,857.50")
  .build();
