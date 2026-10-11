// Keyword-based category guessing. Pure functions, no state.

import { OTHER_CATEGORY_ID, type CategoryRule } from "../types";

const COMBINING_MARKS = /[̀-ͯ]/g;
const APOSTROPHES = /['‘’`]/g;
// Joiners are kept only between two alphanumerics ("at&t", "h-e-b", "apple.com").
const KEPT_JOINERS = "&.-";

function isAlphanumeric(ch: string | undefined): boolean {
  return ch !== undefined && /^[a-z0-9]$/.test(ch);
}

/**
 * Lowercase, drop accents and apostrophes, turn punctuation noise into spaces and collapse
 * whitespace. "&", "." and "-" survive only inside a word, so "AT&T", "H-E-B" and "APPLE.COM/BILL"
 * keep their shape while "SQ *CAFE - #12." becomes "sq cafe 12".
 */
export function normalizeDescription(description: string): string {
  const lowered = description
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(APOSTROPHES, "");

  let out = "";
  for (let i = 0; i < lowered.length; i++) {
    const ch = lowered[i];
    if (isAlphanumeric(ch)) {
      out += ch;
    } else if (
      KEPT_JOINERS.includes(ch) &&
      isAlphanumeric(lowered[i - 1]) &&
      isAlphanumeric(lowered[i + 1])
    ) {
      out += ch;
    } else {
      out += " ";
    }
  }
  return out.replace(/\s+/g, " ").trim();
}

/**
 * True when `keyword` appears in `text` as a whole word or phrase. Both must already be normalised
 * with normalizeDescription. A single trailing "s" is tolerated so "mcdonald" matches "mcdonalds"
 * and "airline" matches "airlines", while "bar" still does not match "barber".
 */
export function containsKeyword(text: string, keyword: string): boolean {
  if (keyword === "") return false;
  let from = 0;
  for (;;) {
    const at = text.indexOf(keyword, from);
    if (at === -1) return false;
    let end = at + keyword.length;
    if (text[end] === "s") end += 1;
    if (!isAlphanumeric(text[at - 1]) && !isAlphanumeric(text[end])) {
      return true;
    }
    from = at + 1;
  }
}

/** Category id for a description. The first rule with a matching keyword wins; fallback is Other. */
export function guessCategory(
  description: string,
  rules: CategoryRule[],
): string {
  const text = normalizeDescription(description);
  if (text === "") return OTHER_CATEGORY_ID;
  for (const rule of rules) {
    for (const keyword of rule.keywords) {
      if (containsKeyword(text, normalizeDescription(keyword))) {
        return rule.categoryId;
      }
    }
  }
  return OTHER_CATEGORY_ID;
}
