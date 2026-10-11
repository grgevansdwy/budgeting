// Invented OCR output from a banking-app screenshot: confusable characters in dates and
// amounts, and one row the OCR engine was unsure about.

import { statement } from "./build";

const layout = {
  date: { x: 60 },
  desc: { x: 220 },
  amount: { x: 900, align: "right" },
} as const;

export const noisyOcrLines = statement(layout, {
  source: "ocr",
  charWidth: 12,
  height: 22,
  pitch: 30,
  conf: 0.96,
  margin: 60,
})
  .text("EXAMPLE BANK MOBILE")
  .text("Available balance $1,204.11")
  .text("Recent activity")
  .row(
    { date: "O3/l5/2026", desc: "ACME COFFEE ROASTERS", amount: "-S4.5O" },
    { conf: 0.93 },
  )
  .row({ date: "03/16/2026", desc: "EXAMPLE GROCER 042", amount: "-$62.18" })
  .row({
    date: { text: "03/17/2026", conf: 0.62 },
    desc: { text: "FlCTlONAL FUEL ST0P", conf: 0.55 },
    amount: { text: "-$4l.OO", conf: 0.48 },
  })
  .row({
    date: "03/l8/2026",
    desc: "SAMPLE EMPLOYER PAYROLL",
    amount: "+$1,B50.00",
  })
  .row({ date: "03/19/2026", desc: "MADE UP TRANSIT", amount: "-$2.75" })
  .text("Page l of 2")
  .build();
