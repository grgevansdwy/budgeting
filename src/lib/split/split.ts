// Cent-exact split maths. Pure functions: every operation returns a new Split and never mutates
// its input. Invariant after every successful operation: each share is a non-negative safe
// integer and the shares sum to exactly totalCents.

import { formatCents } from "../money";
import type { Cents, Split, SplitShare } from "../types";

export const MIN_PEOPLE = 2;
export const MAX_PEOPLE = 20;
export const USER_SHARE_NAME = "You";

export type SplitResult =
  | { ok: true; split: Split }
  // error is a sentence fit to show the user; maxCents is set when an amount was too large.
  | { ok: false; error: string; maxCents?: Cents };

function fail(error: string, maxCents?: Cents): SplitResult {
  return maxCents === undefined
    ? { ok: false, error }
    : { ok: false, error, maxCents };
}

function isValidTotal(totalCents: Cents): boolean {
  return Number.isSafeInteger(totalCents) && totalCents > 0;
}

const TOTAL_ERROR = "The total must be a whole number of cents above zero.";

function manualSum(shares: SplitShare[], exceptId?: string): Cents {
  let sum = 0;
  for (const sh of shares) {
    if (sh.manual && !sh.isUser && sh.id !== exceptId) sum += sh.amountCents;
  }
  return sum;
}

/**
 * Spread `totalCents - sum(manual shares)` equally (floor division) over the non-manual shares,
 * user included, and give the leftover cents to the user. The caller guarantees the manual sum
 * fits in the total. A non-user share whose amount changes loses its `requested` flag.
 */
function rebalance(totalCents: Cents, shares: SplitShare[]): Split {
  const remainder = totalCents - manualSum(shares);
  const flexible = shares.filter((sh) => sh.isUser || !sh.manual).length;
  const each = Math.floor(remainder / flexible);
  const leftover = remainder - each * flexible;
  return {
    totalCents,
    shares: shares.map((sh) => {
      if (sh.isUser) {
        return {
          ...sh,
          amountCents: each + leftover,
          manual: false,
          requested: false,
        };
      }
      if (sh.manual) return { ...sh };
      return {
        ...sh,
        amountCents: each,
        requested: sh.amountCents === each ? sh.requested : false,
      };
    }),
  };
}

/** Returns the trimmed name, or an error sentence. `exceptId` is the share being renamed. */
function checkName(
  name: string,
  taken: { id?: string; name: string }[],
  exceptId?: string,
): { name: string } | { error: string } {
  const trimmed = name.trim();
  if (trimmed === "") return { error: "Every person needs a name." };
  const key = trimmed.toLowerCase();
  if (key === USER_SHARE_NAME.toLowerCase()) {
    return {
      error: `"${USER_SHARE_NAME}" is already used for your own share. Pick another name.`,
    };
  }
  if (taken.some((t) => t.id !== exceptId && t.name.toLowerCase() === key)) {
    return { error: `There is already someone called "${trimmed}".` };
  }
  return { name: trimmed };
}

function newShare(name: string): SplitShare {
  return {
    id: crypto.randomUUID(),
    name,
    isUser: false,
    amountCents: 0,
    manual: false,
    requested: false,
  };
}

/** People count = otherNames.length + 1 (the user is included). Equal shares = floor(total / N); leftover cents go to the user. */
export function createEqualSplit(
  totalCents: Cents,
  otherNames: string[],
): SplitResult {
  if (!isValidTotal(totalCents)) return fail(TOTAL_ERROR);
  const people = otherNames.length + 1;
  if (people < MIN_PEOPLE || people > MAX_PEOPLE) {
    return fail(
      `A split needs between ${MIN_PEOPLE} and ${MAX_PEOPLE} people, including you.`,
    );
  }
  const others: SplitShare[] = [];
  for (const raw of otherNames) {
    const checked = checkName(raw, others);
    if ("error" in checked) return fail(checked.error);
    others.push(newShare(checked.name));
  }
  const user: SplitShare = {
    id: crypto.randomUUID(),
    name: USER_SHARE_NAME,
    isUser: true,
    amountCents: 0,
    manual: false,
    requested: false,
  };
  return { ok: true, split: rebalance(totalCents, [user, ...others]) };
}

/** Set one other person's amount by hand (marks it manual) and rebalance the non-manual shares, user included, so the sum is unchanged. */
export function setShareAmount(
  split: Split,
  shareId: string,
  amountCents: Cents,
): SplitResult {
  const target = split.shares.find((sh) => sh.id === shareId);
  if (!target) return fail("That person is not part of this split.");
  if (target.isUser) {
    return fail(
      "Your own share is worked out from the others and cannot be edited.",
    );
  }
  // isInteger, not isSafeInteger: a huge whole number is "too large", and gets maxCents below.
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    return fail("Enter an amount of zero or more, in whole cents.");
  }
  const maxCents = split.totalCents - manualSum(split.shares, shareId);
  if (amountCents > maxCents) {
    return fail(
      `${target.name}'s share can be at most ${formatCents(maxCents)}.`,
      maxCents,
    );
  }
  const shares = split.shares.map((sh) =>
    sh.id === shareId
      ? {
          ...sh,
          amountCents,
          manual: true,
          requested: sh.amountCents === amountCents ? sh.requested : false,
        }
      : sh,
  );
  return { ok: true, split: rebalance(split.totalCents, shares) };
}

/** Change the original total; manual shares are kept, the rest rebalanced. */
export function setTotal(split: Split, totalCents: Cents): SplitResult {
  if (!isValidTotal(totalCents)) return fail(TOTAL_ERROR);
  const fixed = manualSum(split.shares);
  if (totalCents < fixed) {
    return fail(
      `The total cannot be less than ${formatCents(fixed)}, the sum of the amounts you set by hand.`,
    );
  }
  return { ok: true, split: rebalance(totalCents, split.shares) };
}

export function addPerson(split: Split, name: string): SplitResult {
  if (split.shares.length >= MAX_PEOPLE) {
    return fail(`A split can have at most ${MAX_PEOPLE} people.`);
  }
  const checked = checkName(name, split.shares);
  if ("error" in checked) return fail(checked.error);
  return {
    ok: true,
    split: rebalance(split.totalCents, [
      ...split.shares,
      newShare(checked.name),
    ]),
  };
}

/** Cannot remove the user; removing the last other person is an error (un-split instead). */
export function removePerson(split: Split, shareId: string): SplitResult {
  const target = split.shares.find((sh) => sh.id === shareId);
  if (!target) return fail("That person is not part of this split.");
  if (target.isUser) return fail("You cannot remove yourself from a split.");
  if (split.shares.length <= MIN_PEOPLE) {
    return fail(
      "A split needs at least one other person. Un-split the row instead.",
    );
  }
  return {
    ok: true,
    split: rebalance(
      split.totalCents,
      split.shares.filter((sh) => sh.id !== shareId),
    ),
  };
}

export function renamePerson(
  split: Split,
  shareId: string,
  name: string,
): SplitResult {
  const target = split.shares.find((sh) => sh.id === shareId);
  if (!target) return fail("That person is not part of this split.");
  if (target.isUser) return fail("Your own share cannot be renamed.");
  const checked = checkName(name, split.shares, shareId);
  if ("error" in checked) return fail(checked.error);
  return {
    ok: true,
    split: {
      totalCents: split.totalCents,
      shares: split.shares.map((sh) =>
        sh.id === shareId ? { ...sh, name: checked.name } : { ...sh },
      ),
    },
  };
}

/** Clears all manual flags and returns to equal shares. */
export function resetToEqual(split: Split): Split {
  return rebalance(
    split.totalCents,
    split.shares.map((sh) => ({ ...sh, manual: false })),
  );
}

export function hasRequestedShares(split: Split): boolean {
  return split.shares.some((sh) => !sh.isUser && sh.requested);
}

/** e.g. "Split 3 ways: You $33.34, Sam $33.33, Alex $33.33" */
export function describeSplit(split: Split): string {
  const parts = split.shares.map(
    (sh) => `${sh.name} ${formatCents(sh.amountCents)}`,
  );
  return `Split ${split.shares.length} ways: ${parts.join(", ")}`;
}
