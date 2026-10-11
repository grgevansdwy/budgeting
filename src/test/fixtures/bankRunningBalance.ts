// Invented bank statement with unsigned amounts and a running balance, and no column header.
// Direction can only come from how the balance moves.

import { statement } from "./build";

const layout = {
  date: { x: 40 },
  desc: { x: 120 },
  amount: { x: 430, align: "right" },
  bal: { x: 520, align: "right" },
} as const;

export const bankRunningBalanceLines = statement(layout)
  .text("FICTIONAL SAVINGS AND LOAN")
  .text("Account activity")
  .row({ desc: "Opening balance", bal: "1,500.00" })
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
  .row({
    date: "2026-02-10",
    desc: "MADE UP RENT CO",
    amount: "1,250.00",
    bal: "2,263.40",
  })
  .row({
    date: "2026-02-14",
    desc: "INTEREST PAID",
    amount: "0.37",
    bal: "2,263.77",
  })
  .row({ desc: "Closing balance", bal: "2,263.77" })
  .build();
