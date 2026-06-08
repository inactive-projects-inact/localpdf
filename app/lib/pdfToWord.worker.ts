import * as pdfjsLib from "pdfjs-dist";
import { Document, Packer, PageBreak, Paragraph, TextRun } from "docx";
import type { PdfPipelineRequest, PdfPipelineValidation } from "./pdf-pipeline-protocol";
import {
  assertActiveJob,
  buildMemoryWarning,
  PdfPipelineWorkerError,
  postPipelineMessage,
  validatePipelineOutput,
} from "./pdf-worker-utils";

type TextItemLike = {
  str: string;
  transform: readonly number[];
  height?: number;
};

type Line = {
  text: string;
  maxHeight: number;
};

let activeJobId = -1;

function isTextItemLike(item: unknown): item is TextItemLike {
  if (typeof item !== "object" || item === null) return false;
  const candidate = item as { str?: unknown; transform?: unknown; height?: unknown };
  return typeof candidate.str === "string" && Array.isArray(candidate.transform);
}

function convertedFilename(fileName: string): string {
  const baseName = fileName.replace(/\.pdf$/i, "") || "document";
  return `converted-${baseName}.docx`;
}

function createPdfTask(fileBytes: ArrayBuffer) {
  const source = { data: new Uint8Array(fileBytes), disableWorker: true } as unknown as Parameters<typeof pdfjsLib.getDocument>[0];
  return pdfjsLib.getDocument(source);
}

function extractLines(items: TextItemLike[]): Line[] {
  const sorted = [...items].sort((a, b) => {
    const yDiff = Number(b.transform[5]) - Number(a.transform[5]);
    if (Math.abs(yDiff) > 3) return yDiff;
    return Number(a.transform[4]) - Number(b.transform[4]);
  });
  const lines: Line[] = [];
  let currentLine: Line | null = null;
  let lastY = -Infinity;

  for (const item of sorted) {
    const y = Number(item.transform[5]);
    if (currentLine === null || Math.abs(y - lastY) > 5) {
      if (currentLine) lines.push(currentLine);
      currentLine = { text: item.str, maxHeight: item.height ?? 12 };
      lastY = y;
    } else {
      currentLine.text += `${item.str.startsWith(" ") ? "" : " "}${item.str}`;
      currentLine.maxHeight = Math.max(currentLine.maxHeight, item.height ?? 12);
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}

async function analyzePdf(message: Extract<PdfPipelineRequest, { type: "START" }>): Promise<void> {
  let pdfDoc: pdfjsLib.PDFDocumentProxy | null = null;
  try {
    const memoryWarning = buildMemoryWarning(message.jobId, message.input.fileSize, 3);
    if (memoryWarning) postPipelineMessage(memoryWarning);

    postPipelineMessage({ type: "PROGRESS", jobId: message.jobId, phase: "loading", percent: 30, message: "Reading PDF..." });
    pdfDoc = await createPdfTask(message.input.fileBytes).promise;
    assertActiveJob(message.jobId, activeJobId);

    postPipelineMessage({
      type: "COMPLETE",
      jobId: message.jobId,
      output: {
        kind: "pdf-to-word-analysis",
        filename: message.input.fileName,
        pageCount: pdfDoc.numPages,
      },
    });
  } finally {
    await pdfDoc?.cleanup?.();
    await pdfDoc?.destroy?.();
  }
}

async function convertPdf(message: Extract<PdfPipelineRequest, { type: "START" }>): Promise<void> {
  let pdfDoc: pdfjsLib.PDFDocumentProxy | null = null;
  try {
    const memoryWarning = buildMemoryWarning(message.jobId, message.input.fileSize, 5);
    if (memoryWarning) postPipelineMessage(memoryWarning);

    postPipelineMessage({ type: "PROGRESS", jobId: message.jobId, phase: "loading", percent: 8, message: "Loading PDF..." });
    pdfDoc = await createPdfTask(message.input.fileBytes).promise;
    assertActiveJob(message.jobId, activeJobId);

    if (pdfDoc.numPages > 100) {
      throw new PdfPipelineWorkerError("Document too large. Client-side text extraction is limited to 100 pages.", "unsupported", true);
    }

    const docChildren: Paragraph[] = [];
    let extractedTextLength = 0;

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum += 1) {
      assertActiveJob(message.jobId, activeJobId);
      postPipelineMessage({
        type: "PROGRESS",
        jobId: message.jobId,
        phase: "processing",
        percent: Math.round(10 + ((pageNum - 1) / pdfDoc.numPages) * 65),
        message: `Extracting page ${pageNum} of ${pdfDoc.numPages}...`,
        page: { current: pageNum, total: pdfDoc.numPages },
        unitsDone: pageNum - 1,
        totalUnits: pdfDoc.numPages,
      });

      const page = await pdfDoc.getPage(pageNum);
      try {
        const textContent = await page.getTextContent();
        const textItems: TextItemLike[] = [];
        for (const item of textContent.items) {
          if (isTextItemLike(item)) {
            textItems.push({ str: item.str, transform: item.transform, height: item.height });
          }
        }
        const lines = extractLines(textItems);
        for (const line of lines) {
          const text = line.text.trim();
          if (!text) continue;
          extractedTextLength += text.replace(/\s+/g, "").length;
          docChildren.push(new Paragraph({ children: [new TextRun({ text })] }));
        }

        if (pageNum < pdfDoc.numPages) {
          docChildren.push(new Paragraph({ children: [new PageBreak()] }));
        }
      } finally {
        await page.cleanup();
      }
    }

    if (extractedTextLength === 0) {
      throw new PdfPipelineWorkerError("No extractable text was found in this PDF.", "no-extractable-content", true);
    }

    postPipelineMessage({ type: "PROGRESS", jobId: message.jobId, phase: "saving", percent: 82, message: "Generating Word document..." });
    const doc = new Document({ sections: [{ children: docChildren }] });
    const arrayBuffer = await Packer.toArrayBuffer(doc);
    const outputBytes = new Uint8Array(arrayBuffer);
    if (!outputBytes) {
      throw new PdfPipelineWorkerError("Conversion produced no output.", "empty-output", true);
    }

    const validation: PdfPipelineValidation = {
      minBytes: 500,
      requireContent: true,
      contentUnits: extractedTextLength,
      contentDescription: "text",
    };
    validatePipelineOutput(outputBytes.byteLength, validation);
    assertActiveJob(message.jobId, activeJobId);

    postPipelineMessage({
      type: "COMPLETE",
      jobId: message.jobId,
      output: {
        kind: "file",
        bytes: outputBytes,
        filename: convertedFilename(message.input.fileName),
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        byteLength: outputBytes.byteLength,
        validation,
      },
    }, [outputBytes.buffer]);
  } finally {
    await pdfDoc?.cleanup?.();
    await pdfDoc?.destroy?.();
  }
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
  const run = message.task.tool === "pdf-to-word" && message.task.operation === "analyze" ? analyzePdf(message) : convertPdf(message);
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
      message: error instanceof Error ? error.message : "PDF to Word conversion failed.",
      recoverable: error instanceof PdfPipelineWorkerError ? error.recoverable : true,
    });
  });
};
