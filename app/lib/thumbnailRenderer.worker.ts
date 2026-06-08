// ---------------------------------------------------------------------------
// Thumbnail Renderer Worker
// Used ONLY for thumbnail generation in Organize PDF and Rotate PDF.
// Does NOT touch PDF conversion logic.
// ---------------------------------------------------------------------------
//
// Design:
// - Uses OffscreenCanvas where supported.
// - Falls back gracefully: sends bitmap: null so the caller can handle it.
// - Cancellation is per-jobId.
// - PDF.js documents are destroyed after each render to free memory.
// - Page references are cleaned up immediately after rendering.
// ---------------------------------------------------------------------------

import type {
  ThumbnailInboundMessage,
  ThumbnailOutboundMessage,
  ThumbnailRenderRequest,
} from "./thumbnail-worker-protocol";

// ─── State ─────────────────────────────────────────────────────────────────

/** Set of jobIds that have been cancelled. */
const cancelledJobs = new Set<number>();
/** True if OffscreenCanvas is available in this worker context. */
const supportsOffscreenCanvas = typeof OffscreenCanvas !== "undefined";

// ─── Post helper ───────────────────────────────────────────────────────────

function post(msg: ThumbnailOutboundMessage, transfer: Transferable[] = []): void {
  self.postMessage(msg, { transfer });
}

// ─── Core render function ──────────────────────────────────────────────────

async function renderThumbnail(req: ThumbnailRenderRequest): Promise<void> {
  const { jobId, requestId, pageIndex, fileBytes, targetWidth, extraRotation = 0 } = req;

  // Lazy-load pdfjs. Disable its own worker (we are already in a worker).
  const pdfjs = await import("pdfjs-dist");
  // @ts-ignore
  pdfjs.GlobalWorkerOptions.workerSrc = "";

  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(fileBytes) });
  let pdfDoc: import("pdfjs-dist").PDFDocumentProxy | null = null;

  try {
    pdfDoc = await loadingTask.promise;

    // Check cancellation after async boundary.
    if (cancelledJobs.has(jobId)) {
      post({ type: "THUMBNAIL_ERROR", jobId, requestId, pageIndex, message: "cancelled" });
      return;
    }

    const pdfPage = await pdfDoc.getPage(pageIndex + 1);

    try {
      const viewport1 = pdfPage.getViewport({ scale: 1 });
      const scale = targetWidth / viewport1.width;
      const viewport = pdfPage.getViewport({ scale, rotation: viewport1.rotation + extraRotation });
      const w = Math.ceil(viewport.width);
      const h = Math.ceil(viewport.height);

      if (cancelledJobs.has(jobId)) {
        post({ type: "THUMBNAIL_ERROR", jobId, requestId, pageIndex, message: "cancelled" });
        return;
      }

      if (!supportsOffscreenCanvas) {
        // Fallback: cannot render without OffscreenCanvas in a worker.
        // Signal the main thread to handle its own rendering.
        post({ type: "THUMBNAIL_RESULT", jobId, requestId, pageIndex, bitmap: null, width: w, height: h });
        return;
      }

      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        post({ type: "THUMBNAIL_RESULT", jobId, requestId, pageIndex, bitmap: null, width: w, height: h });
        return;
      }

      // White background.
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, w, h);

      const renderTask = pdfPage.render({
        canvasContext: ctx as unknown as CanvasRenderingContext2D,
        viewport,
      });

      await renderTask.promise;

      if (cancelledJobs.has(jobId)) {
        renderTask.cancel?.();
        post({ type: "THUMBNAIL_ERROR", jobId, requestId, pageIndex, message: "cancelled" });
        return;
      }

      // Transfer the ImageBitmap to avoid a copy.
      const bitmap = await createImageBitmap(canvas);
      post(
        { type: "THUMBNAIL_RESULT", jobId, requestId, pageIndex, bitmap, width: w, height: h },
        [bitmap],
      );
    } finally {
      // Always release the page reference.
      pdfPage.cleanup();
    }
  } catch (err) {
    const isCancelled = cancelledJobs.has(jobId);
    const message = isCancelled ? "cancelled" : err instanceof Error ? err.message : "render failed";
    post({ type: "THUMBNAIL_ERROR", jobId, requestId, pageIndex, message });
  } finally {
    // Always destroy the pdfjs document to free memory.
    if (pdfDoc) {
      await pdfDoc.destroy();
    }
  }
}

// ─── Message listener ──────────────────────────────────────────────────────

self.onmessage = (event: MessageEvent<ThumbnailInboundMessage>) => {
  const msg = event.data;

  switch (msg.type) {
    case "THUMBNAIL_CANCEL":
      cancelledJobs.add(msg.jobId);
      // Clean up cancelled jobs after a brief delay to avoid memory growth.
      setTimeout(() => cancelledJobs.delete(msg.jobId), 5000);
      break;

    case "THUMBNAIL_CANCEL_ALL":
      cancelledJobs.clear();
      break;

    case "THUMBNAIL_RENDER":
      // Fire and forget — each render is independent.
      renderThumbnail(msg).catch(() => {
        // renderThumbnail always posts its own error; this is a safety net.
      });
      break;
  }
};
