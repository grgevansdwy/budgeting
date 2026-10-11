import { describe, expect, it } from "vitest";
import { chooseScale, greyscaleInPlace } from "./ocr";

describe("chooseScale", () => {
  it("enlarges a narrow screenshot to about 2000px wide", () => {
    expect(chooseScale(1000, 800)).toBe(2);
  });

  it("caps the enlargement at 3x", () => {
    expect(chooseScale(300, 200)).toBe(3);
  });

  it("leaves an image that is already wide enough alone", () => {
    expect(chooseScale(2400, 1800)).toBe(1);
  });

  it("limits the total size of a very long screenshot", () => {
    const scale = chooseScale(1170, 12000);
    expect(scale).toBeLessThan(1.71);
    expect(1170 * scale * 12000 * scale).toBeLessThanOrEqual(16_000_000 + 1);
  });

  it("shrinks an enormous image", () => {
    expect(chooseScale(8000, 8000)).toBeCloseTo(0.5);
  });

  it("returns 1 for an empty image", () => {
    expect(chooseScale(0, 0)).toBe(1);
  });
});

describe("greyscaleInPlace", () => {
  it("converts colour to grey and makes pixels opaque", () => {
    const data = new Uint8ClampedArray([255, 255, 255, 255, 255, 0, 0, 128]);
    const result = greyscaleInPlace(data);
    expect(result.inverted).toBe(false);
    expect(Array.from(data)).toEqual([255, 255, 255, 255, 76, 76, 76, 255]);
  });

  it("keeps a light image as it is", () => {
    const data = new Uint8ClampedArray([
      240, 240, 240, 255, 20, 20, 20, 255, 250, 250, 250, 255,
    ]);
    expect(greyscaleInPlace(data).inverted).toBe(false);
    expect(data[0]).toBe(240);
    expect(data[4]).toBe(20);
  });

  it("inverts a dark-mode image so text becomes dark on light", () => {
    const data = new Uint8ClampedArray([
      18, 18, 18, 255, 18, 18, 18, 255, 230, 230, 230, 255,
    ]);
    const result = greyscaleInPlace(data);
    expect(result.inverted).toBe(true);
    expect(result.meanLuminance).toBeCloseTo((18 + 18 + 230) / 3);
    expect(Array.from(data)).toEqual([
      237, 237, 237, 255, 237, 237, 237, 255, 25, 25, 25, 255,
    ]);
  });

  it("handles an empty buffer", () => {
    expect(greyscaleInPlace(new Uint8ClampedArray(0))).toEqual({
      meanLuminance: 255,
      inverted: false,
    });
  });
});
