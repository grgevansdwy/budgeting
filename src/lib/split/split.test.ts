import { describe, expect, it } from "vitest";
import type { Split } from "../types";
import {
  MAX_PEOPLE,
  MIN_PEOPLE,
  USER_SHARE_NAME,
  addPerson,
  createEqualSplit,
  describeSplit,
  hasRequestedShares,
  removePerson,
  renamePerson,
  resetToEqual,
  setShareAmount,
  setTotal,
  type SplitResult,
} from "./split";

function ok(result: SplitResult): Split {
  if (!result.ok) throw new Error(`Expected ok, got: ${result.error}`);
  return result.split;
}

function err(result: SplitResult): { error: string; maxCents?: number } {
  if (result.ok) throw new Error("Expected an error");
  expect(result.error.trim().length).toBeGreaterThan(0);
  return result;
}

function amounts(split: Split): number[] {
  return split.shares.map((sh) => sh.amountCents);
}

function make(totalCents: number, ...names: string[]): Split {
  return ok(createEqualSplit(totalCents, names));
}

/** Simulates the store's markShareRequested. */
function request(split: Split, shareId: string): Split {
  return {
    ...split,
    shares: split.shares.map((sh) =>
      sh.id === shareId ? { ...sh, requested: true } : sh,
    ),
  };
}

function assertInvariant(split: Split): void {
  let sum = 0;
  for (const sh of split.shares) {
    expect(Number.isSafeInteger(sh.amountCents)).toBe(true);
    expect(sh.amountCents).toBeGreaterThanOrEqual(0);
    sum += sh.amountCents;
  }
  expect(sum).toBe(split.totalCents);
  expect(Number.isSafeInteger(split.totalCents)).toBe(true);
  expect(split.totalCents).toBeGreaterThan(0);
  expect(split.shares.length).toBeGreaterThanOrEqual(MIN_PEOPLE);
  expect(split.shares.length).toBeLessThanOrEqual(MAX_PEOPLE);
  expect(split.shares[0].isUser).toBe(true);
  expect(split.shares[0].manual).toBe(false);
  expect(split.shares[0].name).toBe(USER_SHARE_NAME);
  expect(split.shares.filter((sh) => sh.isUser)).toHaveLength(1);
  const names = split.shares.map((sh) => sh.name.toLowerCase());
  expect(new Set(names).size).toBe(names.length);
  expect(new Set(split.shares.map((sh) => sh.id)).size).toBe(names.length);
}

describe("createEqualSplit", () => {
  it("splits $100.00 three ways as 3334 / 3333 / 3333", () => {
    const split = make(10000, "Sam", "Alex");
    expect(amounts(split)).toEqual([3334, 3333, 3333]);
    expect(split.totalCents).toBe(10000);
    expect(split.shares.map((sh) => sh.name)).toEqual(["You", "Sam", "Alex"]);
    expect(split.shares.map((sh) => sh.isUser)).toEqual([true, false, false]);
    for (const sh of split.shares) {
      expect(sh.manual).toBe(false);
      expect(sh.requested).toBe(false);
      expect(sh.id).toMatch(/^[0-9a-f-]{36}$/);
    }
    assertInvariant(split);
  });

  it("splits $0.01 two ways as 1 / 0", () => {
    expect(amounts(make(1, "Sam"))).toEqual([1, 0]);
  });

  it("gives every leftover cent to the user", () => {
    expect(amounts(make(7, "Sam", "Alex", "Robin"))).toEqual([4, 1, 1, 1]);
    expect(amounts(make(2, "Sam", "Alex"))).toEqual([2, 0, 0]);
    expect(amounts(make(100, "Sam"))).toEqual([50, 50]);
  });

  it("trims names", () => {
    expect(make(100, "  Sam  ").shares[1].name).toBe("Sam");
  });

  it("rejects a people count outside 2..20", () => {
    err(createEqualSplit(1000, []));
    const nineteen = Array.from({ length: 19 }, (_, i) => `Person ${i + 1}`);
    expect(make(1000, ...nineteen).shares).toHaveLength(20);
    err(createEqualSplit(1000, [...nineteen, "Person 20"]));
  });

  it("rejects bad totals", () => {
    for (const total of [
      0,
      -100,
      12.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      err(createEqualSplit(total, ["Sam"]));
    }
  });

  it("rejects empty, duplicate and reserved names", () => {
    err(createEqualSplit(1000, ["Sam", "   "]));
    err(createEqualSplit(1000, [""]));
    err(createEqualSplit(1000, ["Sam", "sam"]));
    err(createEqualSplit(1000, ["Sam", " SAM "]));
    err(createEqualSplit(1000, ["You"]));
    err(createEqualSplit(1000, [" you "]));
  });

  it("does not mutate the names array", () => {
    const names = [" Sam ", "Alex"];
    make(1000, ...names);
    expect(names).toEqual([" Sam ", "Alex"]);
  });
});

describe("setShareAmount", () => {
  it("marks the share manual and rebalances the others, keeping the total", () => {
    const split = make(10000, "Sam", "Alex");
    const next = ok(setShareAmount(split, split.shares[1].id, 5000));
    expect(amounts(next)).toEqual([2500, 5000, 2500]);
    expect(next.shares.map((sh) => sh.manual)).toEqual([false, true, false]);
    expect(next.totalCents).toBe(10000);
    assertInvariant(next);
  });

  it("gives rebalance leftovers to the user", () => {
    const split = make(10000, "Sam", "Alex", "Robin");
    const next = ok(setShareAmount(split, split.shares[1].id, 999));
    // 9001 over three non-manual shares: 3000 each, 1 left over.
    expect(amounts(next)).toEqual([3001, 999, 3000, 3000]);
  });

  it("keeps an earlier manual share when another is edited", () => {
    const split = make(10000, "Sam", "Alex", "Robin");
    const a = ok(setShareAmount(split, split.shares[1].id, 1000));
    expect(amounts(a)).toEqual([3000, 1000, 3000, 3000]);
    const b = ok(setShareAmount(a, a.shares[2].id, 2001));
    expect(amounts(b)).toEqual([3500, 1000, 2001, 3499]);
    expect(b.shares.map((sh) => sh.manual)).toEqual([false, true, true, false]);
    // Re-editing a manual share only counts the *other* manual shares against the maximum.
    const c = ok(setShareAmount(b, b.shares[1].id, 7999));
    expect(amounts(c)).toEqual([0, 7999, 2001, 0]);
  });

  it("gives the user the whole remainder when every other share is manual", () => {
    const split = make(10000, "Sam", "Alex");
    const a = ok(setShareAmount(split, split.shares[1].id, 1234));
    const b = ok(setShareAmount(a, a.shares[2].id, 4321));
    expect(amounts(b)).toEqual([4445, 1234, 4321]);
    expect(b.shares[0].manual).toBe(false);
  });

  it("allows zero and the exact maximum", () => {
    const split = make(10000, "Sam", "Alex");
    const zero = ok(setShareAmount(split, split.shares[1].id, 0));
    expect(amounts(zero)).toEqual([5000, 0, 5000]);
    const max = ok(setShareAmount(split, split.shares[1].id, 10000));
    expect(amounts(max)).toEqual([0, 10000, 0]);
  });

  it("rejects an amount above the maximum and reports maxCents", () => {
    const split = make(10000, "Sam", "Alex");
    const first = err(setShareAmount(split, split.shares[1].id, 10001));
    expect(first.maxCents).toBe(10000);
    expect(first.error).toContain("$100.00");

    const a = ok(setShareAmount(split, split.shares[1].id, 6000));
    const second = err(setShareAmount(a, a.shares[2].id, 4001));
    expect(second.maxCents).toBe(4000);
    expect(second.error).toContain("$40.00");
    // The share's own manual amount does not count against its own maximum.
    expect(err(setShareAmount(a, a.shares[1].id, 10001)).maxCents).toBe(10000);
  });

  it("rejects negative and non-integer amounts without maxCents", () => {
    const split = make(10000, "Sam");
    for (const amount of [-1, 12.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = err(setShareAmount(split, split.shares[1].id, amount));
      expect(result.maxCents).toBeUndefined();
    }
  });

  it("rejects editing the user's share and unknown ids", () => {
    const split = make(10000, "Sam");
    err(setShareAmount(split, split.shares[0].id, 100));
    err(setShareAmount(split, "no-such-id", 100));
  });

  it("does not mutate the input", () => {
    const split = make(10000, "Sam", "Alex");
    const before = structuredClone(split);
    const next = ok(setShareAmount(split, split.shares[1].id, 5000));
    err(setShareAmount(split, split.shares[1].id, 999999));
    expect(split).toEqual(before);
    expect(next).not.toBe(split);
    expect(next.shares).not.toBe(split.shares);
    for (let i = 0; i < next.shares.length; i++) {
      expect(next.shares[i]).not.toBe(split.shares[i]);
    }
  });
});

describe("setTotal", () => {
  it("rebalances equal shares when the total goes up or down", () => {
    const split = make(10000, "Sam", "Alex");
    expect(amounts(ok(setTotal(split, 20000)))).toEqual([6668, 6666, 6666]);
    expect(amounts(ok(setTotal(split, 100)))).toEqual([34, 33, 33]);
  });

  it("keeps manual shares and rebalances the rest", () => {
    const split = make(10000, "Sam", "Alex");
    const manual = ok(setShareAmount(split, split.shares[1].id, 4000));
    const up = ok(setTotal(manual, 12001));
    expect(amounts(up)).toEqual([4001, 4000, 4000]);
    expect(up.shares[1].manual).toBe(true);
    const down = ok(setTotal(manual, 4000));
    expect(amounts(down)).toEqual([0, 4000, 0]);
    assertInvariant(up);
    assertInvariant(down);
  });

  it("rejects a total below the manual sum", () => {
    const split = make(10000, "Sam", "Alex");
    const a = ok(setShareAmount(split, split.shares[1].id, 4000));
    const b = ok(setShareAmount(a, a.shares[2].id, 1000));
    const result = err(setTotal(b, 4999));
    expect(result.error).toContain("$50.00");
    expect(amounts(ok(setTotal(b, 5000)))).toEqual([0, 4000, 1000]);
  });

  it("rejects bad totals", () => {
    const split = make(10000, "Sam");
    for (const total of [0, -1, 99.5, Number.NaN, 2 ** 53]) {
      err(setTotal(split, total));
    }
  });

  it("does not mutate the input", () => {
    const split = make(10000, "Sam", "Alex");
    const before = structuredClone(split);
    ok(setTotal(split, 555));
    expect(split).toEqual(before);
  });
});

describe("addPerson", () => {
  it("adds a non-manual share at the end and rebalances", () => {
    const split = make(10000, "Sam");
    const next = ok(addPerson(split, "  Alex "));
    expect(amounts(next)).toEqual([3334, 3333, 3333]);
    const added = next.shares[2];
    expect(added).toMatchObject({
      name: "Alex",
      isUser: false,
      manual: false,
      requested: false,
    });
    expect(added.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(next.shares[1].id).toBe(split.shares[1].id);
  });

  it("keeps manual shares", () => {
    const split = make(10000, "Sam");
    const manual = ok(setShareAmount(split, split.shares[1].id, 7000));
    const next = ok(addPerson(manual, "Alex"));
    expect(amounts(next)).toEqual([1500, 7000, 1500]);
  });

  it("rejects empty, duplicate and reserved names", () => {
    const split = make(10000, "Sam");
    err(addPerson(split, "  "));
    err(addPerson(split, "SAM"));
    err(addPerson(split, "you"));
  });

  it("rejects a 21st person", () => {
    let split = make(10000, "Person 1");
    for (let i = 2; i <= 19; i++) split = ok(addPerson(split, `Person ${i}`));
    expect(split.shares).toHaveLength(MAX_PEOPLE);
    err(addPerson(split, "Person 20"));
  });

  it("does not mutate the input", () => {
    const split = make(10000, "Sam");
    const before = structuredClone(split);
    ok(addPerson(split, "Alex"));
    expect(split).toEqual(before);
  });
});

describe("removePerson", () => {
  it("removes the share and rebalances the rest", () => {
    const split = make(10000, "Sam", "Alex", "Robin");
    const next = ok(removePerson(split, split.shares[2].id));
    expect(next.shares.map((sh) => sh.name)).toEqual(["You", "Sam", "Robin"]);
    expect(amounts(next)).toEqual([3334, 3333, 3333]);
  });

  it("frees a removed manual amount and keeps the other manual shares", () => {
    const split = make(10000, "Sam", "Alex", "Robin");
    const a = ok(setShareAmount(split, split.shares[1].id, 6000));
    const b = ok(setShareAmount(a, a.shares[2].id, 1000));
    const next = ok(removePerson(b, b.shares[1].id));
    expect(amounts(next)).toEqual([4500, 1000, 4500]);
  });

  it("rejects removing the user, the last other person and unknown ids", () => {
    const three = make(10000, "Sam", "Alex");
    err(removePerson(three, three.shares[0].id));
    err(removePerson(three, "no-such-id"));
    const two = make(10000, "Sam");
    const result = err(removePerson(two, two.shares[1].id));
    expect(result.error.toLowerCase()).toContain("un-split");
  });

  it("does not mutate the input", () => {
    const split = make(10000, "Sam", "Alex");
    const before = structuredClone(split);
    ok(removePerson(split, split.shares[1].id));
    expect(split).toEqual(before);
  });
});

describe("renamePerson", () => {
  it("renames with trimming and changes nothing else", () => {
    const split = request(make(10000, "Sam", "Alex"), "");
    const withRequested = request(split, split.shares[1].id);
    const next = ok(
      renamePerson(withRequested, split.shares[1].id, "  Sammy "),
    );
    expect(next.shares[1]).toEqual({
      ...withRequested.shares[1],
      name: "Sammy",
    });
    expect(amounts(next)).toEqual(amounts(split));
    expect(next.shares[1].requested).toBe(true);
  });

  it("allows changing only the case of a share's own name", () => {
    const split = make(10000, "sam", "Alex");
    expect(
      ok(renamePerson(split, split.shares[1].id, "Sam")).shares[1].name,
    ).toBe("Sam");
  });

  it("rejects empty, duplicate and reserved names, the user and unknown ids", () => {
    const split = make(10000, "Sam", "Alex");
    err(renamePerson(split, split.shares[1].id, " "));
    err(renamePerson(split, split.shares[1].id, "alex"));
    err(renamePerson(split, split.shares[1].id, "YOU"));
    err(renamePerson(split, split.shares[0].id, "Me"));
    err(renamePerson(split, "no-such-id", "Robin"));
  });

  it("does not mutate the input", () => {
    const split = make(10000, "Sam");
    const before = structuredClone(split);
    ok(renamePerson(split, split.shares[1].id, "Robin"));
    expect(split).toEqual(before);
  });
});

describe("resetToEqual", () => {
  it("clears manual flags and returns to equal shares", () => {
    const split = make(10000, "Sam", "Alex");
    const a = ok(setShareAmount(split, split.shares[1].id, 9000));
    const b = ok(setShareAmount(a, a.shares[2].id, 1000));
    const before = structuredClone(b);
    const reset = resetToEqual(b);
    expect(amounts(reset)).toEqual([3334, 3333, 3333]);
    expect(reset.shares.every((sh) => !sh.manual)).toBe(true);
    expect(b).toEqual(before);
    assertInvariant(reset);
  });
});

describe("requested flags", () => {
  it("resets requested on a directly edited share whose amount changes", () => {
    const split = make(10000, "Sam", "Alex");
    const requested = request(split, split.shares[1].id);
    const next = ok(setShareAmount(requested, split.shares[1].id, 3000));
    expect(next.shares[1].requested).toBe(false);
  });

  it("keeps requested when a share is set to the amount it already has", () => {
    const split = make(10000, "Sam", "Alex");
    const requested = request(split, split.shares[1].id);
    const next = ok(setShareAmount(requested, split.shares[1].id, 3333));
    expect(next.shares[1]).toMatchObject({ manual: true, requested: true });
    expect(amounts(next)).toEqual([3334, 3333, 3333]);
  });

  it("resets requested on rebalanced shares and keeps it on unchanged ones", () => {
    const split = make(10000, "Sam", "Alex", "Robin");
    const pinned = ok(setShareAmount(split, split.shares[1].id, 2500));
    let state = request(pinned, pinned.shares[1].id); // manual, will not move
    state = request(state, state.shares[2].id); // non-manual, will move
    const next = ok(setShareAmount(state, state.shares[3].id, 100));
    expect(amounts(next)).toEqual([3700, 2500, 3700, 100]);
    expect(next.shares[1].requested).toBe(true);
    expect(next.shares[2].requested).toBe(false);
  });

  it("applies the same rule to setTotal, addPerson, removePerson and resetToEqual", () => {
    const split = make(10000, "Sam", "Alex");
    const pinned = ok(setShareAmount(split, split.shares[1].id, 2000));
    let state = request(pinned, pinned.shares[1].id);
    state = request(state, state.shares[2].id);
    expect(hasRequestedShares(state)).toBe(true);

    const total = ok(setTotal(state, 12000));
    expect(total.shares.map((sh) => sh.requested)).toEqual([
      false,
      true,
      false,
    ]);

    const added = ok(addPerson(state, "Robin"));
    expect(added.shares.map((sh) => sh.requested)).toEqual([
      false,
      true,
      false,
      false,
    ]);

    const removed = ok(removePerson(state, state.shares[2].id));
    expect(removed.shares.map((sh) => sh.requested)).toEqual([false, true]);

    const reset = resetToEqual(state);
    expect(reset.shares.map((sh) => sh.requested)).toEqual([
      false,
      false,
      false,
    ]);

    // A rebalance that lands on the same amount keeps the flag.
    const sameTotal = ok(setTotal(state, 10000));
    expect(sameTotal.shares.map((sh) => sh.requested)).toEqual([
      false,
      true,
      true,
    ]);
    const equal = request(split, split.shares[2].id);
    expect(resetToEqual(equal).shares[2].requested).toBe(true);
  });

  it("hasRequestedShares ignores the user's share", () => {
    const split = make(10000, "Sam");
    expect(hasRequestedShares(split)).toBe(false);
    expect(hasRequestedShares(request(split, split.shares[0].id))).toBe(false);
    expect(hasRequestedShares(request(split, split.shares[1].id))).toBe(true);
  });
});

describe("describeSplit", () => {
  it("lists every share with its amount", () => {
    expect(describeSplit(make(10000, "Sam", "Alex"))).toBe(
      "Split 3 ways: You $33.34, Sam $33.33, Alex $33.33",
    );
    expect(describeSplit(make(1, "Sam"))).toBe(
      "Split 2 ways: You $0.01, Sam $0.00",
    );
    expect(describeSplit(make(250000, "Sam"))).toBe(
      "Split 2 ways: You $1,250.00, Sam $1,250.00",
    );
  });
});

// Small deterministic PRNG (mulberry32) so the property loop is repeatable.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("invariant under random edits", () => {
  const totals = [
    1,
    2,
    3,
    7,
    19,
    20,
    21,
    99,
    100,
    101,
    1000,
    3333,
    10000,
    999999,
    123456789,
    Number.MAX_SAFE_INTEGER,
  ];

  it("holds after every operation for many totals and people counts", () => {
    const rand = mulberry32(20261011);
    const int = (maxInclusive: number) =>
      Math.floor(rand() * (maxInclusive + 1));
    let successes = 0;
    let rejections = 0;

    for (const total of totals) {
      for (let people = MIN_PEOPLE; people <= MAX_PEOPLE; people++) {
        const names = Array.from({ length: people - 1 }, (_, i) => `P${i + 1}`);
        let split = make(total, ...names);
        assertInvariant(split);
        const each = Math.floor(total / people);
        expect(split.shares[0].amountCents).toBe(total - each * (people - 1));
        for (const sh of split.shares.slice(1)) {
          expect(sh.amountCents).toBe(each);
        }
        let nameCounter = people;

        for (let step = 0; step < 40; step++) {
          const before = structuredClone(split);
          const others = split.shares.slice(1);
          const pick = others[int(others.length - 1)];
          const manualOthers = others
            .filter((sh) => sh.manual && sh.id !== pick.id)
            .reduce((acc, sh) => acc + sh.amountCents, 0);
          const max = split.totalCents - manualOthers;
          let result: SplitResult | null = null;
          let expectOk = true;

          switch (int(9)) {
            case 0:
            case 1:
            case 2: {
              // Valid edit, biased towards the edges.
              const r = int(5);
              const amount = r === 0 ? 0 : r === 1 ? max : int(max);
              result = setShareAmount(split, pick.id, amount);
              break;
            }
            case 3: {
              result = setShareAmount(split, pick.id, max + 1 + int(50));
              expectOk = false;
              if (!result.ok) expect(result.maxCents).toBe(max);
              break;
            }
            case 4: {
              const manual = others
                .filter((sh) => sh.manual)
                .reduce((acc, sh) => acc + sh.amountCents, 0);
              const floor = Math.max(1, manual);
              const span = Math.min(
                Number.MAX_SAFE_INTEGER - floor,
                split.totalCents,
              );
              result = setTotal(split, floor + int(span));
              break;
            }
            case 5: {
              const manual = others
                .filter((sh) => sh.manual)
                .reduce((acc, sh) => acc + sh.amountCents, 0);
              result = setTotal(split, manual - 1);
              expectOk = false;
              break;
            }
            case 6: {
              result = addPerson(split, `P${++nameCounter}`);
              expectOk = split.shares.length < MAX_PEOPLE;
              break;
            }
            case 7: {
              result = removePerson(split, pick.id);
              expectOk = split.shares.length > MIN_PEOPLE;
              break;
            }
            case 8: {
              result = renamePerson(split, pick.id, `P${++nameCounter}`);
              break;
            }
            default: {
              split = resetToEqual(split);
              expect(split.shares.every((sh) => !sh.manual)).toBe(true);
            }
          }

          if (result) {
            expect(result.ok).toBe(expectOk);
            if (result.ok) {
              split = result.split;
              successes++;
            } else {
              // A rejection changes nothing.
              expect(split).toEqual(before);
              rejections++;
            }
          }
          assertInvariant(split);

          // Non-manual others are always equal, and the user never gets less than them.
          const flexible = split.shares.filter(
            (sh) => !sh.isUser && !sh.manual,
          );
          for (const sh of flexible) {
            expect(sh.amountCents).toBe(flexible[0].amountCents);
            expect(split.shares[0].amountCents).toBeGreaterThanOrEqual(
              sh.amountCents,
            );
          }
          // Manual shares that existed before and still exist keep their amount, unless they
          // were the one just edited or everything was reset.
          if (result?.ok) {
            for (const sh of split.shares) {
              const old = before.shares.find((o) => o.id === sh.id);
              if (old?.manual && sh.manual && sh.id !== pick.id) {
                expect(sh.amountCents).toBe(old.amountCents);
              }
            }
          }
        }
      }
    }
    expect(successes).toBeGreaterThan(5000);
    expect(rejections).toBeGreaterThan(1000);
  });
});
