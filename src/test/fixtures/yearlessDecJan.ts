// Invented card statement whose rows have no year and whose period runs December to January.

import { statement } from "./build";

const layout = {
  date: { x: 40 },
  desc: { x: 100 },
  amount: { x: 480, align: "right" },
} as const;

function build(withPeriodLine: boolean) {
  const b = statement(layout).text("EXAMPLE REWARDS CARD");
  if (withPeriodLine) b.text("Statement period 12/15/2025 - 01/14/2026");
  return b
    .text("Credit limit $2,500.00")
    .text("Transactions")
    .row({ date: "12/16", desc: "ACME COFFEE ROASTERS", amount: "5.25" })
    .row({ date: "12/24", desc: "MADE UP TOY EMPORIUM", amount: "148.00" })
    .row({ date: "12/31", desc: "EXAMPLE GROCER 042", amount: "73.19" })
    .row({ date: "01/02", desc: "FICTIONAL GYM MEMBERSHIP", amount: "39.00" })
    .row({
      date: "01/09",
      desc: "PAYMENT RECEIVED THANK YOU",
      amount: "-300.00",
    })
    .row({ date: "01/13", desc: "SAMPLE PHARMACY 009", amount: "12.48" })
    .build();
}

export const yearlessDecJanLines = build(true);
/** The same statement with no date anywhere that carries a year. */
export const yearlessNoAnchorLines = build(false);
