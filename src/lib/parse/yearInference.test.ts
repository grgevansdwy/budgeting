import { describe, expect, it } from "vitest";
import {
  fallbackAnchor,
  findAnchor,
  findFullDates,
  inferYear,
  isOutsidePeriod,
  labelledDateParts,
  type Anchor,
} from "./yearInference";

const lines = (...texts: string[]) => texts.map((t) => t.split(" "));

describe("findAnchor", () => {
  it("takes the end of a labelled statement period", () => {
    expect(
      findAnchor(
        lines("EXAMPLE CARD", "Statement period 12/15/2025 - 01/14/2026"),
        "MDY",
        null,
      ),
    ).toEqual({
      year: 2026,
      month: 1,
      day: 14,
      source: "period",
      periodStart: { year: 2025, month: 12, day: 15 },
    });
  });

  it("splits a period written as one token and reads month names", () => {
    expect(
      findAnchor(lines("Billing period 12/15/2025-01/14/2026"), "MDY", null),
    ).toMatchObject({ year: 2026, month: 1, day: 14, source: "period" });
    expect(
      findAnchor(
        lines("Statement period Dec 15, 2025 to Jan 14, 2026"),
        "MDY",
        null,
      ),
    ).toMatchObject({
      year: 2026,
      month: 1,
      day: 14,
      periodStart: { year: 2025, month: 12, day: 15 },
    });
  });

  it("takes the date after a closing-date label, not a later due date", () => {
    expect(
      findAnchor(
        lines(
          "Opened 06/01/2019 Closing date 03/20/2026 Payment due 04/15/2026",
        ),
        "MDY",
        null,
      ),
    ).toEqual({
      year: 2026,
      month: 3,
      day: 20,
      source: "period",
      periodStart: null,
    });
  });

  it("applies the file's date order", () => {
    expect(
      findAnchor(lines("Statement date 05/03/2026"), "DMY", null),
    ).toMatchObject({ year: 2026, month: 3, day: 5 });
  });

  it("falls back to the latest full date in the document", () => {
    expect(
      findAnchor(
        lines("Printed 02/10/2026", "01/05/2026 ACME 4.50", "ref 88120045"),
        "MDY",
        null,
      ),
    ).toEqual({
      year: 2026,
      month: 2,
      day: 10,
      source: "latest-date",
      periodStart: null,
    });
  });

  it("ignores far-future dates in the unlabelled search", () => {
    const notAfter = { year: 2026, month: 2, day: 15 };
    expect(
      findAnchor(
        lines("Promotional rate ends 12/31/2027", "Printed 02/10/2026"),
        "MDY",
        notAfter,
      ),
    ).toMatchObject({ year: 2026, month: 2, day: 10 });
  });

  it("returns null when no date carries a year", () => {
    expect(
      findAnchor(lines("12/16 ACME 5.25", "Closing date soon"), "MDY", null),
    ).toBeNull();
    expect(findAnchor([], "MDY", null)).toBeNull();
  });
});

describe("findFullDates and labelledDateParts", () => {
  it("finds dates with a year anywhere in a line", () => {
    expect(
      findFullDates("from 12/15/2025 to Jan 14, 2026 and 03/04".split(" ")).map(
        (d) => d.index,
      ),
    ).toEqual([1, 3]);
  });

  it("collects the dates on labelled lines as date-order evidence", () => {
    expect(
      labelledDateParts(
        lines("Statement date 31/03/2026", "Printed 01/02/2026"),
      ),
    ).toEqual([{ form: "numeric", first: 31, second: 3, year: 2026 }]);
  });
});

describe("inferYear", () => {
  const january = { year: 2026, month: 1, day: 14 };

  it("gives December rows the previous year on a statement closing in January", () => {
    expect(inferYear(12, 16, january)).toBe(2025);
    expect(inferYear(12, 31, january)).toBe(2025);
    expect(inferYear(1, 2, january)).toBe(2026);
    expect(inferYear(1, 14, january)).toBe(2026);
  });

  it("allows a few days after the anchor before stepping back a year", () => {
    expect(inferYear(1, 21, january)).toBe(2026);
    expect(inferYear(1, 22, january)).toBe(2025);
  });

  it("keeps the anchor year for a statement inside one year", () => {
    const march = { year: 2026, month: 3, day: 20 };
    expect(inferYear(2, 22, march)).toBe(2026);
    expect(inferYear(3, 20, march)).toBe(2026);
  });
});

describe("fallbackAnchor", () => {
  it("uses the caller's date", () => {
    expect(fallbackAnchor("2026-01-20")).toEqual({
      year: 2026,
      month: 1,
      day: 20,
      source: "fallback",
      periodStart: null,
    });
  });

  it("uses today when the caller's date is unusable", () => {
    const today = new Date(2026, 9, 11);
    expect(fallbackAnchor("not a date", today)).toMatchObject({
      year: 2026,
      month: 10,
      day: 11,
      source: "fallback",
    });
    expect(fallbackAnchor(undefined, today).year).toBe(2026);
  });
});

describe("isOutsidePeriod", () => {
  const period: Anchor = {
    year: 2026,
    month: 1,
    day: 31,
    source: "period",
    periodStart: { year: 2026, month: 1, day: 1 },
  };

  it("flags dates well outside a stated period", () => {
    expect(isOutsidePeriod({ year: 2026, month: 1, day: 10 }, period)).toBe(
      false,
    );
    expect(isOutsidePeriod({ year: 2025, month: 12, day: 28 }, period)).toBe(
      false,
    );
    expect(isOutsidePeriod({ year: 2025, month: 12, day: 20 }, period)).toBe(
      true,
    );
    expect(isOutsidePeriod({ year: 2026, month: 2, day: 5 }, period)).toBe(
      false,
    );
    expect(isOutsidePeriod({ year: 2026, month: 2, day: 12 }, period)).toBe(
      true,
    );
  });

  it("only checks the end when the start is unknown, and never without a labelled date", () => {
    const closing: Anchor = { ...period, periodStart: null };
    expect(isOutsidePeriod({ year: 2020, month: 1, day: 1 }, closing)).toBe(
      false,
    );
    expect(isOutsidePeriod({ year: 2026, month: 3, day: 1 }, closing)).toBe(
      true,
    );
    const guessed: Anchor = { ...closing, source: "latest-date" };
    expect(isOutsidePeriod({ year: 2026, month: 3, day: 1 }, guessed)).toBe(
      false,
    );
  });
});
