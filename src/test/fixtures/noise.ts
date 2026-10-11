// Invented two-page card statement padded with the lines a parser must ignore: page headers
// and footers, balances, totals, rates, phone numbers and reference numbers.

import { statement } from "./build";

const layout = {
  date: { x: 40 },
  desc: { x: 110 },
  amount: { x: 500, align: "right" },
} as const;

const header = { date: "Date", desc: "Description", amount: "Amount" };

export const noiseLines = statement(layout)
  .text("EXAMPLE CARD SERVICES Page 1 of 3")
  .text("Account ending 0000")
  .text("Customer service 555-0100")
  .text("Statement date 02/28/2026")
  .text("Credit limit $3,000.00 Available credit $2,611.45")
  .text("Previous balance $201.37")
  .text("Purchase rate 24.99%")
  .space()
  .row(header)
  .row({ date: "02/01/2026", desc: "Previous balance", amount: "201.37" })
  .row({ date: "02/03/2026", desc: "ACME COFFEE ROASTERS", amount: "4.25" })
  // A merchant whose name starts with "Total" is still a transaction.
  .row({ date: "02/07/2026", desc: "TOTAL FAKE WINES 007", amount: "31.50" })
  .row({
    date: "02/11/2026",
    desc: "EXAMPLE GROCER 042 REF 88120045",
    amount: "67.80",
  })
  .row({ date: "02/15/2026", desc: "PAYMENT THANK YOU", amount: "-150.00" })
  .row({ date: "02/20/2026", desc: "Subtotal", amount: "103.55" })
  .text("Transactions continued on next page")
  .newPage()
  .text("EXAMPLE CARD SERVICES Page 2 of 3")
  .text("Transactions (continued)")
  .row(header)
  .row({ date: "02/21/2026", desc: "SAMPLE CINEMA 555-0199", amount: "22.00" })
  .row({ date: "02/26/2026", desc: "PROMO ADJUSTMENT", amount: "0.00" })
  .row({
    date: "02/28/2026",
    desc: "Total fees charged in 2026",
    amount: "0.00",
  })
  .row({ date: "02/28/2026", desc: "New balance", amount: "177.42" })
  .row({ date: "02/28/2026", desc: "Minimum payment due", amount: "25.00" })
  .space()
  .text("Total purchases 125.55")
  .text("Interest charge calculation")
  .text("24.99% annual percentage rate")
  .text("Page 2 of 3")
  .build();
