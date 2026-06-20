import * as pdfjsLib from "pdfjs-dist";
import type {
  PdfPipelineRequest,
  PdfToMarkdownOptions,
  PdfPipelineValidation,
} from "./pdf-pipeline-protocol";
import {
  assertActiveJob,
  buildMemoryWarning,
  PdfPipelineWorkerError,
  postPipelineMessage,
  validatePipelineOutput,
} from "./pdf-worker-utils";

type TextContentItem = Extract<Awaited<ReturnType<pdfjsLib.PDFPageProxy["getTextContent"]>>["items"][number], { str: string }>;

type Line = {
  text: string;
  x: number;
  y: number;
  height: number;
  width: number;
};

let activeJobId = -1;

function getMedian(values: number[]): number {
  if (values.length === 0) return 12;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 12;
}

function normalizeListLine(text: string): string {
  if (/^\d+\.\s+/.test(text)) return text;
  return text.replace(/^[\u2022*\u2013-]\s*/, "- ");
}

function filenameBase(fileName: string): string {
  return fileName.replace(/\.pdf$/i, "");
}

async function pageToMarkdown(page: pdfjsLib.PDFPageProxy, options: PdfToMarkdownOptions): Promise<string> {
  const content = await page.getTextContent({ includeMarkedContent: true });
  const items = content.items
    .filter((item): item is TextContentItem => {
      if (!("str" in item) || typeof item.str !== "string" || item.str.trim().length === 0) return false;
      if (!("transform" in item) || !Array.isArray(item.transform)) return false;
      return "height" in item && "width" in item;
    });
  const fontSizes = items.map((item) => Number(item.height)).filter((height) => height > 0);
  const medianSize = getMedian(fontSizes);
  const viewport = page.getViewport({ scale: 1 });
  const sorted = [...items].sort((a, b) => Number(b.transform[5]) - Number(a.transform[5]) || Number(a.transform[4]) - Number(b.transform[4]));
  const lines: Line[] = [];

  for (const item of sorted) {
    const y = Number(item.transform[5]);
    const x = Number(item.transform[4]);
    const width = Math.max(0, Number(item.width) || 0);
    const existing = lines.find((line) => Math.abs(line.y - y) <= Math.max(2, medianSize * 0.35));
    if (existing) {
      const gap = x - (existing.x + existing.width);
      const separator = gap > medianSize * 1.8 ? "\t" : " ";
      existing.text = `${existing.text}${separator}${item.str}`.replace(/ {2,}/g, " ").trim();
      existing.height = Math.max(existing.height, Number(item.height));
      existing.x = Math.min(existing.x, x);
      existing.width = Math.max(existing.width, x + width - existing.x);
    } else {
      lines.push({ text: item.str.trim(), x, y, height: Number(item.height), width });
    }
  }

  const leftColumn = lines.filter((line) => line.x < viewport.width * 0.55);
  const rightColumn = lines.filter((line) => line.x >= viewport.width * 0.55);
  const orderedLines =
    leftColumn.length > 2 && rightColumn.length > 2
      ? [...leftColumn.sort((a, b) => b.y - a.y), ...rightColumn.sort((a, b) => b.y - a.y)]
      : lines;
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let lastIndent: number | null = null;
  const tableRows: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push(paragraph.join(" ").replace(/\s+/g, " ").trim());
      paragraph = [];
    }
  };

  const flushTable = () => {
    if (tableRows.length === 0) return;
    if (tableRows.length < 2) {
      blocks.push(...tableRows.map((row) => row.replace(/\t/g, " ")));
      tableRows.length = 0;
      return;
    }
    const columnCount = Math.max(...tableRows.map((row) => row.split("\t").length));
    const rows = tableRows.map((row) => {
      const cells = row.split("\t").map((cell) => cell.trim());
      while (cells.length < columnCount) cells.push("");
      return `| ${cells.join(" | ")} |`;
    });
    blocks.push(rows[0], `| ${Array.from({ length: columnCount }, () => "---").join(" | ")} |`, ...rows.slice(1));
    tableRows.length = 0;
  };

  for (const line of orderedLines) {
    const text = line.text.trim();
    if (!text) continue;
    const isList = options.lists && (/^[\u2022*\u2013-]\s+/.test(text) || /^\d+\.\s+/.test(text));
    const headingPrefix =
      options.headings && line.height >= medianSize * 2.0
        ? "# "
        : options.headings && line.height >= medianSize * 1.5
          ? "## "
          : options.headings && line.height >= medianSize * 1.2
            ? "### "
            : "";

    if (headingPrefix || isList) {
      flushParagraph();
      flushTable();
      blocks.push(isList ? normalizeListLine(text) : `${headingPrefix}${text}`);
      lastIndent = null;
      continue;
    }

    if (text.includes("\t")) {
      flushParagraph();
      tableRows.push(text);
      lastIndent = null;
      continue;
    }

    flushTable();
    if (lastIndent !== null && Math.abs(line.x - lastIndent) > 8) {
      flushParagraph();
    }
    paragraph.push(text);
    lastIndent = line.x;
  }

  flushParagraph();
  flushTable();
  return blocks.join("\n\n");
}

async function analyzePdf(message: Extract<PdfPipelineRequest, { type: "START" }>): Promise<void> {
  let pdf: pdfjsLib.PDFDocumentProxy | null = null;
  let firstPage: pdfjsLib.PDFPageProxy | null = null;
  try {
    postPipelineMessage({ type: "PROGRESS", jobId: message.jobId, phase: "loading", percent: 20, message: "Reading PDF..." });
    pdf = await pdfjsLib.getDocument({ data: new Uint8Array(message.input.fileBytes) }).promise;
    assertActiveJob(message.jobId, activeJobId);
    if (pdf.numPages < 1) throw new PdfPipelineWorkerError("Could not read any pages from this PDF.", "corrupted", true);

    postPipelineMessage({ type: "PROGRESS", jobId: message.jobId, phase: "analyzing", percent: 60, message: "Checking selectable text..." });
    firstPage = await pdf.getPage(1);
    const content = await firstPage.getTextContent({ includeMarkedContent: true });
    const textBased = content.items.some((item) => "str" in item && typeof item.str === "string" && item.str.trim().length > 0);
    assertActiveJob(message.jobId, activeJobId);

    postPipelineMessage({
      type: "COMPLETE",
      jobId: message.jobId,
      output: {
        kind: "pdf-to-markdown-analysis",
        filename: message.input.fileName,
        pageCount: pdf.numPages,
        textBased,
      },
    });
  } finally {
    await firstPage?.cleanup();
    await pdf?.cleanup?.();
    await pdf?.destroy?.();
  }
}

async function convertPdf(message: Extract<PdfPipelineRequest, { type: "START" }>): Promise<void> {
  let pdf: pdfjsLib.PDFDocumentProxy | null = null;
  if (message.task.tool !== "pdf-to-markdown" || message.task.operation !== "convert") {
    throw new Error("Invalid task for convertPdf");
  }
  const options = message.task.options;
  try {
    const memoryWarning = buildMemoryWarning(message.jobId, message.input.fileSize);
    if (memoryWarning) postPipelineMessage(memoryWarning);

    postPipelineMessage({ type: "PROGRESS", jobId: message.jobId, phase: "loading", percent: 10, message: "Loading PDF..." });
    pdf = await pdfjsLib.getDocument({ data: new Uint8Array(message.input.fileBytes) }).promise;
    assertActiveJob(message.jobId, activeJobId);
    if (pdf.numPages < 1) throw new PdfPipelineWorkerError("Could not read any pages from this PDF.", "corrupted", true);

    const startPage = Math.max(1, Math.min(options.startPage, pdf.numPages));
    const endPage = Math.max(startPage, Math.min(options.endPage, pdf.numPages));
    const totalPages = endPage - startPage + 1;
    if (totalPages > 100) {
      throw new PdfPipelineWorkerError("Document too large. Extraction is limited to 100 pages at a time.", "unsupported", true);
    }

    const pages: string[] = [];
    let completed = 0;
    for (let pageNum = startPage; pageNum <= endPage; pageNum += 1) {
      assertActiveJob(message.jobId, activeJobId);
      postPipelineMessage({
        type: "PROGRESS",
        jobId: message.jobId,
        phase: "processing",
        percent: Math.round(15 + (completed / totalPages) * 70),
        message: `Extracting page ${pageNum} of ${endPage}...`,
        page: { current: pageNum, total: endPage },
        unitsDone: completed,
        totalUnits: totalPages,
      });

      const page = await pdf.getPage(pageNum);
      try {
        pages.push(await pageToMarkdown(page, options));
      } finally {
        await page.cleanup();
      }
      completed += 1;
    }

    postPipelineMessage({ type: "PROGRESS", jobId: message.jobId, phase: "validating", percent: 90, message: "Validating Markdown..." });
    let output = options.separators ? pages.join("\n\n---\n\n") : pages.join("\n\n");
    if (options.cleanWhitespace) {
      output = output.replace(/\n{3,}/g, "\n\n").trim();
    }

    const bytes = new TextEncoder().encode(output);
    const contentUnits = pages.join("").replace(/\s+/g, "").length;
    const validation: PdfPipelineValidation = {
      minBytes: 1,
      requireContent: true,
      contentUnits,
      contentDescription: "text",
    };
    validatePipelineOutput(bytes.byteLength, validation);
    assertActiveJob(message.jobId, activeJobId);

    postPipelineMessage({
      type: "COMPLETE",
      jobId: message.jobId,
      output: {
        kind: "text",
        bytes,
        filename: `${filenameBase(message.input.fileName)}.md`,
        mimeType: "text/markdown",
        byteLength: bytes.byteLength,
        validation,
      },
    }, [bytes.buffer]);
  } finally {
    await pdf?.cleanup?.();
    await pdf?.destroy?.();
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
  const run = message.task.operation === "analyze" ? analyzePdf(message) : convertPdf(message);
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
      message: error instanceof Error ? error.message : "Markdown conversion failed.",
      recoverable: error instanceof PdfPipelineWorkerError ? error.recoverable : true,
    });
  });
};
