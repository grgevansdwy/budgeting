// Copies the pdf.js and Tesseract.js runtime assets from node_modules into public/vendor/ so the
// browser loads every worker, WASM file, font, cMap and language file from this app's own origin.
// Nothing is downloaded: a bank statement must never cause a request to a third party.
//
// Runs on postinstall, predev and prebuild. Safe to run repeatedly. Exits non-zero when a source
// file is missing or the copied pdf.js worker does not match the installed library version.

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const modules = join(root, "node_modules");
const vendor = join(root, "public", "vendor");

// English data for the LSTM engine (the only engine ocr.ts uses). This is the same variant
// Tesseract.js would otherwise fetch from its CDN when `lstmOnly` is true.
const ENG_DATA_VARIANT = "4.0.0_best_int";

/** [source relative to node_modules, destination relative to public/vendor] */
const assets = [
  // pdf.js
  // Legacy build: matches the legacy library imported in src/lib/extract/pdf.ts.
  ["pdfjs-dist/legacy/build/pdf.worker.min.mjs", "pdfjs/pdf.worker.min.mjs"],
  ["pdfjs-dist/cmaps", "pdfjs/cmaps"],
  ["pdfjs-dist/standard_fonts", "pdfjs/standard_fonts"],
  ["pdfjs-dist/wasm", "pdfjs/wasm"], // JPEG 2000 / JBIG2 / colour decoders, used when rendering scans
  ["pdfjs-dist/iccs", "pdfjs/iccs"],
  // Tesseract.js: worker script, then the three LSTM cores the worker picks between at runtime
  // (relaxed SIMD, SIMD, plain). Each .wasm.js file embeds its WASM binary, so no separate .wasm
  // is requested. The legacy (non-LSTM) cores are never loaded and are left out.
  ["tesseract.js/dist/worker.min.js", "tesseract/worker.min.js"],
  [
    "tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js",
    "tesseract/tesseract-core-relaxedsimd-lstm.wasm.js",
  ],
  [
    "tesseract.js-core/tesseract-core-simd-lstm.wasm.js",
    "tesseract/tesseract-core-simd-lstm.wasm.js",
  ],
  [
    "tesseract.js-core/tesseract-core-lstm.wasm.js",
    "tesseract/tesseract-core-lstm.wasm.js",
  ],
  [
    `@tesseract.js-data/eng/${ENG_DATA_VARIANT}/eng.traineddata.gz`,
    "tesseract/eng.traineddata.gz",
  ],
];

function fail(message) {
  console.error(`copy-vendor-assets: ${message}`);
  process.exit(1);
}

function packageVersion(name) {
  const file = join(modules, name, "package.json");
  if (!existsSync(file))
    fail(
      `${name} is not installed (missing ${relative(root, file)}). Run npm install.`,
    );
  return JSON.parse(readFileSync(file, "utf8")).version;
}

const versions = {
  "pdfjs-dist": packageVersion("pdfjs-dist"),
  "tesseract.js": packageVersion("tesseract.js"),
  "tesseract.js-core": packageVersion("tesseract.js-core"),
  "@tesseract.js-data/eng": `${packageVersion("@tesseract.js-data/eng")} (${ENG_DATA_VARIANT})`,
};

// Check every source before touching the destination, so a failure never leaves a half-copied tree.
const missing = assets
  .map(([from]) => from)
  .filter((from) => !existsSync(join(modules, from)));
if (missing.length > 0) {
  fail(
    `missing source file(s) in node_modules:\n  ${missing.join("\n  ")}\nRun npm install.`,
  );
}

// pdf.js refuses to run when the worker and the library versions differ.
const workerSource = readFileSync(
  join(modules, "pdfjs-dist/legacy/build/pdf.worker.min.mjs"),
  "utf8",
);
if (!workerSource.includes(`"${versions["pdfjs-dist"]}"`)) {
  fail(
    `pdf.worker.min.mjs does not mention pdfjs-dist version ${versions["pdfjs-dist"]}; worker and library would mismatch.`,
  );
}

for (const [from, to] of assets) {
  const source = join(modules, from);
  const target = join(vendor, to);
  const isDirectory = statSync(source).isDirectory();
  rmSync(target, { recursive: true, force: true }); // drop files left over from an older version
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, { recursive: isDirectory });
  console.log(
    `copied ${from}${isDirectory ? "/" : ""} -> public/vendor/${to}${isDirectory ? "/" : ""}`,
  );
}

writeFileSync(
  join(vendor, "versions.json"),
  `${JSON.stringify(versions, null, 2)}\n`,
);
console.log(`wrote public/vendor/versions.json ${JSON.stringify(versions)}`);
