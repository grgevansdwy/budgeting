// Every constant behind a row's confidence score lives here.

import type { ReviewFlag } from "../types";

/** Subtracted from the score once per flag present. "ocr-low" costs nothing extra: OCR confidence is already multiplied in. */
export const FLAG_DEDUCTIONS: Record<ReviewFlag, number> = {
  "ocr-low": 0,
  "year-inferred": 0.2,
  "date-order-ambiguous": 0.2,
  "sign-guessed": 0.25,
  "columns-ambiguous": 0.2,
  "multiline-merged": 0.05,
  "ocr-corrected": 0.15,
  "outside-period": 0.3,
  "weak-description": 0.2,
};

/** The amount token counts this many times in the OCR mean; every other word counts once. */
export const OCR_AMOUNT_WEIGHT = 3;
/** OCR rows whose weighted mean word confidence is below this get "ocr-low". */
export const OCR_LOW_THRESHOLD = 0.8;
/** A description with fewer alphanumeric characters than this gets "weak-description". */
export const MIN_DESCRIPTION_ALNUM = 3;

const SCALE = 10_000;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Weighted mean OCR word confidence for one row, 0..1. Returns null when no word carries a
 * confidence (PDF text).
 */
export function ocrMeanConfidence(
  amountConfs: readonly number[],
  otherConfs: readonly number[],
): number | null {
  let sum = 0;
  let weight = 0;
  for (const c of amountConfs) {
    sum += clamp01(c) * OCR_AMOUNT_WEIGHT;
    weight += OCR_AMOUNT_WEIGHT;
  }
  for (const c of otherConfs) {
    sum += clamp01(c);
    weight += 1;
  }
  return weight === 0 ? null : sum / weight;
}

/** Start at 1.0, multiply by the OCR mean when there is one, subtract each flag's deduction, clamp to 0..1. */
export function computeConfidence(
  flags: Iterable<ReviewFlag>,
  ocrMean: number | null = null,
): number {
  let score = ocrMean === null ? 1 : clamp01(ocrMean);
  for (const flag of new Set(flags)) score -= FLAG_DEDUCTIONS[flag] ?? 0;
  // Rounded so 1 - 0.2 - 0.05 is exactly 0.75, not 0.7500000000000001.
  return clamp01(Math.round(score * SCALE) / SCALE);
}
