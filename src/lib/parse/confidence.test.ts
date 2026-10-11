import { describe, expect, it } from "vitest";
import type { ReviewFlag } from "../types";
import {
  computeConfidence,
  FLAG_DEDUCTIONS,
  OCR_AMOUNT_WEIGHT,
  ocrMeanConfidence,
} from "./confidence";

describe("FLAG_DEDUCTIONS", () => {
  it("matches the plan", () => {
    expect(FLAG_DEDUCTIONS).toEqual({
      "ocr-low": 0,
      "year-inferred": 0.2,
      "date-order-ambiguous": 0.2,
      "sign-guessed": 0.25,
      "columns-ambiguous": 0.2,
      "multiline-merged": 0.05,
      "ocr-corrected": 0.15,
      "outside-period": 0.3,
      "weak-description": 0.2,
    });
  });
});

describe("computeConfidence", () => {
  it("starts at 1 and subtracts each flag once", () => {
    expect(computeConfidence([])).toBe(1);
    expect(computeConfidence(["sign-guessed"])).toBe(0.75);
    expect(computeConfidence(["year-inferred", "multiline-merged"])).toBe(0.75);
    expect(computeConfidence(["multiline-merged", "multiline-merged"])).toBe(
      0.95,
    );
    expect(computeConfidence(["sign-guessed", "columns-ambiguous"])).toBe(0.55);
  });

  it("multiplies in the OCR mean before the deductions", () => {
    expect(computeConfidence([], 0.9)).toBe(0.9);
    expect(computeConfidence(["ocr-corrected"], 0.93)).toBe(0.78);
    expect(computeConfidence(["ocr-low"], 0.5)).toBe(0.5);
  });

  it("clamps to 0..1", () => {
    const all = Object.keys(FLAG_DEDUCTIONS) as ReviewFlag[];
    expect(computeConfidence(all)).toBe(0);
    expect(computeConfidence([], 1.7)).toBe(1);
    expect(computeConfidence([], -3)).toBe(0);
    expect(computeConfidence([], NaN)).toBe(0);
  });
});

describe("ocrMeanConfidence", () => {
  it("weights the amount token most", () => {
    expect(OCR_AMOUNT_WEIGHT).toBe(3);
    // (0.48 * 3 + 0.62 + 0.55 * 3) / 7
    expect(ocrMeanConfidence([0.48], [0.62, 0.55, 0.55, 0.55])).toBeCloseTo(
      0.53,
      10,
    );
    expect(ocrMeanConfidence([0.5], [1])).toBeCloseTo(0.625, 10);
  });

  it("is null when no word carries a confidence", () => {
    expect(ocrMeanConfidence([], [])).toBeNull();
  });
});
