// Invented activity list with descriptions wrapped over several lines, and rows whose date and
// amount sit on different lines. No keywords say whether it is a card or a bank account.

import { statement } from "./build";

const layout = {
  date: { x: 40 },
  desc: { x: 110 },
  amount: { x: 500, align: "right" },
} as const;

export const wrappedLines = statement(layout)
  .text("EXAMPLE STORE ACCOUNT")
  .row({ date: "03/14/2026", desc: "ACME COFFEE ROASTERS", amount: "4.50" })
  .row({ desc: "SEATTLE WA" })
  .row({ date: "03/15/2026", desc: "FICTIONAL AIRWAYS", amount: "312.40" })
  .row({ desc: "TICKET 0012345678" })
  .row({ desc: "PASSENGER EXAMPLE TRAVELLER" })
  // A third extra line is one too many and is left out.
  .row({ desc: "ROUTE AAA TO BBB" })
  .row({ date: "03/16/2026", desc: "EXAMPLE GROCER 042", amount: "58.07" })
  .space(2)
  // Too far below the row above to belong to it.
  .text("Thank you for being a made-up customer", 110)
  .row({ date: "03/18/2026", desc: "SAMPLE HARDWARE" })
  .row({ amount: "23.99" })
  .row({ date: "03/19/2026", desc: "MADE UP PARKING", amount: "6.00" })
  // Starts at the left margin, not in the description column.
  .text("Questions? Call 555-0100", 40)
  .row({ date: "03/20/2026", desc: "FICTIONAL BOOKS" })
  .row({ desc: "ONLINE ORDER" })
  .row({ amount: "18.25" })
  .build();
