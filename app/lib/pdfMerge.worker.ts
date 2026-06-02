/**
 * pdfMerge.worker.ts
 *
 * Dedicated Web Worker for the PDF merge pipeline.
 * Runs in a completely separate thread — the main UI thread is never blocked.
 *
 * Responsibilities
 * ────────────────
 * 1. Receive a START_MERGE message containing an ordered list of File objects.
 * 2. For each file:
 *    a. Read its ArrayBuffer  (File → ArrayBuffer, happens inside worker)
 *    b. Load via PDFDocument.load()  (pdf-lib)
 *    c. Bulk-copy all pages into the accumulator with a single copyPages() call.
 * 3. Serialise the accumulator with PDFDocument.save().
 * 4. Transfer the resulting Uint8Array back to the main thread (zero-copy).
 *
 * Cancellation
 * ────────────
 * Handled exclusively by worker.terminate() from the hook (useMergeWorker).
 * The worker itself has no cancel logic — a terminated worker simply stops.
 * This is the correct model for a stateless, single-use worker.
 *
 * Error handling
 * ──────────────
 * Any thrown error (including encryption, corruption) is caught at the top
 * level and posted as an ERROR message. The hook then terminates the worker.
 *
 * What is NOT done here (future phases)
 * ──────────────────────────────────────
 * • Memory batching for >N files
 * • Corrupted-PDF recovery / partial page rescue
 */

import { PDFDocument } from "pdf-lib";
import type {
  WorkerInboundMessage,
  WorkerOutboundMessage,
  MergeFileDescriptor,
  FileErrorStrategy,
} from "./merge-worker-protocol";

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Estimated peak heap budget. When the pre-flight estimate exceeds this,
 * a MEMORY_WARNING is posted. Processing continues regardless.
 * 512 MB is conservative for modern desktop browsers; mobile may be lower.
 */
const MEMORY_LIMIT_BYTES = 512 * 1024 * 1024;

/**
 * Multiplier applied to the sum of raw file sizes to estimate peak heap.
 * Accounts for: raw ArrayBuffer (1×) + pdf-lib parsed object graph (~1.5×)
 * + accumulator page copies (~1×) = 3.5× total.
 */
const MEMORY_MULTIPLIER = 3.5;

// ─── Typed postMessage helper ─────────────────────────────────────────────────

function post(msg: WorkerOutboundMessage, transfer: Transferable[] = []): void {
  if (transfer.length > 0) {
    (self as unknown as Worker).postMessage(msg, transfer);
  } else {
    self.postMessage(msg);
  }
}

// ─── Memory estimation ────────────────────────────────────────────────────────

function estimateMemoryRequirement(files: MergeFileDescriptor[]): number {
  const totalRaw = files.reduce((sum, d) => sum + d.file.size, 0);
  return Math.round(totalRaw * MEMORY_MULTIPLIER);
}

function getAvailableHeap(): number | null {
  // performance.memory is a non-standard Chrome extension; may be undefined.
  const mem = (performance as unknown as Record<string, unknown>).memory as
    | { jsHeapSizeLimit: number; usedJSHeapSize: number }
    | undefined;
  if (!mem) return null;
  return mem.jsHeapSizeLimit - mem.usedJSHeapSize;
}

// ─── Core pipeline ────────────────────────────────────────────────────────────

async function readFileBytes(file: File): Promise<ArrayBuffer> {
  return file.arrayBuffer();
}

/**
 * Process every file sequentially, releasing references after each one.
 *
 * Memory strategy:
 * - rawBytes is nulled immediately after PDFDocument.load() succeeds.
 * - sourceDoc is nulled immediately after copyPages() completes.
 * - Both are released in a finally block so GC can reclaim even on error.
 *
 * @param files Ordered list of files to merge.
 * @param mergedDoc The accumulator PDFDocument (created once, reused across files).
 * @param strategy What to do when a file fails: skip it or abort the batch.
 * @returns Number of pages successfully copied across all files.
 */
async function processMergeQueue(
  files: MergeFileDescriptor[],
  mergedDoc: PDFDocument,
  strategy: FileErrorStrategy,
): Promise<number> {
  const totalFiles = files.length;
  let totalPagesCopied = 0;

  for (let fileIndex = 0; fileIndex < totalFiles; fileIndex++) {
    const descriptor = files[fileIndex];
    const oneBasedIndex = fileIndex + 1;

    // ── Empty-file guard ──────────────────────────────────────────────────────
    if (descriptor.file.size === 0) {
      post({
        type: "FILE_SKIPPED",
        fileId: descriptor.id,
        fileName: descriptor.file.name,
        fileIndex: oneBasedIndex,
        totalFiles,
        reason: "empty",
      });
      continue;
    }

    // ── FILE_STARTED ──────────────────────────────────────────────────────────
    post({
      type: "FILE_STARTED",
      fileId: descriptor.id,
      fileName: descriptor.file.name,
      fileIndex: oneBasedIndex,
      totalFiles,
    });

    // ── LOADING stage ─────────────────────────────────────────────────────────
    post({
      type: "PROGRESS_UPDATE",
      fileId: descriptor.id,
      stage: "loading",
      pagesDone: 0,
      totalPages: 0,
    });

    // Nullable refs — both released in finally to guarantee GC opportunity.
    let rawBytes: ArrayBuffer | null = null;
    let sourceDoc: PDFDocument | null = null;

    try {
      rawBytes = await readFileBytes(descriptor.file);

      try {
        sourceDoc = await PDFDocument.load(rawBytes, { ignoreEncryption: false });

        // ── COPYING_PAGES stage ─────────────────────────────────────────────────
        const pageIndices = sourceDoc.getPageIndices();
        const totalPages = pageIndices.length;

        post({
          type: "PROGRESS_UPDATE",
          fileId: descriptor.id,
          stage: "copying_pages",
          pagesDone: 0,
          totalPages,
        });

        // Single bulk call — pdf-lib resolves shared object references across
        // all pages together. Calling it N times for N pages is O(N²).
        const copiedPages = await mergedDoc.copyPages(sourceDoc, pageIndices);
        for (const page of copiedPages) {
          mergedDoc.addPage(page);
        }
        totalPagesCopied += copiedPages.length;

      } catch (loadErr) {
        const msg = loadErr instanceof Error ? loadErr.message : "";
        const isEncrypted =
          msg.toLowerCase().includes("encrypt") ||
          msg.toLowerCase().includes("password");
        const reason: "encrypted" | "corrupted" = isEncrypted ? "encrypted" : "corrupted";

        if (strategy === "skip") {
          post({
            type: "FILE_SKIPPED",
            fileId: descriptor.id,
            fileName: descriptor.file.name,
            fileIndex: oneBasedIndex,
            totalFiles,
            reason,
          });
          continue;
        }

        // strategy === "abort"
        throw new Error(
          isEncrypted
            ? `"${descriptor.file.name}" is password-protected and cannot be merged.`
            : `"${descriptor.file.name}" could not be parsed or processed. The file may be corrupted.`,
        );
      } finally {
        // Release the raw bytes immediately — sourceDoc holds everything it
        // needs; keeping rawBytes alive doubles peak memory for no benefit.
        rawBytes = null;
      }

    } finally {
      // Always release sourceDoc after copyPages, even if copyPages threw.
      sourceDoc = null;
      rawBytes = null; // defensive: cover early-exit paths
    }

    // ── FILE_COMPLETED ────────────────────────────────────────────────────────
    post({
      type: "FILE_COMPLETED",
      fileId: descriptor.id,
      fileIndex: oneBasedIndex,
      totalFiles,
    });
  }

  return totalPagesCopied;
}

// ─── Entry point ──────────────────────────────────────────────────────────────
// This worker is single-use. The hook (useMergeWorker) creates a fresh
// instance for every merge and terminates it immediately on completion,
// error, or cancellation. No CANCEL message is ever sent to this worker;
// the hook calls worker.terminate() directly, which is the correct and
// instantaneous cancellation mechanism for a stateless worker.

self.addEventListener("message", (event: MessageEvent<WorkerInboundMessage>) => {
  const msg = event.data;

  if (msg.type !== "START_MERGE") {
    return;
  }

  const strategy: FileErrorStrategy = msg.onFileError ?? "skip";

  void (async () => {
    try {
      // ── Pre-flight memory estimation ────────────────────────────────────────
      const estimatedBytes = estimateMemoryRequirement(msg.files);
      if (estimatedBytes > MEMORY_LIMIT_BYTES) {
        throw new Error(
          `Merge request exceeds the safe memory limit (~${Math.round(
            estimatedBytes / 1024 / 1024
          )} MB estimated, limit is ${Math.round(
            MEMORY_LIMIT_BYTES / 1024 / 1024
          )} MB). Please merge fewer or smaller PDF files.`
        );
      }

      const mergedDoc = await PDFDocument.create();

      const totalPagesCopied = await processMergeQueue(msg.files, mergedDoc, strategy);

      // ── Zero-pages guard ─────────────────────────────────────────────────────
      if (totalPagesCopied === 0) {
        post({ type: "ERROR", message: "No valid PDFs could be merged. All files were skipped or empty." });
        return;
      }

      // ── PIPELINE_STAGE: saving ───────────────────────────────────────────────
      post({ type: "PIPELINE_STAGE", stage: "saving" });

      const resultBytes = await mergedDoc.save({ useObjectStreams: true });

      post(
        {
          type: "COMPLETE",
          result: resultBytes,
          totalBytes: resultBytes.byteLength,
        },
        [resultBytes.buffer],
      );
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "An unexpected error occurred during merge.";
      post({ type: "ERROR", message });
    }
  })();
});
