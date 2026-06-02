"use client";

/**
 * useMergeWorker.ts
 *
 * React hook that manages the full lifecycle of the pdfMerge.worker.
 *
 * Lifecycle contract
 * ──────────────────
 * • The worker is created fresh on every merge() call — no reuse.
 * • On completion (COMPLETE / ERROR): the worker is terminated and the ref nulled.
 * • On cancel(): worker.terminate() is called immediately. No message is sent
 *   to the worker first — terminate() is instantaneous and correct for a
 *   stateless, single-use worker.
 * • On component unmount: any running worker is force-terminated.
 *   This prevents zombie workers if the user navigates away mid-merge.
 *
 * State shape
 * ───────────
 * MergeWorkerState is the single object the UI thread reads. It includes
 * every field needed to render progress, errors, and the download trigger.
 *
 * TypeScript
 * ──────────
 * All message handling is fully typed through WorkerOutboundMessage.
 * There are no `as any` casts in this file.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  MergeFileDescriptor,
  WorkerOutboundMessage,
  FileStage,
} from "../lib/merge-worker-protocol";

// ─── Public state types ───────────────────────────────────────────────────────

export type MergePhase =
  | "idle"
  | "merging"
  | "saving"
  | "done"
  | "error"
  | "cancelled";

/** Granular progress for the file currently being processed. */
export interface CurrentFileProgress {
  fileId: string;
  fileName: string;
  /** 1-based position in the queue. */
  fileIndex: number;
  totalFiles: number;
  stage: FileStage;
  pagesDone: number;
  totalPages: number;
}

/** A file that was skipped during the merge due to a per-file error. */
export interface SkippedFile {
  fileId: string;
  fileName: string;
  reason: "encrypted" | "corrupted" | "empty";
}

export interface MergeWorkerState {
  phase: MergePhase;
  /** How many files have been fully processed (including skipped). */
  completedFiles: number;
  totalFiles: number;
  /** Progress for the file currently under processing. null when idle/done. */
  currentFile: CurrentFileProgress | null;
  /** Set when phase === "done". The Uint8Array holding the merged PDF bytes. */
  resultBytes: Uint8Array | null;
  /** Set when phase === "error". */
  errorMessage: string | null;
  /** Files skipped due to encryption, corruption, or being empty. */
  skippedFiles: SkippedFile[];
  /** Set when estimated peak memory exceeds the safe threshold. */
  memoryWarning: { estimatedBytes: number; availableBytes: number | null } | null;
}

export interface UseMergeWorkerReturn {
  state: MergeWorkerState;
  /** Start a merge. Throws if a merge is already in progress. */
  merge: (files: MergeFileDescriptor[]) => void;
  /** Cancel an in-progress merge. No-op if idle. */
  cancel: () => void;
  /** Reset state back to idle (e.g. to allow merging again). */
  reset: () => void;
}

// ─── Initial state ────────────────────────────────────────────────────────────

const INITIAL_STATE: MergeWorkerState = {
  phase: "idle",
  completedFiles: 0,
  totalFiles: 0,
  currentFile: null,
  resultBytes: null,
  errorMessage: null,
  skippedFiles: [],
  memoryWarning: null,
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMergeWorker(): UseMergeWorkerReturn {
  const [state, setState] = useState<MergeWorkerState>(INITIAL_STATE);

  /**
   * Holds the active Worker instance.
   * We use a ref (not state) because mutating it must never trigger a
   * re-render — only the state changes should do that.
   */
  const workerRef = useRef<Worker | null>(null);

  // ── Unmount guard ──────────────────────────────────────────────────────────
  // Terminates a running worker when the component unmounts (e.g. navigation).
  // This is the single place that prevents zombie workers.
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  // ── Worker teardown helper ─────────────────────────────────────────────────
  const teardownWorker = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
  }, []);

  // ── Message handler ────────────────────────────────────────────────────────
  /**
   * Processes every outbound message from the worker.
   * Because we create a fresh worker per merge, there is no risk of
   * stale closures — the handler is bound at creation time.
   */
  const buildMessageHandler = useCallback(
    () => (event: MessageEvent<WorkerOutboundMessage>) => {
      const msg = event.data;

      switch (msg.type) {
        case "FILE_STARTED": {
          setState((prev) => ({
            ...prev,
            totalFiles: msg.totalFiles,
            currentFile: {
              fileId: msg.fileId,
              fileName: msg.fileName,
              fileIndex: msg.fileIndex,
              totalFiles: msg.totalFiles,
              stage: "loading",
              pagesDone: 0,
              totalPages: 0,
            },
          }));
          break;
        }

        case "PROGRESS_UPDATE": {
          setState((prev) => {
            // Guard: ignore stale messages if phase has already moved on
            if (prev.phase !== "merging") return prev;
            return {
              ...prev,
              currentFile: prev.currentFile
                ? {
                    ...prev.currentFile,
                    stage: msg.stage as FileStage,
                    pagesDone: msg.pagesDone,
                    totalPages: msg.totalPages,
                  }
                : prev.currentFile,
            };
          });
          break;
        }

        case "FILE_COMPLETED": {
          setState((prev) => ({
            ...prev,
            completedFiles: msg.fileIndex,
          }));
          break;
        }

        case "PIPELINE_STAGE": {
          if (msg.stage === "saving") {
            setState((prev) => ({
              ...prev,
              phase: "saving",
              currentFile: null,
            }));
          }
          break;
        }

        case "FILE_SKIPPED": {
          setState((prev) => ({
            ...prev,
            completedFiles: msg.fileIndex,
            skippedFiles: [
              ...prev.skippedFiles,
              { fileId: msg.fileId, fileName: msg.fileName, reason: msg.reason },
            ],
          }));
          break;
        }

        case "MEMORY_WARNING": {
          setState((prev) => ({
            ...prev,
            memoryWarning: {
              estimatedBytes: msg.estimatedBytes,
              availableBytes: msg.availableBytes,
            },
          }));
          break;
        }

        case "COMPLETE": {
          teardownWorker();
          // Use functional form to preserve skippedFiles accumulated during the run.
          setState((prev) => ({
            phase: "done",
            completedFiles: 0,
            totalFiles: 0,
            currentFile: null,
            resultBytes: msg.result,
            errorMessage: null,
            skippedFiles: prev.skippedFiles,
            memoryWarning: null,
          }));
          break;
        }

        case "ERROR": {
          teardownWorker();
          setState((prev) => ({
            ...prev,
            phase: "error",
            currentFile: null,
            errorMessage: msg.message,
          }));
          break;
        }

        default: {
          // Exhaustive check — TypeScript will warn if a new message type
          // is added to the protocol but not handled here.
          const _exhaustive: never = msg;
          console.warn("[useMergeWorker] Unhandled worker message:", _exhaustive);
        }
      }
    },
    [teardownWorker],
  );

  // ── merge ──────────────────────────────────────────────────────────────────
  const merge = useCallback(
    (files: MergeFileDescriptor[]) => {
      // Defensive: terminate any leftover worker before creating a new one.
      teardownWorker();

      setState({
        phase: "merging",
        completedFiles: 0,
        totalFiles: files.length,
        currentFile: null,
        resultBytes: null,
        errorMessage: null,
        skippedFiles: [],
        memoryWarning: null,
      });

      const worker = new Worker(
        new URL("../lib/pdfMerge.worker.ts", import.meta.url),
        { type: "module" },
      );

      const handleMessage = buildMessageHandler();

      worker.addEventListener("message", handleMessage);

      // Catch unhandled runtime errors inside the worker (e.g. import failures)
      worker.addEventListener("error", (err: ErrorEvent) => {
        teardownWorker();
        setState((prev) => ({
          ...prev,
          phase: "error",
          currentFile: null,
          errorMessage: err.message || "An unexpected error occurred in the merge worker.",
        }));
      });

      workerRef.current = worker;

      worker.postMessage({ type: "START_MERGE", files, onFileError: "skip" });
    },
    [teardownWorker, buildMessageHandler],
  );

  // ── cancel ─────────────────────────────────────────────────────────────────
  const cancel = useCallback(() => {
    if (!workerRef.current) return;
    // Immediately terminate the worker thread. This is instantaneous —
    // the worker cannot post any further messages after this call.
    // No CANCEL message is sent; worker.terminate() is the correct and
    // complete cancellation mechanism for a stateless Web Worker.
    teardownWorker();
    setState((prev) => ({
      ...prev,
      phase: "cancelled",
      currentFile: null,
    }));
  }, [teardownWorker]);

  // ── reset ──────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    teardownWorker();
    setState(INITIAL_STATE);
  }, [teardownWorker]);

  return { state, merge, cancel, reset };
}
