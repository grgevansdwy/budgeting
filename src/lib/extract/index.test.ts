import { describe, expect, it } from "vitest";
import { ExtractionError, extractFile, isSupportedFile } from "./index";

function file(name: string, type: string): File {
  return new File(["made-up bytes"], name, {
    type,
    lastModified: 1_790_000_000_000,
  });
}

describe("isSupportedFile", () => {
  it.each([
    ["statement.pdf", "application/pdf"],
    ["shot.png", "image/png"],
    ["photo.jpg", "image/jpeg"],
    ["shot.webp", "image/webp"],
    ["no-extension", "application/pdf"],
  ])("accepts %s (%s)", (name, type) => {
    expect(isSupportedFile(file(name, type))).toBe(true);
  });

  it.each([
    "statement.PDF",
    "shot.png",
    "photo.JPEG",
    "photo.jpg",
    "shot.webp",
  ])("falls back to the extension when %s has no type", (name) => {
    expect(isSupportedFile(file(name, ""))).toBe(true);
    expect(isSupportedFile(file(name, "application/octet-stream"))).toBe(true);
  });

  it.each([
    ["export.csv", "text/csv"],
    ["photo.heic", "image/heic"],
    ["anim.gif", "image/gif"],
    ["notes.txt", ""],
    ["pdf", ""],
    ["renamed.pdf", "text/plain"],
  ])("rejects %s (%s)", (name, type) => {
    expect(isSupportedFile(file(name, type))).toBe(false);
  });
});

describe("ExtractionError", () => {
  it("carries a code", () => {
    const error = new ExtractionError("password-protected", "locked");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ExtractionError");
    expect(error.code).toBe("password-protected");
    expect(error.message).toBe("locked");
  });
});

describe("extractFile", () => {
  it("rejects an unsupported type before loading any library", async () => {
    await expect(
      extractFile(file("export.csv", "text/csv")),
    ).rejects.toMatchObject({
      name: "ExtractionError",
      code: "unsupported-type",
    });
  });
});
