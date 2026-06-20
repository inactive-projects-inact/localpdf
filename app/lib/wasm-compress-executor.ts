/**
 * wasm-compress-executor.ts
 *
 * Low-level execution wrapper that bridges our typed `CompressTierConfig`
 * to a live Ghostscript Emscripten WASM module instance.
 *
 * ─── EMSCRIPTEN MEMORY MODEL — READ BEFORE EDITING ───────────────────────────
 *
 * Ghostscript is compiled to WASM via Emscripten. Emscripten does NOT expose
 * a native filesystem to the WASM binary. Instead, it provides a Virtual File
 * System (VFS) — an in-memory filesystem whose entire byte payload lives inside
 * the browser tab's JavaScript heap (the same heap your React app uses).
 *
 * CRITICAL CONSEQUENCE: the VFS is NOT garbage-collected.
 *
 * Files written with `FS.writeFile()` remain allocated until explicitly
 * removed with `FS.unlink()`. In a long-running SPA like ours, skipping
 * cleanup will silently accumulate tens of megabytes per job. On a 4–8 GB
 * device running multiple browser tabs, this WILL trigger OOM tab crashes
 * — not on the first job, but eventually and unpredictably.
 *
 * The `finally` block at the bottom of `executeWasmCompression` is therefore
 * not optional cleanup — it is the ONLY mechanism preventing memory leaks.
 * Do not remove it, do not move it inside the `try`, and do not gate it on
 * a success condition.
 *
 * ─── GHOSTSCRIPT ARGUMENT CONTRACT ───────────────────────────────────────────
 *
 * `callMain(args: string[])` mimics the Ghostscript CLI. Every parameter
 * that controls rendering behaviour must be passed as a discrete string in
 * the array — Ghostscript does not accept a single concatenated command string.
 * The positional input filename (`input.pdf`) must be the last argument.
 * The output path (`-sOutputFile=output.pdf`) must be an absolute VFS path or
 * a bare filename relative to the VFS root ("/").
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { CompressTierConfig } from "./compress-worker-protocol";

// ---------------------------------------------------------------------------
// Internal VFS path constants
// ---------------------------------------------------------------------------

/**
 * Both paths are intentionally kept as simple root-level filenames.
 *
 * Emscripten's default FS mount point is "/". Using bare filenames avoids
 * the need to call `FS.mkdir()` for a subdirectory, and keeps the argument
 * list legible. Do NOT use OS path separators like "C:\\" — the VFS is
 * always POSIX-style regardless of the host platform.
 */
const VFS_INPUT_PATH = "input.pdf" as const;
const VFS_OUTPUT_PATH = "output.pdf" as const;

// ---------------------------------------------------------------------------
// Ghostscript argument builders
// ---------------------------------------------------------------------------

/**
 * Maps `config.monoStrategy` to the corresponding pair of Ghostscript
 * arguments that control bitonal (1-bit monochrome) image encoding.
 *
 * WHY A SEPARATE FUNCTION:
 * Monochrome encoding is the only tier property that expands to a
 * *variable number* of arguments (JBIG2 requires two flags; Flate requires
 * one). Isolating this mapping keeps `buildGhostscriptArgs` linear and easy
 * to audit.
 *
 * BACKGROUND ON EACH STRATEGY:
 *
 * - `jbig2_lossy`    → JBIG2 with lossy symbol dictionary. Identifies
 * repeating character shapes across all pages and stores each unique
 * shape only once. Highest compression ratio; imperceptibly lossy on
 * clean scans. Requires Ghostscript ≥ 9.54 with JBIG2 support compiled in.
 *
 * - `jbig2_lossless` → JBIG2 lossless mode. Same pattern-matching encoder
 * but the output is bit-for-bit identical to the input after decode.
 * Slightly larger than lossy but still far superior to Flate for text.
 *
 * - `flate`          → Standard zlib/Deflate. Broadest renderer
 * compatibility (every conforming PDF viewer supports it). Falls back to
 * this when the WASM binary was compiled without JBIG2 support.
 */
function buildMonoArgs(strategy: CompressTierConfig["monoStrategy"]): string[] {
  switch (strategy) {
    case "jbig2_lossy":
      return [
        "-dMonoImageFilter=/JBIG2Encode",
        "-dJBIG2LossyThreshold=0.85", // similarity threshold; 0.85 is the Ghostscript default
      ];

    case "jbig2_lossless":
      return [
        "-dMonoImageFilter=/JBIG2Encode",
        "-dJBIG2LossyThreshold=1.0", // 1.0 forces lossless mode
      ];

    case "flate":
      return [
        "-dMonoImageFilter=/FlateEncode",
      ];
  }
}

/**
 * Maps `config.stripMetadata` to the Ghostscript arguments that control
 * XMP packet and document info dictionary handling.
 *
 * - `full`    → Removes the XMP metadata stream entirely and blanks all
 * Info dict fields. Equivalent to scrubbing author, creator, subject,
 * keywords, and revision history. Use before public distribution.
 *
 * - `partial` → Suppresses the XMP packet (largest contributor) but
 * preserves basic Info dict fields (Title, Author). Balances size and
 * document identity.
 *
 * - `none`    → Passes all metadata through unchanged. Required for
 * print-safe workflows where embedded ICC profiles and XMP must survive.
 */
function buildMetadataArgs(level: CompressTierConfig["stripMetadata"]): string[] {
  switch (level) {
    case "full":
      return [
        "-dFastWebView=false",  // Disable linearisation hint tables (saves a few KB)
        "-dOmitInfoDate=true",  // Strip CreationDate / ModDate from Info dict
        "-dOmitXMP=true",       // Drop the entire XMP metadata stream
      ];

    case "partial":
      return [
        "-dOmitXMP=true",       // Drop XMP only; preserve Info dict
      ];

    case "none":
      return [];                 // No metadata arguments — pass everything through
  }
}

/**
 * Translates `config.garbageCollectionLevel` to the `-dGC` Ghostscript flag.
 *
 * Ghostscript's GC pass traverses the PDF object graph from the /Root
 * catalog and purges any object that cannot be reached (orphans left behind
 * by incremental saves). Higher levels are progressively more thorough:
 *
 * Level 1 → prune unreachable objects only
 * Level 2 → level 1 + compact and renumber object IDs
 * Level 3 → level 2 + deduplicate identical stream objects (most aggressive)
 *
 * Level 3 is the right default for extreme/recommended tiers; level 1 is
 * used for printSafe to avoid any risk of disturbing embedded ICC profiles
 * or shared resources that depend on specific object IDs.
 */
function buildGarbageCollectionArg(
  level: CompressTierConfig["garbageCollectionLevel"]
): string {
  return `-dGC=${level}`;
}

/**
 * Assembles the complete ordered Ghostscript argument array from a
 * `CompressTierConfig`. The order of arguments matters: device and
 * behavioural flags must precede the output file path, which must precede
 * the input filename.
 *
 * Ghostscript parses arguments left-to-right and some flags (particularly
 * `-dNOPAUSE` and `-dBATCH`) must appear before any filename argument or
 * they are silently ignored.
 */
function buildGhostscriptArgs(config: CompressTierConfig): string[] {
  return [
    // ── Output device ─────────────────────────────────────────────────────
    // `pdfwrite` is Ghostscript's PDF re-serialisation device. It re-parses
    // the input PDF object graph and writes a clean, optimised output stream.
    "-sDEVICE=pdfwrite",

    // ── PDF compatibility level ───────────────────────────────────────────
    // 1.4 (Acrobat 5+) is the widest-compatibility target that still supports
    // all compression features we use (JBIG2, JPEG2000, Flate). Outputting
    // as PDF 2.0 would require changing this to 2.0 and enabling newer filter
    // support in the WASM binary.
    "-dCompatibilityLevel=1.4",

    // ── Execution mode flags ──────────────────────────────────────────────
    // -dNOPAUSE: Do not pause between pages (required for batch/headless)
    // -dBATCH:   Exit after processing all input files (prevents blocking)
    // -dQUIET:   Suppress all stdout diagnostic output (critical in WASM;
    //            Ghostscript stdout is piped to the browser console by
    //            Emscripten and can generate thousands of noisy lines)
    "-dNOPAUSE",
    "-dBATCH",
    "-dQUIET",

    // ── Colour image downsampling ─────────────────────────────────────────
    // Enables bicubic downsampling for colour (RGB/CMYK) and greyscale raster
    // XObjects. Images already below the target DPI are left untouched.
    // `ColorImageResolution` and `GrayImageResolution` accept integer DPI.
    "-dSampleColorImages=true",
    "-dColorImageResolution=" + config.colorDpi,
    "-dDownsampleGrayImages=true",
    "-dGrayImageResolution=" + config.colorDpi,
    // Use bicubic (best quality) downsampling filter for both channels
    "-dColorImageDownsampleType=/Bicubic",
    "-dGrayImageDownsampleType=/Bicubic",

    // ── JPEG re-encoding quality ──────────────────────────────────────────
    // Controls the DCT (JPEG) quality used when Ghostscript re-encodes
    // photographic images. Range 0–100. This flag applies to BOTH colour and
    // greyscale channels; there is no separate GrayImageQuality equivalent in
    // the pdfwrite device.
    `-dJPEGQ=${config.jpegQuality}`,

    // ── Monochrome image encoding ─────────────────────────────────────────
    // Injected as 1 or 2 arguments depending on strategy (see buildMonoArgs).
    "-dDownsampleMonoImages=true",
    ...buildMonoArgs(config.monoStrategy),

    // ── Font subsetting ───────────────────────────────────────────────────
    // When true, Ghostscript reconstructs embedded font binaries containing
    // only the glyph IDs actually referenced in the page content streams.
    // Full TrueType/OpenType fonts can be several MB; subsetting cuts this
    // by up to 90% for typical prose documents.
    //
    // We always set this explicitly (even when config.subsetFonts is false)
    // to ensure the Ghostscript default is never silently in effect.
    `-dSubsetFonts=${config.subsetFonts}`,

    // ── Garbage collection ────────────────────────────────────────────────
    // Purges orphaned objects from incremental-save history. See
    // buildGarbageCollectionArg for level semantics.
    buildGarbageCollectionArg(config.garbageCollectionLevel),

    // ── Metadata stripping ────────────────────────────────────────────────
    // 0 to 3 arguments depending on strip level (see buildMetadataArgs).
    ...buildMetadataArgs(config.stripMetadata),

    // ── Output path ───────────────────────────────────────────────────────
    // Must be a VFS path. Ghostscript writes incrementally to this path as
    // it processes each page, so the file will exist (possibly incomplete)
    // even if callMain() throws — the finally block handles this safely.
    `-sOutputFile=${VFS_OUTPUT_PATH}`,

    // ── Input path ────────────────────────────────────────────────────────
    // MUST be the last argument. Ghostscript treats the first non-flag
    // positional argument as the input file. Placing it earlier can cause
    // subsequent flags to be silently ignored.
    VFS_INPUT_PATH,
  ];
}

// ---------------------------------------------------------------------------
// VFS cleanup helper
// ---------------------------------------------------------------------------

/**
 * Attempts to unlink a single file from the Emscripten VFS.
 *
 * Wrapped in a try/catch because `FS.unlink()` throws if the file does not
 * exist (e.g. `output.pdf` was never written because `callMain` failed before
 * the output stage). We never want a missing output file to shadow the
 * original pipeline error thrown in the `try` block.
 *
 * This function is intentionally synchronous — `FS.unlink()` is a synchronous
 * VFS operation and there is no async variant in the Emscripten FS API.
 */
function safeUnlink(wasmModule: GhostscriptWasmModule, path: string): void {
  try {
    wasmModule.FS.unlink(path);
  } catch {
    // File did not exist or was already removed. Safe to ignore.
    // Do NOT rethrow — we are inside a `finally` block and rethrowing here
    // would suppress the original pipeline error from the `try` block.
  }
}

// ---------------------------------------------------------------------------
// Emscripten module shape
// ---------------------------------------------------------------------------

/**
 * Minimal structural typing for the Ghostscript Emscripten module instance.
 *
 * The full Emscripten Module interface is enormous; we declare only the
 * surface we actually call. `wasmModule: any` is acceptable at the call site
 * (the worker receives it as `any` from the dynamic import), but internally
 * we use this interface to get editor completions and catch typos at compile
 * time.
 */
interface GhostscriptWasmModule {
  FS: {
    writeFile(path: string, data: Uint8Array): void;
    readFile(path: string): Uint8Array;
    unlink(path: string): void;
  };
  callMain(args: string[]): number;
}

// ---------------------------------------------------------------------------
// Public executor
// ---------------------------------------------------------------------------

export async function executeWasmCompression(
  wasmModule: any,
  fileBytes: ArrayBuffer,
  config: CompressTierConfig,
  onProgress: (message: string, percent?: number) => void,
): Promise<Uint8Array> {

  const gs = wasmModule as GhostscriptWasmModule;

  try {
    onProgress("Mounting input to virtual filesystem…", 5);

    gs.FS.writeFile(
      VFS_INPUT_PATH,
      new Uint8Array(fileBytes),
    );

    onProgress("Building compression arguments…", 10);

    const args = buildGhostscriptArgs(config);

    onProgress("Running Ghostscript compression engine…", 20);

    const exitCode = gs.callMain(args);

    if (exitCode >= 2) {
      throw new Error(
        `Ghostscript exited with fatal code ${exitCode}. ` +
        `Check that input.pdf is a valid, non-encrypted PDF document.`,
      );
    }

    onProgress("Extracting compressed output…", 90);

    const compressedBytes = gs.FS.readFile(VFS_OUTPUT_PATH);

    onProgress("Compression complete.", 100);

    return compressedBytes;

  } finally {
    // safeUnlink swallows ENOENT — safe to call unconditionally.
    // This also covers the window where callMain writes partial output
    // then throws before the old `outputWritten` flag was set.
    safeUnlink(gs, VFS_INPUT_PATH);
    safeUnlink(gs, VFS_OUTPUT_PATH);
  }
}
