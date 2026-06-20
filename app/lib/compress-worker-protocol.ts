/**
 * compress-worker-protocol.ts
 *
 * Defines the full message-passing contract between the main thread and the
 * PDF Compression Web Worker. All types are discriminated unions or strict
 * interfaces — zero runtime dependencies.
 */

// ---------------------------------------------------------------------------
// Compression Tier
// ---------------------------------------------------------------------------

/** The three named quality / size trade-off presets exposed to the UI. */
export type CompressionTier = "extreme" | "recommended" | "printSafe";

// ---------------------------------------------------------------------------
// Monochrome Strategy
// ---------------------------------------------------------------------------

/**
 * Encoding strategy applied to detected bitonal (1-bit) image streams.
 *
 * - `"jbig2_lossy"`    — maximum compression via lossy JBIG2 pattern matching
 * - `"jbig2_lossless"` — lossless JBIG2; slightly larger but byte-perfect
 * - `"flate"`          — zlib/deflate; widest renderer compatibility, largest output
 */
export type MonoStrategy = "jbig2_lossy" | "jbig2_lossless" | "flate";

// ---------------------------------------------------------------------------
// Metadata Strip Level
// ---------------------------------------------------------------------------

/**
 * Controls how aggressively document metadata is scrubbed from the output.
 *
 * - `"full"`    — strip all XMP, Info dict, thumbnails, and revision history
 * - `"partial"` — strip XMP and thumbnails; preserve basic Info dict entries
 * - `"none"`    — leave all metadata untouched
 */
export type MetadataStripLevel = "full" | "partial" | "none";

// ---------------------------------------------------------------------------
// Tier Configuration
// ---------------------------------------------------------------------------

/**
 * Strongly-typed mirror of the `tierConfig` JSON schema.
 * Each field maps 1-to-1 with a concrete WASM engine parameter.
 */
export interface CompressTierConfig {
  /** Target colour-image resolution in dots-per-inch after downsampling. */
  readonly colorDpi: number;

  /** Encoding strategy for detected bitonal (monochrome) image streams. */
  readonly monoStrategy: MonoStrategy;

  /**
   * JPEG quality factor applied during DCT re-encoding of photographic
   * content. Range: 0–100 (lower ⟹ smaller file, more artefacts).
   */
  readonly jpegQuality: number;

  /** When `true`, unreferenced glyphs are stripped from embedded font binaries. */
  readonly subsetFonts: boolean;

  /** Scope of metadata removal applied to the output document. */
  readonly stripMetadata: MetadataStripLevel;

  /**
   * Garbage-collection level passed to the WASM engine.
   *
   * - `1` — remove unreachable objects only
   * - `2` — level 1 + renumber objects
   * - `3` — level 2 + merge duplicate streams (most thorough)
   */
  readonly garbageCollectionLevel: 1 | 2 | 3;
}

// ---------------------------------------------------------------------------
// Canonical Tier Config Map
// ---------------------------------------------------------------------------

/**
 * Read-only record that maps each `CompressionTier` to its default
 * `CompressTierConfig`. This is the single source of truth consumed by the
 * worker; the UI must not reconstruct these values independently.
 */
export const TIER_CONFIG_MAP: Readonly<Record<CompressionTier, CompressTierConfig>> = {
  extreme: {
    colorDpi: 72,
    monoStrategy: "jbig2_lossy",
    jpegQuality: 40,
    subsetFonts: true,
    stripMetadata: "full",
    garbageCollectionLevel: 3,
  },
  recommended: {
    colorDpi: 150,
    monoStrategy: "jbig2_lossless",
    jpegQuality: 65,
    subsetFonts: true,
    stripMetadata: "partial",
    garbageCollectionLevel: 3,
  },
  printSafe: {
    colorDpi: 300,
    monoStrategy: "flate",
    jpegQuality: 90,
    subsetFonts: true,
    stripMetadata: "none",
    garbageCollectionLevel: 1,
  },
} as const;

// ---------------------------------------------------------------------------
// Compression Options
// ---------------------------------------------------------------------------

/**
 * Options supplied by the caller when starting a compression job.
 *
 * The worker resolves `tier` → `TIER_CONFIG_MAP[tier]` internally, so the
 * caller never needs to construct a `CompressTierConfig` manually.
 */
export interface CompressOptions {
  /** Named compression preset to apply. */
  readonly tier: CompressionTier;

  /**
   * When `true`, the image-downsampling pass is skipped for vector-heavy
   * documents where raster recompression would yield negligible savings.
   * Useful for CAD exports or charts containing no embedded raster images.
   * Defaults to `false` when omitted.
   */
  readonly forceBypassVector?: boolean;
}

// ---------------------------------------------------------------------------
// Worker → Main Thread Messages
// ---------------------------------------------------------------------------

/**
 * Sent by the main thread to start a new compression job.
 * `fileBytes` is transferred (not copied) via the Transferable mechanism —
 * the caller must include it in the `transfer` array of `postMessage`.
 */
export interface StartCompressMessage {
  readonly type: "START_COMPRESS";
  /** Caller-generated identifier; echoed in all subsequent messages. */
  readonly jobId: number;
  /** Raw bytes of the source PDF — must be transferred, not copied. */
  readonly fileBytes: ArrayBuffer;
  /** Compression configuration for this job. */
  readonly options: CompressOptions;
}

/**
 * Emitted at regular intervals by the worker to report pipeline progress.
 * The main thread should use this to drive a progress bar or status label.
 */
export interface CompressProgressMessage {
  readonly type: "COMPRESS_PROGRESS";
  readonly jobId: number;
  /** Integer 0–100 representing overall pipeline completion percentage. */
  readonly percent: number;
  /** Human-readable stage description (e.g. "Downsampling images…"). */
  readonly message: string;
}

/**
 * Emitted when the compression pipeline encounters a fatal error.
 * The worker will not send a `COMPRESS_COMPLETE` after this message.
 */
export interface CompressErrorMessage {
  readonly type: "COMPRESS_ERROR";
  readonly jobId: number;
  /** Machine-readable error code for structured handling by the main thread. */
  readonly code: CompressErrorCode;
  /** Developer-facing description; do not display raw to end users. */
  readonly detail: string;
}

/**
 * Emitted by the worker when the compression pipeline finishes successfully.
 * `result` is transferred back to the main thread to avoid a memory copy.
 */
export interface CompressCompleteMessage {
  readonly type: "COMPRESS_COMPLETE";
  readonly jobId: number;
  /** Compressed PDF bytes — transferred (not copied) to the main thread. */
  readonly result: Uint8Array;
  /** Size of the source file in bytes; used to compute the savings ratio. */
  readonly originalBytes: number;
  /** Size of the compressed output in bytes. */
  readonly compressedBytes: number;
}

// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------

/**
 * Enumerated error codes for `CompressErrorMessage.code`.
 * Extend this union as new failure modes are identified.
 */
export type CompressErrorCode =
  | "ERR_INVALID_PDF"        // Input bytes do not parse as a valid PDF
  | "ERR_ENCRYPTED_PDF"      // Password-protected PDF; decryption not supported
  | "ERR_WASM_INIT_FAILED"   // WASM module failed to compile or instantiate
  | "ERR_OUT_OF_MEMORY"      // Browser heap exhausted during processing
  | "ERR_PIPELINE_TIMEOUT"   // Processing exceeded the maximum allowed duration
  | "ERR_UNKNOWN";           // Catch-all for unexpected exceptions

// ---------------------------------------------------------------------------
// Discriminated Union Aliases
// ---------------------------------------------------------------------------

/**
 * Union of all messages the **main thread** may post to the compress worker.
 */
export type MainToCompressWorkerMessage = StartCompressMessage;

/**
 * Union of all messages the **compress worker** may post back to the main thread.
 */
export type CompressWorkerToMainMessage =
  | CompressProgressMessage
  | CompressErrorMessage
  | CompressCompleteMessage;
