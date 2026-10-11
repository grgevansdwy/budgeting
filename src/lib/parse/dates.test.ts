import { describe, expect, it } from "vitest";
import {
  countOrderEvidence,
  dayNumber,
  inferDateOrder,
  isOrderAmbiguous,
  matchDateAt,
  parseIsoDate,
  resolveDate,
  toIsoDate,
  type DateParts,
} from "./dates";

const numeric = (
  first: number,
  second: number,
  year: number | null,
): DateParts => ({
  form: "numeric",
  first,
  second,
  year,
});
const fixed = (month: number, day: number, year: number | null): DateParts => ({
  form: "fixed",
  month,
  day,
  year,
});

const at = (text: string, ocr = false) =>
  matchDateAt(text.split(" "), 0, { ocr });

describe("matchDateAt", () => {
  it.each([
    ["03/14/2026", numeric(3, 14, 2026)],
    ["3/4/2026", numeric(3, 4, 2026)],
    ["03/14/26", numeric(3, 14, 2026)],
    ["03/14/99", numeric(3, 14, 1999)],
    ["03/14", numeric(3, 14, null)],
    ["14/03/2026", numeric(14, 3, 2026)],
    ["14/03", numeric(14, 3, null)],
    ["03-14-2026", numeric(3, 14, 2026)],
    ["03-14", numeric(3, 14, null)],
    ["14.03.2026", numeric(14, 3, 2026)],
    ["14.03.26", numeric(14, 3, 2026)],
    ["14.03.", numeric(14, 3, null)],
    ["2026-03-14", fixed(3, 14, 2026)],
    ["14-Mar-2026", fixed(3, 14, 2026)],
    ["14-Mar-26", fixed(3, 14, 2026)],
    ["14Mar", fixed(3, 14, null)],
  ])("reads the single token %s", (text, parts) => {
    expect(at(text)).toEqual({
      parts,
      tokenCount: 1,
      corrected: false,
      amountLike: false,
    });
  });

  it.each([
    ["12 Mar ACME", fixed(3, 12, null), 2],
    ["12 Mar 2026 ACME", fixed(3, 12, 2026), 3],
    ["12 March 2026", fixed(3, 12, 2026), 3],
    ["Mar 12 ACME", fixed(3, 12, null), 2],
    ["Mar 12, 2026 ACME", fixed(3, 12, 2026), 3],
    ["Mar. 12, 2026", fixed(3, 12, 2026), 3],
    ["September 3 2025", fixed(9, 3, 2025), 3],
    ["Sept 3 4.50", fixed(9, 3, null), 2],
    ["Dec 31 1234 MAIN ST", fixed(12, 31, null), 2], // 1234 is not a plausible year
  ])("reads the month-name date in %s", (text, parts, tokenCount) => {
    expect(at(text)).toEqual({
      parts,
      tokenCount,
      corrected: false,
      amountLike: false,
    });
  });

  it("marks a bare 12.03 as possibly an amount", () => {
    expect(at("12.03")).toMatchObject({
      parts: numeric(12, 3, null),
      amountLike: true,
    });
  });

  it.each([
    "ACME",
    "4.50",
    "1,234.56",
    "555-0100",
    "0012345678",
    "13/45",
    "32/01/2026",
    "00/10",
    "14/15/2026", // neither part can be a month
    "2026-13-01",
    "12/03/1850",
    "Mar",
    "Mar ACME",
    "Marble 12",
    "12 Marble",
    "12.5",
    "1234",
    "",
  ])("rejects %s", (text) => {
    expect(at(text)).toBeNull();
  });

  it("reads a date that is not the first token", () => {
    expect(matchDateAt(["03/14", "03/15", "ACME"], 1)?.parts).toEqual(
      numeric(3, 15, null),
    );
    expect(matchDateAt(["ACME"], 3)).toBeNull();
  });

  it("corrects OCR confusables in date tokens only when asked", () => {
    expect(at("O3/l5/2026")).toBeNull();
    expect(at("O3/l5/2026", true)).toEqual({
      parts: numeric(3, 15, 2026),
      tokenCount: 1,
      corrected: true,
      amountLike: false,
    });
    expect(at("l2 Mar 2026", true)).toMatchObject({
      parts: fixed(3, 12, 2026),
      corrected: true,
    });
    expect(at("03/16/2026", true)?.corrected).toBe(false);
    expect(at("BOSS/IS", true)).toBeNull();
  });
});

describe("date order", () => {
  it("counts only dates that can be read one way", () => {
    expect(
      countOrderEvidence([
        numeric(3, 14, null), // MDY
        numeric(14, 3, null), // DMY
        numeric(3, 4, null), // either
        fixed(3, 14, 2026), // not numeric
      ]),
    ).toEqual({ mdy: 1, dmy: 1 });
  });

  it("infers the order the file proves", () => {
    expect(inferDateOrder([numeric(3, 4, null), numeric(3, 14, null)])).toBe(
      "MDY",
    );
    expect(inferDateOrder([numeric(3, 4, null), numeric(14, 3, null)])).toBe(
      "DMY",
    );
    expect(
      inferDateOrder([numeric(3, 4, null), numeric(5, 6, 2026)]),
    ).toBeNull();
    expect(
      inferDateOrder([numeric(3, 14, null), numeric(14, 3, null)]),
    ).toBeNull();
    expect(inferDateOrder([])).toBeNull();
  });

  it("knows which dates are ambiguous", () => {
    expect(isOrderAmbiguous(numeric(3, 4, 2026))).toBe(true);
    expect(isOrderAmbiguous(numeric(4, 4, 2026))).toBe(false);
    expect(isOrderAmbiguous(numeric(3, 14, 2026))).toBe(false);
    expect(isOrderAmbiguous(fixed(3, 4, 2026))).toBe(false);
  });

  it("applies the order, reading an impossible date the other way round", () => {
    expect(resolveDate(numeric(3, 4, 2026), "MDY")).toEqual({
      month: 3,
      day: 4,
      year: 2026,
    });
    expect(resolveDate(numeric(3, 4, 2026), "DMY")).toEqual({
      month: 4,
      day: 3,
      year: 2026,
    });
    expect(resolveDate(numeric(14, 3, null), "MDY")).toEqual({
      month: 3,
      day: 14,
      year: null,
    });
    expect(resolveDate(numeric(3, 14, null), "DMY")).toEqual({
      month: 3,
      day: 14,
      year: null,
    });
    expect(resolveDate(fixed(3, 4, 2026), "DMY")).toEqual({
      month: 3,
      day: 4,
      year: 2026,
    });
  });
});

describe("calendar helpers", () => {
  it("formats valid dates and rejects impossible ones", () => {
    expect(toIsoDate(2026, 3, 4)).toBe("2026-03-04");
    expect(toIsoDate(2024, 2, 29)).toBe("2024-02-29");
    expect(toIsoDate(2026, 2, 29)).toBeNull();
    expect(toIsoDate(2026, 4, 31)).toBeNull();
    expect(toIsoDate(2026, 13, 1)).toBeNull();
    expect(toIsoDate(2026, 1.5, 1)).toBeNull();
  });

  it("parses ISO dates", () => {
    expect(parseIsoDate("2026-01-20")).toEqual({
      year: 2026,
      month: 1,
      day: 20,
    });
    expect(parseIsoDate("2026-01-20T10:00:00Z")).toEqual({
      year: 2026,
      month: 1,
      day: 20,
    });
    expect(parseIsoDate("2026-02-30")).toBeNull();
    expect(parseIsoDate("yesterday")).toBeNull();
    expect(parseIsoDate(undefined)).toBeNull();
  });

  it("numbers days consecutively across a year end", () => {
    expect(dayNumber(2026, 1, 1) - dayNumber(2025, 12, 31)).toBe(1);
    expect(dayNumber(2024, 3, 1) - dayNumber(2024, 2, 28)).toBe(2);
  });
});
