/**
 * merge-worker-protocol.ts
 *
 * Single source of truth for all messages exchanged between the merge Web Worker
 * and the React UI thread.  Both sides import from this file so the contract
 * can never silently drift.
 *
 * Rule: NOTHING in this file may be changed without updating both sides.
 */

// ─── Inbound (UI → Worker) ───────────────────────────────────────────────────

/**
 * Serialisable description of one file to merge.
 * We send the File object directly; it is transferred by reference inside a
 * Worker postMessage, so there is zero copy overhead.
 */
export interface MergeFileDescriptor {
  /** Stable UI identifier (crypto.randomUUID from the React state). */
  id: string;
  /**
   * The original File object. Sent via Structured Clone (not transferred).
   * This is lightweight — the browser clones the File metadata reference,
   * not the underlying bytes. The actual bytes are read inside the worker
   * via file.arrayBuffer().
   */
  file: File;
}

/**
 * What to do when a single file fails to load.
 * "skip"  – post FILE_SKIPPED and continue with remaining files (default).
 * "abort" – post ERROR and halt immediately.
 */
export type FileErrorStrategy = "skip" | "abort";

export interface StartMergeMessage {
  type: "START_MERGE";
  files: MergeFileDescriptor[];
  /** Defaults to "skip" inside the worker when not provided. */
  onFileError?: FileErrorStrategy;
}

/** Union of every message the UI thread can send to the worker. */
export type WorkerInboundMessage = StartMergeMessage;

// ─── Outbound (Worker → UI) ──────────────────────────────────────────────────

/**
 * Processing stages reported for a single file.
 * "loading"       – reading the File's ArrayBuffer + PDFDocument.load()
 * "copying_pages" – iterating copyPages() for each page in the document
 * "done"          – all pages from this file have been copied
 */
export type FileStage = "loading" | "copying_pages" | "done";

/**
 * Global pipeline stages reported across the whole merge operation.
 * "saving"   – the final PDFDocument.save() serialisation
 */
export type PipelineStage = "saving";

// ─── Individual message shapes ───────────────────────────────────────────────

/** A file has started being processed. */
export interface FileStartedMessage {
  type: "FILE_STARTED";
  fileId: string;
  fileName: string;
  /** 1-based position in the queue (e.g. "Processing 2 of 5"). */
  fileIndex: number;
  totalFiles: number;
}

/** Granular progress within a single file. */
export interface ProgressUpdateMessage {
  type: "PROGRESS_UPDATE";
  fileId: string;
  stage: FileStage;
  /**
   * For "copying_pages": pages copied so far.
   * For "loading" / "done": always 0.
   */
  pagesDone: number;
  totalPages: number;
}

/** A file has been fully processed and its pages appended. */
export interface FileCompletedMessage {
  type: "FILE_COMPLETED";
  fileId: string;
  fileIndex: number;
  totalFiles: number;
}

/** The worker encountered a fatal error and has stopped. */
export interface ErrorMessage {
  type: "ERROR";
  message: string;
  /** Which file caused the error, if known. */
  fileId?: string;
}

/** A single file was skipped due to an unrecoverable per-file error. */
export interface FileSkippedMessage {
  type: "FILE_SKIPPED";
  fileId: string;
  fileName: string;
  /** 1-based position in the queue. */
  fileIndex: number;
  totalFiles: number;
  reason: "encrypted" | "corrupted" | "empty";
}

/**
 * Posted once before processing begins when the estimated memory
 * requirement is high. Does not abort the merge — informs the UI only.
 */
export interface MemoryWarningMessage {
  type: "MEMORY_WARNING";
  /** Estimated peak bytes this merge will consume. */
  estimatedBytes: number;
  /** Approximate JS heap available (from performance.memory), or null if unavailable. */
  availableBytes: number | null;
}

/** The merge is complete; the result bytes are transferred back. */
export interface CompleteMessage {
  type: "COMPLETE";
  /**
   * The merged PDF as a Uint8Array.
   * Transferred (zero-copy) via the Transferable mechanism.
   */
  result: Uint8Array;
  totalBytes: number;
}

/** Pipeline-level stage update (e.g. final save). */
export interface PipelineStageMessage {
  type: "PIPELINE_STAGE";
  stage: PipelineStage;
}

/** Union of every message the worker can send to the UI thread. */
export type WorkerOutboundMessage =
  | FileStartedMessage
  | ProgressUpdateMessage
  | FileCompletedMessage
  | ErrorMessage
  | FileSkippedMessage
  | MemoryWarningMessage
  | CompleteMessage
  | PipelineStageMessage;
