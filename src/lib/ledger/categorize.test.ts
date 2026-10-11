import { describe, expect, it } from "vitest";
import { OTHER_CATEGORY_ID, type CategoryRule } from "../types";
import {
  containsKeyword,
  guessCategory,
  normalizeDescription,
} from "./categorize";
import { DEFAULT_RULES } from "./defaultRules";

const rules: CategoryRule[] = [
  { id: "r1", categoryId: "food", keywords: ["bar", "trader joe", "cafe"] },
  { id: "r2", categoryId: "phone", keywords: ["at&t", "h-e-b", "stop & shop"] },
  { id: "r3", categoryId: "second", keywords: ["cafe", "zed mart"] },
];

describe("normalizeDescription", () => {
  it.each([
    ["  SQ *Fake   Cafe - #12. ", "sq fake cafe 12"],
    ["AT&T Wireless", "at&t wireless"],
    ["H-E-B #044", "h-e-b 044"],
    ["EXAMPLE.COM/BILL", "example.com bill"],
    ["Stop & Shop", "stop shop"],
    ["Trader Joe's", "trader joes"],
    ["Café Imaginaire", "cafe imaginaire"],
    ["", ""],
    ["*** --- ...", ""],
  ])("%j -> %j", (input, expected) => {
    expect(normalizeDescription(input)).toBe(expected);
  });
});

describe("containsKeyword", () => {
  it("matches whole words only", () => {
    expect(containsKeyword("the fake bar", "bar")).toBe(true);
    expect(containsKeyword("fake barber shop", "bar")).toBe(false);
    expect(containsKeyword("crowbar depot", "bar")).toBe(false);
  });

  it("finds a later whole-word occurrence after a partial one", () => {
    expect(containsKeyword("barber and bar", "bar")).toBe(true);
  });

  it("tolerates one trailing s", () => {
    expect(containsKeyword("two bars", "bar")).toBe(true);
    expect(containsKeyword("barss", "bar")).toBe(false);
  });

  it("never matches an empty keyword", () => {
    expect(containsKeyword("anything", "")).toBe(false);
  });
});

describe("guessCategory", () => {
  it("matches on word boundaries", () => {
    expect(guessCategory("THE FAKE BAR 123", rules)).toBe("food");
    expect(guessCategory("FAKE BARBER SHOP", rules)).toBe(OTHER_CATEGORY_ID);
    expect(guessCategory("EMBARGO GOODS", rules)).toBe(OTHER_CATEGORY_ID);
  });

  it("matches multi-word keywords, including possessives", () => {
    expect(guessCategory("TRADER JOE'S #552 FAKETOWN", rules)).toBe("food");
    expect(guessCategory("TRADER   JOE", rules)).toBe("food");
    expect(guessCategory("TRADER X JOE", rules)).toBe(OTHER_CATEGORY_ID);
  });

  it("matches keywords containing symbols", () => {
    expect(guessCategory("AT&T*BILL PAYMENT", rules)).toBe("phone");
    expect(guessCategory("H-E-B #044 FAKEVILLE", rules)).toBe("phone");
    expect(guessCategory("STOP & SHOP 0412", rules)).toBe("phone");
    expect(guessCategory("BATTERY HUT", rules)).toBe(OTHER_CATEGORY_ID);
  });

  it("lets the first matching rule win", () => {
    expect(guessCategory("Fake Cafe", rules)).toBe("food");
    expect(guessCategory("Fake Cafe", [...rules].reverse())).toBe("second");
    // A later keyword in an earlier rule still beats an earlier keyword in a later rule.
    expect(guessCategory("ZED MART CAFE", rules)).toBe("food");
  });

  it("falls back to Other", () => {
    expect(guessCategory("ZZZ UNKNOWN THING", rules)).toBe(OTHER_CATEGORY_ID);
    expect(guessCategory("", rules)).toBe(OTHER_CATEGORY_ID);
    expect(guessCategory("Fake Cafe", [])).toBe(OTHER_CATEGORY_ID);
  });

  it("ignores empty keywords", () => {
    const blank: CategoryRule[] = [
      { id: "b", categoryId: "blank", keywords: ["", "  "] },
    ];
    expect(guessCategory("anything at all", blank)).toBe(OTHER_CATEGORY_ID);
  });

  it("works with the default rules on made-up merchants", () => {
    expect(guessCategory("Pretend Supermarket 12", DEFAULT_RULES)).toBe(
      "groceries",
    );
    expect(guessCategory("MOONLIGHT RAMEN HOUSE", DEFAULT_RULES)).toBe(
      "food-outside",
    );
    expect(guessCategory("NOWHERE PARKING LOT 7", DEFAULT_RULES)).toBe(
      "transport",
    );
    expect(guessCategory("Imaginary Pharmacy", DEFAULT_RULES)).toBe("health");
    expect(guessCategory("Fictional Barbers", DEFAULT_RULES)).toBe(
      OTHER_CATEGORY_ID,
    );
  });
});
