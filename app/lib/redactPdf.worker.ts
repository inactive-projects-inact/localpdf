// ---------------------------------------------------------------------------
// Redact PDF Worker
// ---------------------------------------------------------------------------
// Runs the heavy render loop off the main thread.
//
// HONESTY NOTE: This tool paints black/white rectangles over rendered page
// images. It does NOT remove underlying text from the PDF content stream.
// The output is NOT forensic-grade or legally admissible redaction.
// ---------------------------------------------------------------------------

import { PDFDocument } from "pdf-lib";
import type {
  RedactInboundMessage,
  RedactOutboundMessage,
  RedactPageTask,
} from "./redact-worker-protocol";

// ─── State ─────────────────────────────────────────────────────────────────

let activeJobId = -1;

// ─── Post helper ───────────────────────────────────────────────────────────

function post(msg: RedactOutboundMessage, transfer: Transferable[] = []): void {
  self.postMessage(msg, { transfer });
}

// ─── Cancellation guard ────────────────────────────────────────────────────

function assertActive(jobId: number): void {
  if (jobId !== activeJobId) {
    throw new Error("cancelled");
  }
}

// ─── Page render helper (OffscreenCanvas) ──────────────────────────────────

async function renderPageToJpeg(
  pdfBytes: ArrayBuffer,
  pageIndex: number,
  task: RedactPageTask,
  redactionStyle: "black" | "white",
  showLabel: boolean,
): Promise<Uint8Array> {
  // Dynamic import of pdfjs-dist inside the worker.
  // The workerSrc is NOT used inside a worker (pdfjs has its own internal
  // worker handling); we disable it to avoid a nested-worker error.
  const pdfjs = await import("pdfjs-dist");
  // Disable pdfjs's own worker when already inside a worker.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pdfjs as any).GlobalWorkerOptions.workerSrc = "";

  const loadingTask = pdfjs.getDocument({ data: pdfBytes.slice(0) });
  const doc = await loadingTask.promise;
  try {
    const page = await doc.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: 2.0 });

    // OffscreenCanvas is available in workers.
    const canvas = new OffscreenCanvas(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height),
    );
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("OffscreenCanvas 2D context unavailable.");

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // pdfjs render – canvasContext must be the 2d context.
    await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport }).promise;

    // Paint redaction boxes.
    for (const box of task.boxes) {
      const px = box.xPct * canvas.width;
      const py = box.yPct * canvas.height;
      const pw = box.wPct * canvas.width;
      const ph = box.hPct * canvas.height;
      ctx.fillStyle = redactionStyle === "black" ? "#000000" : "#FFFFFF";
      ctx.fillRect(px, py, pw, ph);
      if (redactionStyle === "white") {
        ctx.strokeStyle = "#9CA3AF";
        ctx.lineWidth = 1;
        ctx.strokeRect(px, py, pw, ph);
      }
      if (showLabel) {
        ctx.fillStyle = redactionStyle === "black" ? "#FFFFFF" : "#6B7280";
        ctx.font = `bold ${Math.max(10, ph * 0.25)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("REDACTED", px + pw / 2, py + ph / 2);
      }
    }

    // Export as JPEG blob then convert to Uint8Array.
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
    const arrayBuffer = await blob.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } finally {
    await doc.destroy();
  }
}

// ─── Main handler ──────────────────────────────────────────────────────────

async function handleRedact(
  jobId: number,
  fileBytes: ArrayBuffer,
  fileName: string,
  pageTasks: RedactPageTask[],
  totalPages: number,
  redactionStyle: "black" | "white",
  showLabel: boolean,
): Promise<void> {
  // Memory warning: redacted pages are rendered at 2× scale; budget ~6 × file.
  const estimatedBytes = fileBytes.byteLength * 6;
  // @ts-ignore – performance.memory is Chrome-only but fine inside worker
  const heapLimit: number | undefined = (performance as any)?.memory?.jsHeapSizeLimit;
  // @ts-ignore
  const heapUsed: number | undefined = (performance as any)?.memory?.usedJSHeapSize;
  if (
    heapLimit !== undefined &&
    heapUsed !== undefined &&
    estimatedBytes > (heapLimit - heapUsed) * 0.7
  ) {
    post({
      type: "REDACT_ERROR",
      jobId,
      message:
        "Estimated memory usage exceeds available heap. Try a smaller PDF or close other tabs.",
    });
    return;
  }

  post({
    type: "REDACT_PROGRESS",
    jobId,
    percent: 5,
    message: "Loading PDF…",
    processingPage: 0,
    pageStatus: "copying",
  });

  const srcDoc = await PDFDocument.load(new Uint8Array(fileBytes), {
    ignoreEncryption: true,
  });
  assertActive(jobId);

  const newDoc = await PDFDocument.create();
  assertActive(jobId);

  // Build a fast lookup: pageIndex → task
  const taskMap = new Map<number, RedactPageTask>();
  for (const task of pageTasks) {
    taskMap.set(task.pageIndex, task);
  }

  let redactedPageCount = 0;

  for (let i = 0; i < totalPages; i++) {
    assertActive(jobId);

    const task = taskMap.get(i);
    const percent = Math.round(5 + ((i / totalPages) * 85));

    if (!task || task.boxes.length === 0) {
      // No redactions on this page — copy it unchanged.
      post({
        type: "REDACT_PROGRESS",
        jobId,
        percent,
        message: `Copying page ${i + 1} of ${totalPages}…`,
        processingPage: i,
        pageStatus: "copying",
      });

      const [copiedPage] = await newDoc.copyPages(srcDoc, [i]);
      newDoc.addPage(copiedPage);

      post({ type: "REDACT_PAGE_DONE", jobId, pageIndex: i, status: "copied" });
    } else {
      // Render, paint boxes, embed as JPEG.
      post({
        type: "REDACT_PROGRESS",
        jobId,
        percent,
        message: `Redacting page ${i + 1} of ${totalPages}…`,
        processingPage: i,
        pageStatus: "redacting",
      });

      const jpegBytes = await renderPageToJpeg(
        fileBytes,
        i,
        task,
        redactionStyle,
        showLabel,
      );
      assertActive(jobId);

      const jpgImage = await newDoc.embedJpg(jpegBytes);
      const origPage = srcDoc.getPage(i);
      const { width: pdfW, height: pdfH } = origPage.getSize();
      const newPage = newDoc.addPage([pdfW, pdfH]);
      newPage.drawImage(jpgImage, { x: 0, y: 0, width: pdfW, height: pdfH });

      redactedPageCount += 1;
      post({ type: "REDACT_PAGE_DONE", jobId, pageIndex: i, status: "redacted" });
    }

    assertActive(jobId);
  }

  post({
    type: "REDACT_PROGRESS",
    jobId,
    percent: 92,
    message: "Saving redacted PDF…",
    processingPage: totalPages - 1,
    pageStatus: "redacting",
  });

  const outputBytes = await newDoc.save();
  assertActive(jobId);

  // ─── Output validation ────────────────────────────────────────────────
  if (!outputBytes || outputBytes.byteLength < 500) {
    post({
      type: "REDACT_ERROR",
      jobId,
      message: "Output validation failed: produced empty or corrupt PDF.",
    });
    return;
  }
  if (redactedPageCount === 0 && pageTasks.length > 0) {
    post({
      type: "REDACT_ERROR",
      jobId,
      message: "Output validation failed: zero pages were redacted despite having redaction boxes.",
    });
    return;
  }

  post(
    {
      type: "REDACT_COMPLETE",
      jobId,
      bytes: outputBytes,
      byteLength: outputBytes.byteLength,
      redactedPageCount,
      totalPageCount: totalPages,
    },
    [outputBytes.buffer],
  );
}

// ─── Message listener ──────────────────────────────────────────────────────

self.onmessage = (event: MessageEvent<RedactInboundMessage>) => {
  const msg = event.data;

  if (msg.type === "REDACT_START") {
    activeJobId = msg.jobId;

    handleRedact(
      msg.jobId,
      msg.fileBytes,
      msg.fileName,
      msg.pageTasks,
      msg.totalPages,
      msg.redactionStyle,
      msg.showLabel,
    ).catch((err: unknown) => {
      // Discard if this job was superseded.
      if (msg.jobId !== activeJobId) return;

      const message = err instanceof Error ? err.message : "Unknown error";
      post({ type: "REDACT_ERROR", jobId: msg.jobId, message });
    });
  }
};
