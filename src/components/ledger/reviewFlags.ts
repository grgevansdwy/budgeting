// Review flags in plain words, plus the "does this row need a look?" rule.

import {
  REVIEW_THRESHOLD,
  type ReviewFlag,
  type Transaction,
} from "@/lib/types";

const FLAG_TEXT: Record<ReviewFlag, string> = {
  "ocr-low": "read by OCR with low confidence",
  "year-inferred": "year was guessed",
  "date-order-ambiguous": "day and month could be the other way round",
  "sign-guessed": "income/expense direction was guessed",
  "columns-ambiguous": "more than one amount on the line, took the first",
  "multiline-merged": "description was joined from several lines",
  "ocr-corrected": "characters in the amount or date were corrected after OCR",
  "outside-period": "date is outside the statement period",
  "weak-description": "description is short or unclear",
};

const NO_FLAG_TEXT = "the reader was not confident about this line";

/** A row the parser was unsure about and the user has not confirmed or edited yet. */
export function needsReview(t: Transaction): boolean {
  return t.confidence < REVIEW_THRESHOLD && !t.reviewed;
}

/** One plain-words reason per distinct flag; never empty. */
export function reviewReasons(flags: readonly ReviewFlag[]): string[] {
  const reasons = [...new Set(flags)].map((flag) => FLAG_TEXT[flag]);
  return reasons.length > 0 ? reasons : [NO_FLAG_TEXT];
}
