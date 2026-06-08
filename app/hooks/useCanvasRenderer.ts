// ---------------------------------------------------------------------------
// useCanvasRenderer
// Shared hook for all canvas-producing worker paths.
//
// Design:
// - Lazy worker init: worker is created on first request(), not on mount.
// - fileBytes are sliced inside the hook — caller's ArrayBuffer is never detached.
// - ImageBitmaps are closed immediately after blob conversion or direct draw.
// - Object URLs are tracked in a Set; revoked explicitly via revokeUrl() or
//   swept on unmount. Both paths are guarded.
// - Stale-result protection: requestIds not in pendingRequests are discarded.
// - Cancelled results ("cancelled" message) are silently ignored; onError is
//   only called for real failures.
// - Worker is terminated and all tracked URLs revoked on unmount, in that order.
// - React StrictMode safe: lazy init prevents double-worker on double-mount.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef } from "react";
import type { ThumbnailOutboundMessage } from "../lib/thumbnail-worker-protocol";

export type RenderParams = {
  /** Caller-owned job identifier. Used for bulk cancel. */
  jobId: number;
  /** Unique per-request identifier. Use crypto.randomUUID(). */
  requestId: string;
  /** PDF bytes. Hook slices internally — caller's buffer is never detached. */
  fileBytes: ArrayBuffer;
  /** 0-based page index. */
  pageIndex: number;
  /** Target render width in px. */
  targetWidth: number;
  /** Degrees added on top of the page's own rotation. */
  extraRotation?: number;
};

export type RenderResult = {
  requestId: string;
  pageIndex: number;
  /**
   * Object URL ready for <img src>.
   * null when OffscreenCanvas is unavailable — caller must render on main thread.
   */
  url: string | null;
  width: number;
  height: number;
};

export type UseCanvasRendererOptions = {
  onResult: (result: RenderResult) => void;
  onError?: (requestId: string, pageIndex: number, reason: string) => void;
};

export function useCanvasRenderer(options: UseCanvasRendererOptions): {
  request: (params: RenderParams) => void;
  cancel: (jobId: number) => void;
  cancelAll: () => void;
  revokeUrl: (url: string) => void;
} {
  const { onResult, onError } = options;

  // Stable refs so callbacks capture the latest version without being
  // re-registered as effect deps.
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const workerRef = useRef<Worker | null>(null);
  /** requestIds that are still pending a result. */
  const pendingRequestsRef = useRef<Set<string>>(new Set());
  /** All live object URLs created by this hook instance. */
  const trackedUrlsRef = useRef<Set<string>>(new Set());

  // ---------------------------------------------------------------------------
  // Worker factory — lazy, called only on first request()
  // ---------------------------------------------------------------------------
  const ensureWorker = useCallback((): Worker => {
    if (workerRef.current) return workerRef.current;

    const w = new Worker(
      new URL("../lib/thumbnailRenderer.worker.ts", import.meta.url),
      { type: "module" },
    );

    w.onmessage = (event: MessageEvent<ThumbnailOutboundMessage>) => {
      const msg = event.data;

      if (msg.type === "THUMBNAIL_RESULT") {
        const { requestId, pageIndex, bitmap, width, height } = msg;

        // Stale-result guard: discard if this requestId is no longer wanted.
        if (!pendingRequestsRef.current.has(requestId)) {
          bitmap?.close();
          return;
        }
        pendingRequestsRef.current.delete(requestId);

        if (!bitmap) {
          // OffscreenCanvas unavailable — signal caller to fall back.
          onResultRef.current({ requestId, pageIndex, url: null, width, height });
          return;
        }

        // Convert ImageBitmap → object URL via a temporary canvas.
        // This keeps the URL lifecycle inside the hook.
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          bitmap.close();
          canvas.width = 0;
          canvas.height = 0;
          onResultRef.current({ requestId, pageIndex, url: null, width, height });
          return;
        }
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        canvas.toBlob((blob) => {
          canvas.width = 0;
          canvas.height = 0;
          if (!blob) {
            onResultRef.current({ requestId, pageIndex, url: null, width, height });
            return;
          }
          const url = URL.createObjectURL(blob);
          trackedUrlsRef.current.add(url);
          onResultRef.current({ requestId, pageIndex, url, width, height });
        }, "image/jpeg", 0.85);
      } else if (msg.type === "THUMBNAIL_ERROR") {
        const { requestId, pageIndex, message } = msg;
        pendingRequestsRef.current.delete(requestId);
        // "cancelled" is a normal non-error path — do not forward to onError.
        if (message !== "cancelled") {
          onErrorRef.current?.(requestId, pageIndex, message);
        }
      }
    };

    w.onerror = () => {
      // Worker crashed — silently degrade. Pending requests will time out.
      // Callers see no result, which is handled by their own skeleton state.
    };

    workerRef.current = w;
    return w;
  }, []);

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  const request = useCallback((params: RenderParams) => {
    const { jobId, requestId, fileBytes, pageIndex, targetWidth, extraRotation = 0 } = params;
    const w = ensureWorker();
    pendingRequestsRef.current.add(requestId);
    // Slice before transfer — caller's buffer is never detached.
    const transferBuffer = fileBytes.slice(0);
    w.postMessage(
      {
        type: "THUMBNAIL_RENDER",
        jobId,
        requestId,
        fileBytes: transferBuffer,
        pageIndex,
        targetWidth,
        extraRotation,
      },
      [transferBuffer],
    );
  }, [ensureWorker]);

  const cancel = useCallback((jobId: number) => {
    workerRef.current?.postMessage({ type: "THUMBNAIL_CANCEL", jobId });
    // Remove matching requestIds — they follow the convention `${jobId}-*`.
    const toDelete: string[] = [];
    for (const id of pendingRequestsRef.current) {
      if (id.startsWith(`${jobId}-`)) toDelete.push(id);
    }
    toDelete.forEach((id) => pendingRequestsRef.current.delete(id));
  }, []);

  const cancelAll = useCallback(() => {
    workerRef.current?.postMessage({ type: "THUMBNAIL_CANCEL_ALL" });
    pendingRequestsRef.current.clear();
  }, []);

  const revokeUrl = useCallback((url: string) => {
    URL.revokeObjectURL(url);
    trackedUrlsRef.current.delete(url);
  }, []);

  // ---------------------------------------------------------------------------
  // Unmount cleanup — cancel → terminate → revoke all URLs
  // ---------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.postMessage({ type: "THUMBNAIL_CANCEL_ALL" });
        workerRef.current.terminate();
        workerRef.current = null;
      }
      pendingRequestsRef.current.clear();
      trackedUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      trackedUrlsRef.current.clear();
    };
  }, []);

  return { request, cancel, cancelAll, revokeUrl };
}
