import { describe, expect, it } from "vitest";
import { buildLines, type PositionedItem } from "./lines";

function item(
  text: string,
  x0: number,
  x1: number,
  y = 100,
  height = 10,
  conf?: number,
): PositionedItem {
  return conf === undefined
    ? { text, x0, x1, y, height }
    : { text, x0, x1, y, height, conf };
}

describe("buildLines: grouping into lines", () => {
  it("returns no lines for no items", () => {
    expect(buildLines([], 1, "pdf")).toEqual([]);
  });

  it("puts items with the same top on one line, sorted left to right", () => {
    const lines = buildLines(
      [item("12.50", 300, 330), item("10/03", 20, 50), item("COFFEE", 80, 125)],
      2,
      "pdf",
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe("10/03 COFFEE 12.50");
    expect(lines[0].tokens.map((t) => t.x0)).toEqual([20, 80, 300]);
    expect(lines[0].page).toBe(2);
    expect(lines[0].source).toBe("pdf");
  });

  it("joins items whose centres differ by less than half a line height", () => {
    const lines = buildLines(
      [item("A", 0, 10, 100, 10), item("B", 50, 60, 104, 10)],
      1,
      "ocr",
    );
    expect(lines.map((l) => l.text)).toEqual(["A B"]);
  });

  it("separates items whose centres differ by more than half a line height", () => {
    const lines = buildLines(
      [item("A", 0, 10, 100, 10), item("B", 50, 60, 106, 10)],
      1,
      "ocr",
    );
    expect(lines.map((l) => l.text)).toEqual(["A", "B"]);
  });

  it("keeps different font sizes on a shared baseline together", () => {
    // Baseline at y = 112: a 12-unit item and an 8-unit item.
    const lines = buildLines(
      [item("Total", 0, 40, 100, 12), item("USD", 50, 70, 104, 8)],
      1,
      "pdf",
    );
    expect(lines.map((l) => l.text)).toEqual(["Total USD"]);
  });

  it("does not let a tall heading swallow the small line below it", () => {
    const lines = buildLines(
      [item("STATEMENT", 0, 200, 100, 30), item("Page", 0, 30, 124, 8)],
      1,
      "pdf",
    );
    expect(lines.map((l) => l.text)).toEqual(["STATEMENT", "Page"]);
  });

  it("keeps small punctuation on its row when boxes hug the ink (OCR)", () => {
    const words = [
      item("Sep", 0, 30, 100, 12, 0.9),
      item("12,", 35, 60, 100, 13, 0.9),
      item("-", 65, 70, 106, 2, 0.9),
      item("Oct", 75, 105, 100, 12, 0.9),
      item("11", 110, 125, 100, 12, 0.9),
    ];
    expect(buildLines(words, 1, "ocr").map((l) => l.text)).toEqual([
      "Sep 12, - Oct 11",
    ]);
  });

  it("does not let a tall OCR artefact pull neighbouring rows together", () => {
    const words = [
      item("|", 0, 3, 100, 60),
      item("row1", 20, 60, 100, 10),
      item("row2", 20, 60, 125, 10),
      item("row3", 20, 60, 150, 10),
      item("row0", 20, 60, 75, 10),
      item("row4", 20, 60, 175, 10),
    ];
    // The artefact lands on one row (and lifts that row's top), but the rows themselves stay apart.
    const texts = buildLines(words, 1, "ocr").map((l) =>
      l.text.replace("| ", ""),
    );
    expect([...texts].sort()).toEqual(["row0", "row1", "row2", "row3", "row4"]);
  });

  it("does not chain neighbouring rows together", () => {
    const rows = [0, 1, 2, 3, 4].map((i) =>
      item(`row${i}`, 0, 30, 100 + i * 12, 10),
    );
    expect(buildLines(rows, 1, "pdf").map((l) => l.text)).toEqual([
      "row0",
      "row1",
      "row2",
      "row3",
      "row4",
    ]);
  });

  it("sorts lines top to bottom whatever the input order", () => {
    const lines = buildLines(
      [
        item("third", 0, 30, 300),
        item("first", 0, 30, 100),
        item("second", 0, 30, 200),
      ],
      1,
      "pdf",
    );
    expect(lines.map((l) => l.text)).toEqual(["first", "second", "third"]);
    expect(lines.map((l) => l.y)).toEqual([100, 200, 300]);
  });

  it("reports the top of the highest item and the full height", () => {
    const [line] = buildLines(
      [item("a", 0, 10, 100, 10), item("b", 20, 30, 102, 10)],
      1,
      "pdf",
    );
    expect(line.y).toBe(100);
    expect(line.height).toBe(12);
  });
});

describe("buildLines: tokens", () => {
  it("splits a multi-word item and apportions x by character count", () => {
    // 17 characters over 170 units: 10 units per character.
    const [line] = buildLines([item("PAYMENT THANK YOU", 100, 270)], 1, "pdf");
    expect(line.tokens).toEqual([
      { text: "PAYMENT", x0: 100, x1: 170 },
      { text: "THANK", x0: 180, x1: 230 },
      { text: "YOU", x0: 240, x1: 270 },
    ]);
    expect(line.text).toBe("PAYMENT THANK YOU");
  });

  it("collapses runs of whitespace and trims the ends", () => {
    const [line] = buildLines([item("  FAKE   MART\t01 ", 0, 170)], 1, "pdf");
    expect(line.text).toBe("FAKE MART 01");
    expect(line.tokens[0].x0).toBeCloseTo(20);
    expect(line.tokens[2].x1).toBeCloseTo(160);
  });

  it("drops empty and whitespace-only items", () => {
    expect(
      buildLines([item("", 0, 10), item("   ", 20, 40)], 1, "pdf"),
    ).toEqual([]);
    const [line] = buildLines(
      [item("A", 0, 10), item(" ", 12, 15), item("B", 40, 50)],
      1,
      "pdf",
    );
    expect(line.tokens.map((t) => t.text)).toEqual(["A", "B"]);
  });

  it("merges touching PDF items into one token", () => {
    const [line] = buildLines(
      [item("$", 300, 306), item("1,234", 306, 336), item(".56", 336.5, 354)],
      1,
      "pdf",
    );
    expect(line.tokens).toEqual([{ text: "$1,234.56", x0: 300, x1: 354 }]);
  });

  it("merges the last word of one item with the first word of the next when they touch", () => {
    const [line] = buildLines(
      [item("FAKE GRO", 0, 80), item("CER 12", 80, 140)],
      1,
      "pdf",
    );
    expect(line.tokens.map((t) => t.text)).toEqual(["FAKE", "GROCER", "12"]);
    expect(line.tokens[1].x0).toBeCloseTo(50);
    expect(line.tokens[1].x1).toBeCloseTo(110);
  });

  it("keeps items apart when the gap is a real space", () => {
    const [line] = buildLines(
      [item("FAKE", 0, 40), item("MART", 43, 83)],
      1,
      "pdf",
    );
    expect(line.tokens.map((t) => t.text)).toEqual(["FAKE", "MART"]);
  });

  it("does not merge across whitespace at an item edge", () => {
    const [trailing] = buildLines(
      [item("FAKE ", 0, 50), item("MART", 50, 90)],
      1,
      "pdf",
    );
    expect(trailing.tokens.map((t) => t.text)).toEqual(["FAKE", "MART"]);
    const [leading] = buildLines(
      [item("FAKE", 0, 40), item(" MART", 40, 90)],
      1,
      "pdf",
    );
    expect(leading.tokens.map((t) => t.text)).toEqual(["FAKE", "MART"]);
  });

  it("does not merge across a zero-width whitespace-only item", () => {
    const [line] = buildLines(
      [item("FAKE", 0, 40), item(" ", 40, 40), item("MART", 40, 80)],
      1,
      "pdf",
    );
    expect(line.tokens.map((t) => t.text)).toEqual(["FAKE", "MART"]);
  });

  it("never merges OCR words, even when their boxes touch", () => {
    const [line] = buildLines(
      [item("12.00", 0, 40, 100, 10, 0.9), item("34.00", 40, 80, 100, 10, 0.8)],
      1,
      "ocr",
    );
    expect(line.tokens.map((t) => t.text)).toEqual(["12.00", "34.00"]);
  });

  it("carries OCR confidence onto every token split from a word", () => {
    const [line] = buildLines([item("AB CD", 0, 50, 100, 10, 0.7)], 1, "ocr");
    expect(line.tokens.map((t) => t.conf)).toEqual([0.7, 0.7]);
  });

  it("leaves conf off PDF tokens", () => {
    const [line] = buildLines([item("AB", 0, 20)], 1, "pdf");
    expect("conf" in line.tokens[0]).toBe(false);
  });

  it("keeps the lower confidence when fragments merge", () => {
    const [line] = buildLines(
      [item("12", 0, 20, 100, 10, 0.9), item(".50", 20, 50, 100, 10, 0.4)],
      1,
      "pdf",
    );
    expect(line.tokens).toEqual([{ text: "12.50", x0: 0, x1: 50, conf: 0.4 }]);
  });
});

describe("buildLines: bad input", () => {
  it("ignores items with non-finite coordinates or no height", () => {
    const lines = buildLines(
      [
        item("ok", 0, 20),
        item("nan", Number.NaN, 20),
        item("flat", 30, 50, 100, 0),
        item("inf", 0, 20, Infinity),
      ],
      1,
      "pdf",
    );
    expect(lines.map((l) => l.text)).toEqual(["ok"]);
  });

  it("swaps reversed x edges", () => {
    const [line] = buildLines([item("AB", 20, 0)], 1, "pdf");
    expect(line.tokens).toEqual([{ text: "AB", x0: 0, x1: 20 }]);
  });

  it("does not mutate its input", () => {
    const input = [item("B", 50, 60), item("A", 0, 10)];
    const copy = structuredClone(input);
    buildLines(input, 1, "pdf");
    expect(input).toEqual(copy);
  });
});

describe("buildLines: a statement-like page", () => {
  it("rebuilds table rows from scattered cells", () => {
    const cells: PositionedItem[] = [
      item("Date", 20, 44, 50),
      item("Description", 80, 146, 50),
      item("Amount", 300, 340, 50),
      item("09/14", 20, 50, 70),
      item("FAKE GROCER 12", 80, 164, 70.4),
      item("45.20", 310, 340, 69.8),
      item("09/15", 20, 50, 85),
      item("SAMPLE DINER", 80, 152, 85),
      item("-", 304, 308, 85),
      item("18.00", 308, 338, 85),
    ];
    const lines = buildLines(cells.reverse(), 1, "pdf");
    expect(lines.map((l) => l.text)).toEqual([
      "Date Description Amount",
      "09/14 FAKE GROCER 12 45.20",
      "09/15 SAMPLE DINER -18.00",
    ]);
  });
});
