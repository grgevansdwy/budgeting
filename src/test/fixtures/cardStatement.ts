// Invented credit card statement: yearless dates with a posting date, signed amounts and a
// "Payments and credits" section.

import { statement } from "./build";

const layout = {
  date: { x: 40 },
  post: { x: 80 },
  desc: { x: 130 },
  amount: { x: 520, align: "right" },
} as const;

const header = {
  date: "Date",
  post: "Posted",
  desc: "Description",
  amount: "Amount",
};

export const cardStatementLines = statement(layout)
  .text("EXAMPLE CARD SERVICES")
  .text("Statement closing date 03/20/2026")
  .text("Credit limit $5,000.00")
  .text("Previous balance $412.18")
  .text("Minimum payment due $35.00")
  .text("Payment due date 04/15/2026")
  .space()
  .text("Payments and credits")
  .row(header)
  .row({
    date: "02/25",
    post: "02/26",
    desc: "ONLINE PAYMENT THANK YOU",
    amount: "-$250.00",
  })
  .row({
    date: "03/02",
    post: "03/03",
    desc: "EXAMPLE GROCER 042 REFUND",
    amount: "-$12.40",
  })
  .text("Total payments and credits -$262.40")
  .space()
  .text("Purchases")
  .row(header)
  .row({
    date: "02/22",
    post: "02/23",
    desc: "ACME COFFEE ROASTERS",
    amount: "$4.75",
  })
  .row({
    date: "02/27",
    post: "02/28",
    desc: "EXAMPLE GROCER 042",
    amount: "$86.13",
  })
  .row({
    date: "03/05",
    post: "03/06",
    desc: "FICTIONAL FUEL STOP 17",
    amount: "$41.00",
  })
  .row({
    date: "03/11",
    post: "03/12",
    desc: "SAMPLE FURNITURE WAREHOUSE",
    amount: "$1,015.99",
  })
  .text("Total purchases $1,147.87")
  .space()
  .text("Fees")
  .row({
    date: "03/20",
    post: "03/20",
    desc: "LATE FEE",
    amount: "$29.00",
  })
  .text("Total fees for this period $29.00")
  .space()
  .text("Interest charged")
  .text("Interest charge on purchases $0.00")
  .text("Page 1 of 2")
  .build();
