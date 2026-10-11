// Invented day-first (DMY) bank statement with signed amounts in several minus styles.

import { statement } from "./build";

const layout = {
  date: { x: 40 },
  desc: { x: 120 },
  amount: { x: 480, align: "right" },
} as const;

export const dayFirstLines = statement(layout)
  .text("EXAMPLE HIGH STREET BANK")
  .text("Current account statement")
  .text("Statement date 31/03/2026")
  .row({ date: "Date", desc: "Details", amount: "Amount" })
  .row({ date: "02/03/2026", desc: "ACME COFFEE ROASTERS", amount: "-3.40" })
  .row({
    date: "05/03/2026",
    desc: "SAMPLE EMPLOYER SALARY",
    amount: "+2,150.00",
  })
  .row({ date: "13/03/2026", desc: "EXAMPLE GROCER 042", amount: "-54.90" })
  // Unicode minus sign.
  .row({
    date: "27/03/2026",
    desc: "FICTIONAL ENERGY CO",
    amount: "−89.00",
  })
  // Trailing minus.
  .row({ date: "30/03/2026", desc: "MADE UP CINEMA", amount: "12.00-" })
  .build();
