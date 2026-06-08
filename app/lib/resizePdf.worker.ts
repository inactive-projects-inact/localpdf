import { PDFDocument } from "pdf-lib";
import type { PdfPipelineRequest, PdfPipelineValidation } from "./pdf-pipeline-protocol";
import { resizePdf } from "./pdf-resize";
import {
  assertActiveJob,
  buildMemoryWarning,
  PdfPipelineWorkerError,
  postPipelineMessage,
  validatePipelineOutput,
} from "./pdf-worker-utils";

let activeJobId = -1;

function resizedFilename(fileName: string): string {
  const base = fileName.replace(/\.pdf$/i, "") || "document";
  return `resized-${base}.pdf`;
}

async function convertPdf(message: Extract<PdfPipelineRequest, { type: "START" }>): Promise<void> {
  if (message.task.tool !== "resize-pdf") {
    throw new PdfPipelineWorkerError("Unsupported resize task.", "unsupported", true);
  }

  const memoryWarning = buildMemoryWarning(message.jobId, message.input.fileSize, 5);
  if (memoryWarning) postPipelineMessage(memoryWarning);

  postPipelineMessage({ type: "PROGRESS", jobId: message.jobId, phase: "loading", percent: 10, message: "Loading PDF..." });
  assertActiveJob(message.jobId, activeJobId);

  postPipelineMessage({ type: "PROGRESS", jobId: message.jobId, phase: "processing", percent: 45, message: "Resizing pages..." });
  const outputBytes = await resizePdf({
    pdfBytes: message.input.fileBytes,
    ...message.task.options,
  });
  if (!outputBytes) {
    throw new PdfPipelineWorkerError("Resize produced no output.", "empty-output", true);
  }
  assertActiveJob(message.jobId, activeJobId);

  postPipelineMessage({ type: "PROGRESS", jobId: message.jobId, phase: "validating", percent: 85, message: "Validating resized PDF..." });
  let outputPageCount = 0;
  try {
    const outputDoc = await PDFDocument.load(outputBytes, { ignoreEncryption: true });
    outputPageCount = outputDoc.getPageCount();
  } catch {
    throw new PdfPipelineWorkerError("Resize produced an unreadable PDF.", "corrupted", true);
  }

  const validation: PdfPipelineValidation = {
    minBytes: 500,
    requireContent: true,
    contentUnits: outputPageCount,
    contentDescription: "pages",
  };
  validatePipelineOutput(outputBytes.byteLength, validation);
  assertActiveJob(message.jobId, activeJobId);

  postPipelineMessage({
    type: "COMPLETE",
    jobId: message.jobId,
    output: {
      kind: "file",
      bytes: outputBytes,
      filename: resizedFilename(message.input.fileName),
      mimeType: "application/pdf",
      byteLength: outputBytes.byteLength,
      validation,
    },
  }, [outputBytes.buffer]);
}

self.onmessage = (event: MessageEvent<PdfPipelineRequest>) => {
  const message = event.data;
  if (message.type === "CANCEL") {
    if (message.jobId === activeJobId) {
      activeJobId = -1;
      postPipelineMessage({ type: "CANCELLED", jobId: message.jobId });
    }
    return;
  }

  activeJobId = message.jobId;
  convertPdf(message).catch((error: unknown) => {
    if (message.jobId !== activeJobId && !(error instanceof PdfPipelineWorkerError && error.code === "cancelled")) return;
    if (error instanceof PdfPipelineWorkerError && error.code === "cancelled") {
      postPipelineMessage({ type: "CANCELLED", jobId: message.jobId });
      return;
    }
    postPipelineMessage({
      type: "ERROR",
      jobId: message.jobId,
      code: error instanceof PdfPipelineWorkerError ? error.code : "unknown",
      message: error instanceof Error ? error.message : "Resize failed.",
      recoverable: error instanceof PdfPipelineWorkerError ? error.recoverable : true,
    });
  });
};
