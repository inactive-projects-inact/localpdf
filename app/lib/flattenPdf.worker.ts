import { PDFDocument } from "pdf-lib";
import type { PdfPipelineRequest, PdfPipelineValidation } from "./pdf-pipeline-protocol";
import {
  assertActiveJob,
  buildMemoryWarning,
  PdfPipelineWorkerError,
  postPipelineMessage,
  validatePipelineOutput,
} from "./pdf-worker-utils";

let activeJobId = -1;

function flattenedFilename(fileName: string): string {
  return fileName.toLowerCase().endsWith(".pdf") ? `flattened-${fileName}` : `flattened-${fileName}.pdf`;
}

async function loadDocument(fileBytes: ArrayBuffer): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(new Uint8Array(fileBytes));
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("encrypted")) {
      throw new PdfPipelineWorkerError("Encrypted PDFs are not supported for AcroForm flattening.", "encrypted", true);
    }
    throw new PdfPipelineWorkerError("Could not read this PDF.", "corrupted", true);
  }
}

async function analyzePdf(message: Extract<PdfPipelineRequest, { type: "START" }>): Promise<void> {
  const memoryWarning = buildMemoryWarning(message.jobId, message.input.fileSize, 3);
  if (memoryWarning) postPipelineMessage(memoryWarning);

  postPipelineMessage({ type: "PROGRESS", jobId: message.jobId, phase: "loading", percent: 25, message: "Reading PDF..." });
  const pdfDoc = await loadDocument(message.input.fileBytes);
  assertActiveJob(message.jobId, activeJobId);

  postPipelineMessage({ type: "PROGRESS", jobId: message.jobId, phase: "analyzing", percent: 70, message: "Checking AcroForm fields..." });
  const pageCount = pdfDoc.getPageCount();
  const fieldCount = pdfDoc.getForm().getFields().length;
  assertActiveJob(message.jobId, activeJobId);

  postPipelineMessage({
    type: "COMPLETE",
    jobId: message.jobId,
    output: {
      kind: "flatten-pdf-analysis",
      filename: message.input.fileName,
      pageCount,
      fieldCount,
    },
  });
}

async function flattenPdf(message: Extract<PdfPipelineRequest, { type: "START" }>): Promise<void> {
  const memoryWarning = buildMemoryWarning(message.jobId, message.input.fileSize, 4);
  if (memoryWarning) postPipelineMessage(memoryWarning);

  postPipelineMessage({ type: "PROGRESS", jobId: message.jobId, phase: "loading", percent: 15, message: "Loading PDF..." });
  const pdfDoc = await loadDocument(message.input.fileBytes);
  assertActiveJob(message.jobId, activeJobId);

  const form = pdfDoc.getForm();
  const fieldCount = form.getFields().length;
  if (fieldCount === 0) {
    throw new PdfPipelineWorkerError(
      "No AcroForm fields found. This tool only flattens AcroForm fields.",
      "no-flattenable-fields",
      true,
    );
  }

  postPipelineMessage({
    type: "PROGRESS",
    jobId: message.jobId,
    phase: "processing",
    percent: 55,
    message: `Flattening ${fieldCount} AcroForm field${fieldCount === 1 ? "" : "s"}...`,
    unitsDone: 0,
    totalUnits: fieldCount,
  });
  form.flatten();
  assertActiveJob(message.jobId, activeJobId);

  postPipelineMessage({ type: "PROGRESS", jobId: message.jobId, phase: "saving", percent: 80, message: "Saving flattened PDF..." });
  const outputBytes = await pdfDoc.save();
  if (!outputBytes) {
    throw new PdfPipelineWorkerError("Flattening produced no output.", "empty-output", true);
  }

  const validation: PdfPipelineValidation = {
    minBytes: 500,
    requireContent: true,
    contentUnits: fieldCount,
    contentDescription: "fields",
  };
  validatePipelineOutput(outputBytes.byteLength, validation);
  assertActiveJob(message.jobId, activeJobId);

  postPipelineMessage({
    type: "COMPLETE",
    jobId: message.jobId,
    output: {
      kind: "file",
      bytes: outputBytes,
      filename: flattenedFilename(message.input.fileName),
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
  const run = message.task.tool === "flatten-pdf" && message.task.operation === "analyze" ? analyzePdf(message) : flattenPdf(message);
  run.catch((error: unknown) => {
    if (message.jobId !== activeJobId && !(error instanceof PdfPipelineWorkerError && error.code === "cancelled")) return;
    if (error instanceof PdfPipelineWorkerError && error.code === "cancelled") {
      postPipelineMessage({ type: "CANCELLED", jobId: message.jobId });
      return;
    }
    postPipelineMessage({
      type: "ERROR",
      jobId: message.jobId,
      code: error instanceof PdfPipelineWorkerError ? error.code : "unknown",
      message: error instanceof Error ? error.message : "Flattening failed.",
      recoverable: error instanceof PdfPipelineWorkerError ? error.recoverable : true,
    });
  });
};
