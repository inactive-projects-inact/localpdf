import type {
  PdfPipelineErrorCode,
  PdfPipelineMemoryWarning,
  PdfPipelineResponse,
  PdfPipelineValidation,
} from "./pdf-pipeline-protocol";

export class PdfPipelineWorkerError extends Error {
  readonly code: PdfPipelineErrorCode;
  readonly recoverable: boolean;

  constructor(message: string, code: PdfPipelineErrorCode = "unknown", recoverable = true) {
    super(message);
    this.name = "PdfPipelineWorkerError";
    this.code = code;
    this.recoverable = recoverable;
  }
}

export function postPipelineMessage(message: PdfPipelineResponse, transfer: Transferable[] = []): void {
  self.postMessage(message, { transfer });
}

export function assertActiveJob(jobId: number, activeJobId: number): void {
  if (jobId !== activeJobId) {
    throw new PdfPipelineWorkerError("Conversion cancelled.", "cancelled", true);
  }
}

export function getAvailableHeapBytes(): number | null {
  const memory = (performance as unknown as { memory?: { jsHeapSizeLimit?: number; usedJSHeapSize?: number } }).memory;
  if (!memory?.jsHeapSizeLimit) return null;
  return Math.max(0, memory.jsHeapSizeLimit - (memory.usedJSHeapSize ?? 0));
}

export function buildMemoryWarning(jobId: number, fileSize: number, multiplier = 4): PdfPipelineMemoryWarning | null {
  const estimatedBytes = fileSize * multiplier;
  const availableBytes = getAvailableHeapBytes();
  const fixedWarningThreshold = 128 * 1024 * 1024;
  const exceedsAvailable = availableBytes !== null && estimatedBytes > availableBytes * 0.7;
  if (estimatedBytes < fixedWarningThreshold && !exceedsAvailable) return null;
  return {
    type: "MEMORY_WARNING",
    jobId,
    estimatedBytes,
    availableBytes,
    severity: exceedsAvailable ? "warning" : "notice",
  };
}

export function validatePipelineOutput(byteLength: number, validation: PdfPipelineValidation): void {
  if (byteLength < validation.minBytes) {
    throw new PdfPipelineWorkerError("Conversion produced an empty output.", "empty-output", true);
  }
  if (validation.requireContent && validation.contentUnits <= 0) {
    throw new PdfPipelineWorkerError("No extractable content was found.", "no-extractable-content", true);
  }
}
