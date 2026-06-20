import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
const destDir = join(root, "public");
const dest = join(destDir, "pdf.worker.min.mjs");

if (!existsSync(src)) {
  console.warn("pdfjs-dist worker not found, skipping copy");
  process.exit(0);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log("Copied pdf.worker.min.mjs to public/");

// Copy Ghostscript WASM binary
const gsSrc = join(root, "node_modules/@jspawn/ghostscript-wasm/gs.wasm");
const gsDestDir = join(destDir, "assets/wasm");
const gsDest = join(gsDestDir, "gs.wasm");

if (existsSync(gsSrc)) {
  mkdirSync(gsDestDir, { recursive: true });
  copyFileSync(gsSrc, gsDest);
  console.log("Copied gs.wasm to public/assets/wasm/");
} else {
  console.warn("Ghostscript WASM binary not found, skipping copy");
}

