import { describe, expect, it } from "vitest";
import { PdfPasswordError, textItemToPositioned } from "./pdf";

// Viewport transform of an unrotated US Letter page at scale 1: flips y around the page height.
const LETTER = [1, 0, 0, -1, 0, 792];

describe("textItemToPositioned", () => {
  it("converts a baseline-anchored item to top-left coordinates", () => {
    const item = {
      str: "10/03 COFFEE",
      transform: [10, 0, 0, 10, 72, 700],
      width: 60,
      height: 10,
    };
    expect(textItemToPositioned(item, LETTER)).toEqual({
      text: "10/03 COFFEE",
      x0: 72,
      x1: 132,
      y: 82,
      height: 10,
    });
  });

  it("places text lower on the page at a larger y", () => {
    const upper = textItemToPositioned(
      { str: "a", transform: [10, 0, 0, 10, 72, 700], width: 5, height: 10 },
      LETTER,
    );
    const lower = textItemToPositioned(
      { str: "b", transform: [10, 0, 0, 10, 72, 680], width: 5, height: 10 },
      LETTER,
    );
    expect(lower!.y).toBeGreaterThan(upper!.y);
  });

  it("applies the viewport scale to position, height and width", () => {
    const scaled = [2, 0, 0, -2, 0, 1584];
    const item = {
      str: "x",
      transform: [10, 0, 0, 10, 72, 700],
      width: 60,
      height: 10,
    };
    expect(textItemToPositioned(item, scaled, 2)).toEqual({
      text: "x",
      x0: 144,
      x1: 264,
      y: 164,
      height: 20,
    });
  });

  it("skips blank items", () => {
    expect(
      textItemToPositioned(
        { str: "  ", transform: [10, 0, 0, 10, 0, 0], width: 5, height: 0 },
        LETTER,
      ),
    ).toBeNull();
    expect(
      textItemToPositioned(
        { str: "", transform: [10, 0, 0, 10, 0, 0], width: 0, height: 0 },
        LETTER,
      ),
    ).toBeNull();
  });

  it("skips text rotated a quarter turn", () => {
    const sideways = {
      str: "margin note",
      transform: [0, 10, -10, 0, 30, 300],
      width: 60,
      height: 10,
    };
    expect(textItemToPositioned(sideways, LETTER)).toBeNull();
  });
});

describe("PdfPasswordError", () => {
  it("is an Error with its own name", () => {
    const error = new PdfPasswordError();
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("PdfPasswordError");
  });
});
