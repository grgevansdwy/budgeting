// Invented statement that marks credits with a CR suffix and writes dates with month names.

import { statement } from "./build";

const layout = {
  date: { x: 40 },
  desc: { x: 130 },
  amount: { x: 500, align: "right" },
} as const;

export const crSuffixLines = statement(layout)
  .text("EXAMPLE BUILDING SOCIETY")
  .text("Transactions")
  .row({ date: "12 Mar 2026", desc: "ACME COFFEE ROASTERS", amount: "3.80" })
  .row({ date: "13 Mar 2026", desc: "SAMPLE WAGES LTD", amount: "1,200.00 CR" })
  .row({ date: "15 Mar 2026", desc: "EXAMPLE GROCER 042", amount: "45.10 DR" })
  .row({
    date: "18 Mar 2026",
    desc: "MADE UP BOOKSHOP REFUND",
    amount: "12.50CR",
  })
  .row({
    date: "Mar 20, 2026",
    desc: "FICTIONAL RAIL TICKETS",
    amount: "27.00",
  })
  .build();
