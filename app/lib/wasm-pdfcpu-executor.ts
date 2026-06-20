/**
 * wasm-pdfcpu-executor.ts
 *
 * Preflight analysis wrapper that bridges a raw PDF `ArrayBuffer` to a live
 * pdfcpu Emscripten WASM module instance and returns structured metadata the
 * orchestrator uses to make routing and safety decisions before committing to
 * the expensive Ghostscript compression pass.
 *
 * ─── EMSCRIPTEN MEMORY MODEL — READ BEFORE EDITING ───────────────────────────
 *
 * pdfcpu is compiled to WASM via Emscripten (Go + TinyGo or wasm_exec.js
 * harness). Emscripten does NOT expose a native filesystem to the WASM binary.
 * Instead, it provides a Virtual File System (VFS) — an in-memory filesystem
 * whose entire byte payload lives inside the browser tab's JavaScript heap
 * (the same heap your React app uses).
 *
 * CRITICAL CONSEQUENCE: the VFS is NOT garbage-collected.
 *
 * Files written with `FS.writeFile()` remain allocated until explicitly
 * removed with `FS.unlink()`. In a long-running SPA like ours, skipping
 * cleanup will silently accumulate tens of megabytes per preflight call.
 * Unlike the Ghostscript executor, this function only writes ONE VFS file
 * (input.pdf) and produces no output file — but the same risk applies with
 * the same severity. Each preflight call on a 100 MB file leaks 100 MB of
 * WASM heap until `FS.unlink()` is called.
 *
 * The `finally` block is therefore not optional cleanup — it is the ONLY
 * mechanism preventing memory leaks. Do not remove it, do not move it inside
 * the `try`, and do not gate it on a success condition.
 *
 * ─── PDFCPU ARGUMENT CONTRACT ────────────────────────────────────────────────
 *
 * pdfcpu exposes a CLI-style interface via `callMain(args: string[])`. The
 * first positional argument is the sub-command. Unlike Ghostscript, pdfcpu
 * writes its analysis output to stdout, which Emscripten pipes to a capture
 * buffer we redirect before calling `callMain`. The input filename is always
 * the last positional argument.
 *
 * Commands used in this executor:
 * info    → prints page count, version, encryption status, and object stats
 *
 * ─── STDOUT CAPTURE ──────────────────────────────────────────────────────────
 *
 * pdfcpu WASM typically writes results to stdout, which Emscripten pipes to
 * the browser console. To intercept this output we temporarily replace
 * `wasmModule.print` (Emscripten's stdout handler) with a collecting function,
 * restore the original on completion, and parse the collected lines.
 *
 * This is the standard interception pattern for Emscripten CLI tools that
 * produce machine-readable output via stdout. It is synchronous-safe because
 * `callMain` blocks the event loop for its entire duration.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ---------------------------------------------------------------------------
// VFS path constant
// ---------------------------------------------------------------------------

/**
 * Bare root-level filename for the VFS input node.
 */
const VFS_INPUT_PATH = "input.pdf" as const;

// ---------------------------------------------------------------------------
// Business logic constants
// ---------------------------------------------------------------------------

/**
 * Maximum pixel count (width × height) for any single raster image embedded
 * in the PDF. Exceeding this limit risks exhausting the WASM linear memory
 * heap during Ghostscript's image decode pass, crashing the browser tab.
 */
const DECOMPRESSION_BOMB_PIXEL_CAP = 80_000_000 as const;

/**
 * Minimum ratio of vector path operators to raster image objects that
 * classifies a document as "vector-heavy". Documents above this threshold
 * are routed away from Ghostscript's raster downsampling pipeline.
 */
const VECTOR_HEAVY_PATH_TO_IMAGE_RATIO = 10 as const;

// ---------------------------------------------------------------------------
// Public result interface
// ---------------------------------------------------------------------------

export interface PdfPreflightMetadata {
  /**
   * Total number of pages in the document.
   */
  pageCount: number;

  /**
   * The largest single raster image pixel count (width × height) found in the
   * document. This is the maximum across all embedded `/XObject` `/Image`
   * dictionaries, not a sum.
   */
  maxPixels: number;

  /**
   * Whether the PDF's trailer contains an `/Encrypt` dictionary.
   */
  isEncrypted: boolean;

  /**
   * Whether the document's content is predominantly vector paths rather than
   * raster images.
   */
  isVectorHeavy: boolean;

  /**
   * Size of the source PDF in bytes, captured before any processing.
   */
  originalBytes: number;
}

// ---------------------------------------------------------------------------
// Emscripten module interface
// ---------------------------------------------------------------------------

interface PdfcpuWasmModule {
  FS: {
    writeFile(path: string, data: Uint8Array): void;
    unlink(path: string): void;
  };
  print?: (line: string) => void;
  callMain(args: string[]): number;
}

// ---------------------------------------------------------------------------
// VFS cleanup helper
// ---------------------------------------------------------------------------

function safeUnlink(wasmModule: PdfcpuWasmModule, path: string): void {
  try {
    wasmModule.FS.unlink(path);
  } catch {
    // File did not exist or was already removed. Safe to ignore.
  }
}

// ---------------------------------------------------------------------------
// stdout capture helper
// ---------------------------------------------------------------------------

function captureStdout(
  wasmModule: PdfcpuWasmModule,
  fn: () => void,
): string[] {
  const lines: string[] = [];
  const originalPrint = wasmModule.print;

  wasmModule.print = (line: string) => {
    lines.push(line);
  };

  try {
    fn();
  } finally {
    wasmModule.print = originalPrint;
  }

  return lines;
}

// ---------------------------------------------------------------------------
// pdfcpu stdout parsers
// ---------------------------------------------------------------------------

function parsePageCount(lines: string[]): number {
  for (const line of lines) {
    const match = line.match(/^\s*pages\s*:\s*(\d+)/i);
    if (match) {
      const count = parseInt(match[1], 10);
      return Number.isFinite(count) && count >= 0 ? count : 0;
    }
  }
  return 0;
}

function parseIsEncrypted(lines: string[]): boolean {
  for (const line of lines) {
    const match = line.match(/^\s*encrypted\s*:\s*(.+)/i);
    if (match) {
      return match[1].trim().toLowerCase().startsWith("yes");
    }
  }
  return false;
}

function parseMaxPixels(lines: string[]): number {
  let max = 0;

  for (const line of lines) {
    const match = line.match(/image\s*\d*\s*:\s*(\d+)\s*[xX×]\s*(\d+)/i);
    if (match) {
      const w = parseInt(match[1], 10);
      const h = parseInt(match[2], 10);
      if (Number.isFinite(w) && Number.isFinite(h)) {
        const pixels = w * h;
        if (pixels > max) {
          max = pixels;
        }
      }
    }
  }

  return max;
}

function parseIsVectorHeavy(lines: string[]): boolean {
  let pathOperators = 0;
  let imageCount = 0;
  let foundPathData = false;

  for (const line of lines) {
    const pathMatch = line.match(/^\s*path\s+operators?\s*:\s*(\d+)/i);
    if (pathMatch) {
      const n = parseInt(pathMatch[1], 10);
      if (Number.isFinite(n)) {
        pathOperators = n;
        foundPathData = true;
      }
    }

    const imageMatch = line.match(/^\s*image(?:\s+xobjects?)?\s*:\s*(\d+)/i);
    if (imageMatch) {
      const n = parseInt(imageMatch[1], 10);
      if (Number.isFinite(n)) {
        imageCount = n;
      }
    }
  }

  if (!foundPathData) return false;
  if (imageCount === 0 && pathOperators > 0) return true;

  if (imageCount > 0) {
    return (pathOperators / imageCount) > VECTOR_HEAVY_PATH_TO_IMAGE_RATIO;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Public executor
// ---------------------------------------------------------------------------

export async function analyzePdfPreflight(
  wasmModule: any,
  fileBytes: ArrayBuffer,
): Promise<PdfPreflightMetadata> {

  const pdfcpu = wasmModule as PdfcpuWasmModule;
  const originalBytes = fileBytes.byteLength;

  try {
    pdfcpu.FS.writeFile(
      VFS_INPUT_PATH,
      new Uint8Array(fileBytes),
    );

    const stdoutLines = captureStdout(pdfcpu, () => {
      const exitCode = pdfcpu.callMain(["info", VFS_INPUT_PATH]);

      if (exitCode >= 2) {
        throw new Error(
          `pdfcpu info exited with fatal code ${exitCode}. ` +
          `The input may be a malformed, non-PDF, or access-restricted file.`,
        );
      }
    });

    const pageCount = parsePageCount(stdoutLines);
    const maxPixels = parseMaxPixels(stdoutLines);
    const isEncrypted = parseIsEncrypted(stdoutLines);
    const isVectorHeavy = parseIsVectorHeavy(stdoutLines);

    if (isEncrypted) {
      throw new PdfEncryptedError(
        "The PDF is password-protected. Decryption must be performed before compression. " +
        "Pass the password to the WASM module and retry.",
      );
    }

    return {
      pageCount,
      maxPixels,
      isEncrypted,
      isVectorHeavy,
      originalBytes,
    };

  } finally {
    // ── MEMORY SAFETY: MANDATORY VFS CLEANUP ──
    // safeUnlink is used because the write may have failed before full file creation.
    safeUnlink(pdfcpu, VFS_INPUT_PATH);

    // FUTURE-PROOFING NOTE: pdfcpu 'info' currently writes its report to stdout only.
    // If a future version or sub-command (e.g. optimize, decrypt) is added that writes 
    // an output file node to the VFS, a second unconditional `safeUnlink(pdfcpu, VFS_OUTPUT_PATH);`
    // MUST be added here immediately to prevent silent heap leaks.
  }
}

// ---------------------------------------------------------------------------
// Typed error classes
// ---------------------------------------------------------------------------

export class PdfEncryptedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfEncryptedError";
  }
}

export { DECOMPRESSION_BOMB_PIXEL_CAP as PREFLIGHT_PIXEL_CAP };
