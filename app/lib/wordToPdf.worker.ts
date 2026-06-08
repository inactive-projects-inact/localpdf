import mammoth from "mammoth";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import type { PdfPipelineRequest, PdfPipelineValidation, WordToPdfOptions } from "./pdf-pipeline-protocol";
import {
  assertActiveJob,
  buildMemoryWarning,
  PdfPipelineWorkerError,
  postPipelineMessage,
  validatePipelineOutput,
} from "./pdf-worker-utils";

type PageSize = WordToPdfOptions["pageSize"];
type FontScale = WordToPdfOptions["fontScale"];
type MarginSize = WordToPdfOptions["marginSize"];

const PAGE_SIZES: Record<PageSize, { width: number; height: number }> = {
  A4: { width: 595, height: 842 },
  Letter: { width: 612, height: 792 },
  Legal: { width: 612, height: 1008 },
};

const FONT_SCALES: Record<FontScale, number> = {
  small: 10,
  medium: 12,
  large: 14,
};

const MARGINS: Record<MarginSize, number> = {
  narrow: 30,
  normal: 50,
  wide: 72,
};

let activeJobId = -1;

function convertedFilename(fileName: string): string {
  const baseName = fileName.replace(/\.docx$/i, "") || "document";
  return `converted-${baseName}.pdf`;
}

function decodeDataImage(src: string): { mimeType: string; bytes: Uint8Array } | null {
  const match = /^data:(image\/(?:png|jpeg|jpg));base64,(.+)$/i.exec(src);
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { mimeType: match[1], bytes };
}

async function convertPdf(message: Extract<PdfPipelineRequest, { type: "START" }>): Promise<void> {
  if (message.task.tool !== "word-to-pdf") {
    throw new PdfPipelineWorkerError("Unsupported Word to PDF task.", "unsupported", true);
  }
  if (typeof DOMParser === "undefined") {
    throw new PdfPipelineWorkerError("This browser cannot parse Word content inside a worker.", "unsupported", true);
  }

  const memoryWarning = buildMemoryWarning(message.jobId, message.input.fileSize, 5);
  if (memoryWarning) postPipelineMessage(memoryWarning);

  postPipelineMessage({ type: "PROGRESS", jobId: message.jobId, phase: "loading", percent: 10, message: "Reading Word document..." });
  const { value: html } = await mammoth.convertToHtml(
    { arrayBuffer: message.input.fileBytes },
    { convertImage: mammoth.images.dataUri },
  );
  assertActiveJob(message.jobId, activeJobId);

  postPipelineMessage({ type: "PROGRESS", jobId: message.jobId, phase: "processing", percent: 35, message: "Building PDF..." });
  const parser = new DOMParser();
  const dom = parser.parseFromString(html, "text/html");
  const body = dom.body;
  const sourceContentUnits = (body.textContent ?? "").replace(/\s+/g, "").length + body.querySelectorAll("img").length;
  if (sourceContentUnits === 0) {
    throw new PdfPipelineWorkerError("No extractable content was found in this Word document.", "no-extractable-content", true);
  }

  const pdfDoc = await PDFDocument.create();
  const { width, height } = PAGE_SIZES[message.task.options.pageSize];
  const margin = MARGINS[message.task.options.marginSize];
  const baseSize = FONT_SCALES[message.task.options.fontScale];
  const contentWidth = width - margin * 2;
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = pdfDoc.addPage([width, height]);
  let y = height - margin;
  let renderedContentUnits = 0;

  const addPage = () => {
    page = pdfDoc.addPage([width, height]);
    y = height - margin;
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < margin) addPage();
  };

  const drawText = (text: string, font: PDFFont, size: number, color: RGB = rgb(0, 0, 0), x = margin, maxWidth = contentWidth) => {
    const trimmed = text.replace(/\s+/g, " ").trim();
    if (!trimmed) return;

    const words = trimmed.split(" ");
    let line = "";
    const lines: string[] = [];
    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      const lineWidth = font.widthOfTextAtSize(testLine, size);
      if (lineWidth > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = testLine;
      }
    }
    if (line) lines.push(line);

    for (const item of lines) {
      ensureSpace(size + 4);
      page.drawText(item, { x, y, size, font, color });
      renderedContentUnits += item.replace(/\s+/g, "").length;
      y -= size + 4;
    }
  };

  const drawImage = async (src: string) => {
    const imageData = decodeDataImage(src);
    if (!imageData) return;
    const image = imageData.mimeType.includes("png") ? await pdfDoc.embedPng(imageData.bytes) : await pdfDoc.embedJpg(imageData.bytes);
    const scale = Math.min(contentWidth / image.width, (height - margin * 2) / image.height, 1);
    const imageWidth = image.width * scale;
    const imageHeight = image.height * scale;
    ensureSpace(imageHeight + 8);
    page.drawImage(image, { x: margin, y: y - imageHeight, width: imageWidth, height: imageHeight });
    renderedContentUnits += 1;
    y -= imageHeight + 8;
  };

  const drawElement = async (node: Element): Promise<void> => {
    const tag = node.tagName.toLowerCase();
    const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
    const style = node.getAttribute("style") ?? "";
    if (/page-break-before:\s*always|break-before:\s*page/i.test(style)) addPage();

    if (tag === "h1") {
      ensureSpace(baseSize * 2 + 8);
      y -= 6;
      drawText(text, boldFont, baseSize * 1.7, rgb(0.05, 0.05, 0.05));
      y -= 4;
    } else if (tag === "h2") {
      ensureSpace(baseSize * 1.5 + 8);
      y -= 4;
      drawText(text, boldFont, baseSize * 1.4, rgb(0.1, 0.1, 0.1));
      y -= 3;
    } else if (tag === "h3") {
      drawText(text, boldFont, baseSize * 1.2);
      y -= 2;
    } else if (tag === "p") {
      drawText(text, regularFont, baseSize);
      y -= 3;
    } else if (tag === "ul" || tag === "ol") {
      Array.from(node.children)
        .filter((child) => child.tagName.toLowerCase() === "li")
        .forEach((li, index) => {
          const prefix = tag === "ol" ? `${index + 1}. ` : "- ";
          drawText(`${prefix}${li.textContent ?? ""}`, regularFont, baseSize, rgb(0, 0, 0), margin + 12, contentWidth - 12);
          y -= 1;
        });
      y -= 2;
    } else if (tag === "table") {
      const rows = Array.from(node.querySelectorAll("tr"));
      for (const row of rows) {
        const cells = Array.from(row.children).filter((cell) => ["td", "th"].includes(cell.tagName.toLowerCase()));
        const cellWidth = contentWidth / Math.max(1, cells.length);
        ensureSpace(baseSize + 8);
        cells.forEach((cell, index) => {
          const cellFont = cell.tagName.toLowerCase() === "th" ? boldFont : regularFont;
          drawText((cell.textContent ?? "").replace(/\s+/g, " ").trim(), cellFont, baseSize - 1, rgb(0, 0, 0), margin + index * cellWidth, cellWidth - 6);
        });
        y -= 2;
      }
      y -= 4;
    } else if (tag === "img") {
      await drawImage(node.getAttribute("src") ?? "");
    } else if (text) {
      drawText(text, regularFont, baseSize);
    }

    if (/page-break-after:\s*always|break-after:\s*page/i.test(style)) addPage();
  };

  const nodes = Array.from(body.childNodes);
  for (let index = 0; index < nodes.length; index += 1) {
    assertActiveJob(message.jobId, activeJobId);
    if (index % 10 === 0) {
      postPipelineMessage({
        type: "PROGRESS",
        jobId: message.jobId,
        phase: "processing",
        percent: Math.round(35 + (index / Math.max(1, nodes.length)) * 45),
        message: "Rendering Word content...",
        unitsDone: index,
        totalUnits: nodes.length,
      });
    }
    const node = nodes[index];
    if (node.nodeType !== 1) continue;
    await drawElement(node as Element);
  }

  postPipelineMessage({ type: "PROGRESS", jobId: message.jobId, phase: "saving", percent: 85, message: "Saving PDF..." });
  if (renderedContentUnits === 0) {
    throw new PdfPipelineWorkerError("No renderable Word content was found.", "no-extractable-content", true);
  }
  if (pdfDoc.getPageCount() === 0) {
    throw new PdfPipelineWorkerError("Conversion produced an empty PDF.", "empty-output", true);
  }
  const outputBytes = await pdfDoc.save();
  if (!outputBytes) {
    throw new PdfPipelineWorkerError("Conversion produced no output.", "empty-output", true);
  }

  const validation: PdfPipelineValidation = {
    minBytes: 500,
    requireContent: true,
    contentUnits: renderedContentUnits,
    contentDescription: "document-blocks",
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
      message: error instanceof Error ? error.message : "Word to PDF conversion failed.",
      recoverable: error instanceof PdfPipelineWorkerError ? error.recoverable : true,
    });
  });
};
