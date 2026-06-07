"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Home,
  Info,
  Loader2,
  RotateCcw,
  Search,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import AppShell from "../components/AppShell";
import ShortcutHint from "../components/ShortcutHint";
import SizeComparisonBadge from "../components/SizeComparisonBadge";
import { useFileHistory } from "../components/FileHistoryProvider";
import { formatBytes } from "../lib/format-bytes";
import { getToolDefinition, hasPdfHeader } from "../lib/tool-registry";

type Step = 1 | 2 | 3 | 4;
type PageScope = "all" | "single" | "range";
type OutputMode = "pdf" | "text";
type AccuracyMode = "fast" | "balanced" | "precise";
type PageStatusKind = "waiting" | "processing" | "done" | "skipped" | "failed";

type PdfInfo = { file: File; pageCount: number; hasSelectableText: boolean };
type PageStatus = { pageNumber: number; status: PageStatusKind; confidence?: number; note?: string };
type OcrWord = { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } };
type PageArtifact = {
  pageNumber: number;
  canvasWidth: number;
  canvasHeight: number;
  words: OcrWord[];
  text: string;
  confidence: number;
  skipped?: boolean;
  failed?: boolean;
};
type ResultState = {
  mode: OutputMode;
  bytes?: Uint8Array;
  text?: string;
  filename: string;
  outputSize: number;
  confidence: number;
  processedPages: number;
  attemptedPages: number;
  partial: boolean;
  pageSummaries: PageStatus[];
};

const TOOL = getToolDefinition("ocr");
const ACCENT = "#3B3BFF";
const LANGUAGES = [
  { label: "English", code: "eng" },
  { label: "French", code: "fra" },
  { label: "German", code: "deu" },
  { label: "Spanish", code: "spa" },
  { label: "Hindi", code: "hin" },
  { label: "Chinese Simplified", code: "chi_sim" },
  { label: "Arabic", code: "ara" },
  { label: "Japanese", code: "jpn" },
  { label: "Portuguese", code: "por" },
  { label: "Russian", code: "rus" },
];
const DPR_BY_MODE: Record<AccuracyMode, number> = { fast: 1, balanced: 2, precise: 3 };
const MAX_RENDER_PIXELS = 12_000_000;
const MAX_RENDER_SIDE = 4096;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function estimateRemaining(completedDurations: number[], remaining: number) {
  if (completedDurations.length === 0) return "Calculating...";
  const recent = completedDurations.slice(-4);
  const average = recent.reduce((sum, item) => sum + item, 0) / recent.length;
  const seconds = Math.max(1, Math.round((average * remaining) / 1000));
  return seconds < 60 ? `${seconds}s remaining` : `${Math.ceil(seconds / 60)}m remaining`;
}

function extractWords(data: unknown): OcrWord[] {
  const page = data as { words?: OcrWord[]; blocks?: Array<{ paragraphs?: Array<{ lines?: Array<{ words?: OcrWord[] }> }> }> };
  if (Array.isArray(page.words)) return page.words.filter((word) => word.text.trim());
  const words: OcrWord[] = [];
  page.blocks?.forEach((block) => {
    block.paragraphs?.forEach((paragraph) => {
      paragraph.lines?.forEach((line) => {
        line.words?.forEach((word) => {
          if (word.text.trim()) words.push(word);
        });
      });
    });
  });
  return words;
}

async function preprocessCanvas(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;
  const width = canvas.width;
  const height = canvas.height;
  const image = context.getImageData(0, 0, width, height);
  const source = image.data;
  const gray = new Uint8ClampedArray(source.length);

  // Yield during grayscale conversion
  for (let i = 0; i < source.length; i += 4) {
    if (i % 400000 === 0) await yieldToBrowser();
    const value = clamp((0.299 * source[i] + 0.587 * source[i + 1] + 0.114 * source[i + 2]) * 1.4, 0, 255);
    gray[i] = value;
    gray[i + 1] = value;
    gray[i + 2] = value;
    gray[i + 3] = source[i + 3];
  }

  const sharpened = new Uint8ClampedArray(gray);
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
  for (let y = 1; y < height - 1; y++) {
    if (y % 100 === 0) await yieldToBrowser();
    for (let x = 1; x < width - 1; x++) {
      let sum = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          sum += gray[((y + ky) * width + (x + kx)) * 4] * kernel[(ky + 1) * 3 + (kx + 1)];
        }
      }
      const index = (y * width + x) * 4;
      const value = clamp(sum, 0, 255);
      sharpened[index] = value;
      sharpened[index + 1] = value;
      sharpened[index + 2] = value;
      sharpened[index + 3] = gray[index + 3];
    }
  }
  context.putImageData(new ImageData(sharpened, width, height), 0, 0);
}

function safeOutputName(file: File, extension: string) {
  return `${file.name.replace(/\.pdf$/i, "")}-ocr.${extension}`;
}

function getDownloadBlob(result: ResultState) {
  if (result.mode === "pdf" && result.bytes) {
    const buffer = result.bytes.buffer.slice(result.bytes.byteOffset, result.bytes.byteOffset + result.bytes.byteLength) as ArrayBuffer;
    return new Blob([buffer], { type: "application/pdf" });
  }
  return new Blob([result.text ?? ""], { type: "text/plain;charset=utf-8" });
}

function mapVisualPointToPdf(x: number, y: number, pageWidth: number, pageHeight: number, rotation: number) {
  const normalized = ((rotation % 360) + 360) % 360;
  if (normalized === 90) return { x: pageWidth - y, y: x };
  if (normalized === 180) return { x: pageWidth - x, y: pageHeight - y };
  if (normalized === 270) return { x: y, y: pageHeight - x };
  return { x, y };
}

function StatusIcon({ status }: { status: PageStatusKind }) {
  if (status === "processing") return <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />;
  if (status === "done") return <Check className="h-4 w-4 text-green-500" />;
  if (status === "skipped") return <Info className="h-4 w-4 text-blue-500" />;
  if (status === "failed") return <AlertTriangle className="h-4 w-4 text-red-500" />;
  return <Clock className="h-4 w-4 text-muted" />;
}

export default function OcrPage() {
  const [step, setStep] = useState<Step>(1);
  const [pdfInfo, setPdfInfo] = useState<PdfInfo | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [primaryLanguage, setPrimaryLanguage] = useState("eng");
  const [secondaryLanguage, setSecondaryLanguage] = useState("");
  const [pageScope, setPageScope] = useState<PageScope>("all");
  const [singlePage, setSinglePage] = useState(1);
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(1);
  const [outputMode, setOutputMode] = useState<OutputMode>("pdf");
  const [enhanceImage, setEnhanceImage] = useState(true);
  const [accuracyMode, setAccuracyMode] = useState<AccuracyMode>("balanced");
  const [pageStatuses, setPageStatuses] = useState<PageStatus[]>([]);
  const [progress, setProgress] = useState(0);
  const [currentPageLabel, setCurrentPageLabel] = useState("Preparing OCR...");
  const [remainingLabel, setRemainingLabel] = useState("Calculating...");
  const [result, setResult] = useState<ResultState | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const schedulerRef = useRef<import("tesseract.js").Scheduler | null>(null);
  const cancelRef = useRef(false);
  const runIdRef = useRef(0);
  const fileInputOpenRef = useRef<(() => void) | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const { addFile, pendingFiles, pendingTool, clearPendingFiles } = useFileHistory();

  const selectedPages = useMemo(() => {
    if (!pdfInfo) return [];
    if (pageScope === "single") return [clamp(singlePage, 1, pdfInfo.pageCount)];
    if (pageScope === "range") {
      const start = clamp(Math.min(rangeStart, rangeEnd), 1, pdfInfo.pageCount);
      const end = clamp(Math.max(rangeStart, rangeEnd), 1, pdfInfo.pageCount);
      return Array.from({ length: end - start + 1 }, (_, index) => start + index);
    }
    return Array.from({ length: pdfInfo.pageCount }, (_, index) => index + 1);
  }, [pageScope, pdfInfo, rangeEnd, rangeStart, singlePage]);

  const canStart = Boolean(pdfInfo && selectedPages.length > 0);
  const resetResultUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const inspectPdf = useCallback(async (file: File) => {
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    if (file.size > TOOL.input.maxSizeBytes) {
      toast.error(`PDF is too large. Maximum size is ${formatBytes(TOOL.input.maxSizeBytes)}.`);
      return;
    }
    setIsInspecting(true);
    let pdf: { getPage: (pageNumber: number) => Promise<{ getTextContent: () => Promise<{ items: unknown[] }>; cleanup?: () => void }>; numPages: number; cleanup?: () => Promise<unknown>; destroy?: () => Promise<unknown> } | null = null;
    let firstPage: { getTextContent: () => Promise<{ items: unknown[] }>; cleanup?: () => void } | null = null;
    try {
      if (!(await hasPdfHeader(file))) {
        toast.error("Please choose a valid PDF file.");
        return;
      }
      const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
      GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (runIdRef.current !== runId) return;
      pdf = await getDocument({ data: bytes.slice(0) }).promise;
      firstPage = await pdf.getPage(1);
      const textContent = await firstPage.getTextContent();
      const hasSelectableText = textContent.items.some((item: unknown) => Boolean((item as { str?: string }).str?.trim()));
      if (runIdRef.current !== runId) return;
      setPdfInfo({ file, pageCount: pdf.numPages, hasSelectableText });
      setRangeStart(1);
      setRangeEnd(pdf.numPages);
      setSinglePage(1);
      setStep(1);
      setResult(null);
      resetResultUrl();
    } catch (error) {
      if (runIdRef.current === runId) {
        const message = error instanceof Error && /password|encrypted/i.test(error.message)
          ? "Encrypted PDFs cannot be OCRed in this browser-only tool."
          : "OCR failed. Please try a different file.";
        toast.error(message);
      }
    } finally {
      firstPage?.cleanup?.();
      await pdf?.cleanup?.();
      await pdf?.destroy?.();
      if (runIdRef.current === runId) setIsInspecting(false);
    }
  }, [resetResultUrl]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) void inspectPdf(file);
  }, [inspectPdf]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: TOOL.input.accept,
    multiple: false,
    maxFiles: 1,
    maxSize: TOOL.input.maxSizeBytes,
    noClick: true,
    noKeyboard: true,
    onDropRejected: () => toast.error("Please choose a valid PDF file."),
  });

  useEffect(() => {
    fileInputOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    if (pendingFiles.length > 0 && (!pendingTool || pendingTool === "ocr")) {
      const [file] = pendingFiles;
      if (file) {
        window.setTimeout(() => {
          void inspectPdf(file);
        }, 0);
      }
      clearPendingFiles();
    }
  }, [clearPendingFiles, inspectPdf, pendingFiles, pendingTool]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 640px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const handleDownload = useCallback(() => {
    if (!result) return;
    resetResultUrl();
    const url = URL.createObjectURL(getDownloadBlob(result));
    objectUrlRef.current = url;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = result.filename;
    anchor.click();
  }, [resetResultUrl, result]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      if (event.key.toLowerCase() === "u") {
        event.preventDefault();
        fileInputOpenRef.current?.();
      }
      if (event.key.toLowerCase() === "d" && result) {
        event.preventDefault();
        handleDownload();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleDownload, result]);

  useEffect(() => {
    return () => {
      runIdRef.current += 1;
      cancelRef.current = true;
      const scheduler = schedulerRef.current as { terminate?: () => Promise<unknown> } | null;
      void scheduler?.terminate?.();
      resetResultUrl();
    };
  }, [resetResultUrl]);

  async function pageHasText(pdfPage: { getTextContent: () => Promise<{ items: unknown[] }> }) {
    const textContent = await pdfPage.getTextContent();
    return textContent.items.some((item: unknown) => Boolean((item as { str?: string }).str?.trim()));
  }

  async function renderPageCanvas(
    pdfPage: {
      getViewport: (options: { scale: number }) => { width: number; height: number };
      render: (options: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<unknown> };
    },
    dpr: number,
  ) {
    const baseViewport = pdfPage.getViewport({ scale: 1 });
    const pixelScale = Math.sqrt(MAX_RENDER_PIXELS / Math.max(1, baseViewport.width * baseViewport.height));
    const sideScale = Math.min(MAX_RENDER_SIDE / Math.max(1, baseViewport.width), MAX_RENDER_SIDE / Math.max(1, baseViewport.height));
    const scale = Math.max(0.5, Math.min(dpr, pixelScale, sideScale));
    const viewport = pdfPage.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas unavailable");
    await pdfPage.render({ canvasContext: context, viewport }).promise;
    return canvas;
  }

  const buildResult = useCallback(async (artifacts: PageArtifact[], partial: boolean, attemptedPages: number, summaries: PageStatus[]) => {
    if (!pdfInfo) throw new Error("Missing PDF");
    const confidenceValues = artifacts.filter((item) => !item.skipped && !item.failed).map((item) => item.confidence);
    const confidence = confidenceValues.length ? Math.round(confidenceValues.reduce((sum, item) => sum + item, 0) / confidenceValues.length) : 0;
    if (outputMode === "text") {
      const text = artifacts
        .filter((item) => !item.failed)
        .sort((a, b) => a.pageNumber - b.pageNumber)
        .map((item) => `Page ${item.pageNumber}\n${item.text.trim()}`)
        .join("\n\n");
      return {
        mode: "text" as const,
        text,
        filename: safeOutputName(pdfInfo.file, "txt"),
        outputSize: new Blob([text]).size,
        confidence,
        processedPages: confidenceValues.length,
        attemptedPages,
        partial,
        pageSummaries: summaries,
      };
    }

    const { PDFDocument, StandardFonts, degrees } = await import("pdf-lib");
    const originalBytes = new Uint8Array(await pdfInfo.file.arrayBuffer());
    const sourcePdf = await PDFDocument.load(originalBytes);
    const outputPdf = await PDFDocument.create();
    const font = await outputPdf.embedFont(StandardFonts.Helvetica);
    const artifactMap = new Map(artifacts.map((item) => [item.pageNumber, item]));

    for (let pageIndex = 0; pageIndex < pdfInfo.pageCount; pageIndex++) {
      if (pageIndex % 2 === 0) await yieldToBrowser();
      const pageNumber = pageIndex + 1;
      const artifact = artifactMap.get(pageNumber);
      
      const [copied] = await outputPdf.copyPages(sourcePdf, [pageIndex]);
      const page = outputPdf.addPage(copied);

      if (!artifact || artifact.skipped || artifact.failed || artifact.words.length === 0) {
        continue;
      }

      const { width: pageWidth, height: pageHeight } = page.getSize();
      const rotation = page.getRotation().angle;
      const visualWidth = rotation === 90 || rotation === 270 ? pageHeight : pageWidth;
      const visualHeight = rotation === 90 || rotation === 270 ? pageWidth : pageHeight;
      
      artifact.words.forEach((word) => {
        const text = word.text.trim();
        if (!text) return;
        const visualX = (word.bbox.x0 / artifact.canvasWidth) * visualWidth;
        const visualY = visualHeight - (word.bbox.y1 / artifact.canvasHeight) * visualHeight;
        const point = mapVisualPointToPdf(visualX, visualY, pageWidth, pageHeight, rotation);
        const size = clamp(((word.bbox.y1 - word.bbox.y0) / artifact.canvasHeight) * visualHeight, 3, 48);
        try {
          page.drawText(text, { x: point.x, y: point.y, size, font, opacity: 0, rotate: degrees(rotation) });
        } catch {
          // Some scripts exceed the built-in PDF font; text-only output still preserves them.
        }
      });
    }

    // Yield to let UI update before the heavy synchronous save
    await yieldToBrowser();
    const bytes = await outputPdf.save();
    return {
      mode: "pdf" as const,
      bytes,
      filename: safeOutputName(pdfInfo.file, "pdf"),
      outputSize: bytes.byteLength,
      confidence,
      processedPages: confidenceValues.length,
      attemptedPages,
      partial,
      pageSummaries: summaries,
    };
  }, [outputMode, pdfInfo]);

  const startOcr = useCallback(async () => {
    if (!pdfInfo || !canStart) return;
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    cancelRef.current = false;
    setStep(3);
    setProgress(0);
    setResult(null);
    resetResultUrl();
    setRemainingLabel("Calculating...");
    setCurrentPageLabel("Starting OCR engine...");
    const initialStatuses: PageStatus[] = selectedPages.map((pageNumber) => ({ pageNumber, status: "waiting" }));
    setPageStatuses(initialStatuses);
    toast.loading("Starting OCR engine...", { id: "ocr" });

    const artifacts: PageArtifact[] = [];
    const durations: number[] = [];
    let succeeded = 0;
    let failed = 0;
    let latestStatuses = initialStatuses;
    let scheduler: import("tesseract.js").Scheduler | null = null;
    let pdf: { getPage: (pageNumber: number) => Promise<unknown>; cleanup?: () => Promise<unknown>; destroy?: () => Promise<unknown> } | null = null;

    const applyStatus = (pageNumber: number, patch: Partial<PageStatus>) => {
      if (runIdRef.current !== runId) return;
      latestStatuses = latestStatuses.map((item) => (item.pageNumber === pageNumber ? { ...item, ...patch } : item));
      setPageStatuses(latestStatuses);
    };

    try {
      const [{ getDocument, GlobalWorkerOptions }, tesseract] = await Promise.all([import("pdfjs-dist"), import("tesseract.js")]);
      const { createScheduler, createWorker, PSM } = tesseract;
      GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      scheduler = createScheduler();
      schedulerRef.current = scheduler;
      const language = secondaryLanguage && secondaryLanguage !== primaryLanguage ? `${primaryLanguage}+${secondaryLanguage}` : primaryLanguage;
      await Promise.all(
        [0, 1].map(async () => {
          const worker = await createWorker(language);
          if (accuracyMode === "precise") await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
          scheduler?.addWorker(worker);
          return worker;
        }),
      );
      if (runIdRef.current !== runId || cancelRef.current) return;

      const bytes = new Uint8Array(await pdfInfo.file.arrayBuffer());
      if (runIdRef.current !== runId || cancelRef.current) return;
      pdf = await getDocument({ data: bytes.slice(0) }).promise;
      const dpr = DPR_BY_MODE[accuracyMode];
      let completed = 0;
      const batchSize = isMobile || accuracyMode === "precise" ? 1 : 2;

      const processPage = async (pageNumber: number) => {
        const started = performance.now();
        let canvas: HTMLCanvasElement | null = null;
        let page: {
          getTextContent: () => Promise<{ items: unknown[] }>;
          getViewport: (options: { scale: number }) => { width: number; height: number };
          render: (options: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<unknown> };
          cleanup?: () => void;
        } | null = null;
        applyStatus(pageNumber, { status: "processing", note: undefined });
        setCurrentPageLabel(`Processing page ${pageNumber} of ${pdfInfo.pageCount}...`);
        try {
          if (runIdRef.current !== runId || cancelRef.current) return;
          page = await pdf?.getPage(pageNumber) as {
            getTextContent: () => Promise<{ items: unknown[] }>;
            getViewport: (options: { scale: number }) => { width: number; height: number };
            render: (options: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<unknown> };
            cleanup?: () => void;
          };
          if (runIdRef.current !== runId || cancelRef.current) return;
          if (await pageHasText(page)) {
            const textContent = await page.getTextContent();
            const text = textContent.items.map((item: unknown) => (item as { str?: string }).str ?? "").join(" ").trim();
            artifacts.push({ pageNumber, canvasWidth: 1, canvasHeight: 1, words: [], text, confidence: 100, skipped: true });
            applyStatus(pageNumber, { status: "skipped", confidence: 100, note: "Already searchable" });
            return;
          }
          canvas = await renderPageCanvas(page, dpr);
          const cWidth = canvas.width;
          const cHeight = canvas.height;
          if (enhanceImage) await preprocessCanvas(canvas);
          if (runIdRef.current !== runId || cancelRef.current) return;
          const ocrResult = await scheduler?.addJob("recognize", canvas);
          if (runIdRef.current !== runId || cancelRef.current) return;
          const data = ocrResult?.data as { text?: string; confidence?: number };
          const confidence = Math.round(data.confidence ?? 0);
          artifacts.push({ pageNumber, canvasWidth: cWidth, canvasHeight: cHeight, words: extractWords(data), text: data.text ?? "", confidence });
          succeeded += 1;
          applyStatus(pageNumber, {
            status: confidence < 50 ? "failed" : "done",
            confidence,
            note: confidence < 50 ? "Low quality - partial result" : `${confidence}% confidence`,
          });
        } catch {
          failed += 1;
          artifacts.push({ pageNumber, canvasWidth: 1, canvasHeight: 1, words: [], text: "", confidence: 0, failed: true });
          applyStatus(pageNumber, { status: "failed", confidence: 0, note: "Low quality - partial result" });
        } finally {
          page?.cleanup?.();
          if (canvas) {
            canvas.width = 0;
            canvas.height = 0;
            canvas.remove();
            canvas = null;
          }
          completed += 1;
          durations.push(performance.now() - started);
          if (runIdRef.current === runId) {
            setProgress(Math.round((completed / selectedPages.length) * 100));
            setRemainingLabel(estimateRemaining(durations, selectedPages.length - completed));
          }
        }
      };

      for (let index = 0; index < selectedPages.length; index += batchSize) {
        if (runIdRef.current !== runId || cancelRef.current) break;
        await Promise.all(selectedPages.slice(index, index + batchSize).map((pageNumber) => processPage(pageNumber)));
        await yieldToBrowser();
      }

      const partial = cancelRef.current || failed > 0;
      if (runIdRef.current !== runId) return;
      if (artifacts.filter((item) => !item.failed).length === 0) throw new Error("No OCR output was produced.");
      setCurrentPageLabel("Finalizing PDF...");
      setRemainingLabel("Almost done");
      await yieldToBrowser();
      const finalResult = await buildResult(artifacts, partial, selectedPages.length, latestStatuses);
      if (runIdRef.current !== runId) return;
      setResult(finalResult);
      setStep(4);
      addFile({ filename: finalResult.filename, size: finalResult.outputSize, timestamp: Date.now(), tool: "ocr" });
      if (partial) toast.warning(`OCR partially complete - ${succeeded} of ${selectedPages.length} pages succeeded.`, { id: "ocr" });
      else toast.success(`OCR complete! ${succeeded} pages processed.`, { id: "ocr" });
    } catch (error) {
      if (runIdRef.current === runId) {
        const message = error instanceof Error && /password|encrypted/i.test(error.message)
          ? "Encrypted PDFs cannot be OCRed in this browser-only tool."
          : "OCR failed. Please try a different file.";
        toast.error(message, { id: "ocr" });
        setStep(2);
      }
    } finally {
      await scheduler?.terminate?.();
      if (schedulerRef.current === scheduler) schedulerRef.current = null;
      await pdf?.cleanup?.();
      await pdf?.destroy?.();
    }
  }, [
    accuracyMode,
    addFile,
    buildResult,
    canStart,
    enhanceImage,
    isMobile,
    pdfInfo,
    primaryLanguage,
    resetResultUrl,
    secondaryLanguage,
    selectedPages,
  ]);

  const cancelProcessing = useCallback(() => {
    cancelRef.current = true;
    setCurrentPageLabel("Cancelling after active pages finish...");
  }, []);

  const confidenceBadge = result?.confidence
    ? result.confidence > 90
      ? { label: "Excellent", className: "bg-green-500/15 text-green-500" }
      : result.confidence >= 70
        ? { label: "Good", className: "bg-amber-500/15 text-amber-500" }
        : { label: "Low - consider a cleaner scan", className: "bg-red-500/15 text-red-500" }
    : { label: "Low - consider a cleaner scan", className: "bg-red-500/15 text-red-500" };

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-7">
          <nav className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
            <Link href="/" className="inline-flex items-center gap-1 hover:text-foreground">
              <Home className="h-3.5 w-3.5" /> Home
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <Link href="/tools" className="hover:text-foreground">Tools</Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="font-medium text-foreground">OCR PDF</span>
          </nav>
          <Link href="/tools" className="mt-3 inline-flex text-sm font-semibold text-muted hover:text-foreground">
            ← Back to all tools
          </Link>
          <div className="mt-6 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg text-white shadow-lg" style={{ backgroundColor: ACCENT }}>
              <Search className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">OCR PDF</h1>
              <p className="text-sm text-muted sm:text-base">Make scanned PDFs searchable in your browser.</p>
            </div>
          </div>
        </div>

        {step === 1 && (
          <section>
            <div
              {...getRootProps()}
              className={`rounded-lg border-2 border-dashed bg-card px-5 py-10 text-center transition sm:py-14 ${
                isDragActive ? "border-[#3B3BFF] bg-[#3B3BFF]/10" : "border-border hover:border-[#3B3BFF]/70"
              }`}
            >
              <input {...getInputProps()} aria-label="Upload PDF for OCR" />
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg text-white" style={{ backgroundColor: ACCENT }}>
                <Upload className="h-7 w-7" />
              </div>
              <p className="mt-4 text-base font-semibold text-foreground">{isDragActive ? "Drop your PDF here" : "Drag & drop a PDF file"}</p>
              <p className="mt-1 text-sm text-muted">PDF only. OCR runs locally on your device.</p>
              <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <button type="button" onClick={open} className="inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90" style={{ backgroundColor: ACCENT }}>
                  <Upload className="h-4 w-4" /> Browse PDF
                </button>
                <ShortcutHint shortcut="U" label="Press" />
              </div>
            </div>

            {isInspecting && <p className="mt-4 text-sm text-muted">Inspecting PDF pages...</p>}
            {pdfInfo && (
              <div className="mt-6 rounded-lg border border-border bg-card p-5">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div>
                    <p className="font-semibold text-foreground">{pdfInfo.file.name}</p>
                    <p className="mt-1 text-sm text-muted">{formatBytes(pdfInfo.file.size)} · {pdfInfo.pageCount} pages · about {pdfInfo.pageCount * 4}s</p>
                  </div>
                  <FileText className="h-8 w-8 text-muted" />
                </div>
                <div className={`mt-5 rounded-lg border p-4 text-sm ${pdfInfo.hasSelectableText ? "border-blue-500/30 bg-blue-500/10 text-blue-500" : "border-green-500/30 bg-green-500/10 text-green-500"}`}>
                  {pdfInfo.hasSelectableText ? "This PDF already contains selectable text. OCR will enhance image-only pages." : "Scanned PDF detected. OCR will make all pages searchable."}
                </div>
                <button type="button" onClick={() => setStep(2)} className="mt-5 inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold text-white" style={{ backgroundColor: ACCENT }}>
                  Configure OCR →
                </button>
              </div>
            )}
          </section>
        )}

        {step === 2 && pdfInfo && (
          <section className="rounded-lg border border-border bg-card p-5 sm:p-6">
            <div className="grid gap-5 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-semibold text-foreground">Primary Language</span>
                <select value={primaryLanguage} onChange={(event) => setPrimaryLanguage(event.target.value)} className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground">
                  {LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.label} ({language.code})</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-foreground">Optional: second language</span>
                <select value={secondaryLanguage} onChange={(event) => setSecondaryLanguage(event.target.value)} className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground">
                  <option value="">None</option>
                  {LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.label} ({language.code})</option>)}
                </select>
              </label>
            </div>

            <div className="mt-6">
              <p className="text-sm font-semibold text-foreground">Page Scope</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {(["all", "single", "range"] as PageScope[]).map((scope) => (
                  <label key={scope} className={`rounded-lg border p-3 text-sm ${pageScope === scope ? "border-[#3B3BFF] bg-[#3B3BFF]/10 text-foreground" : "border-border text-muted"}`}>
                    <input type="radio" className="mr-2" checked={pageScope === scope} onChange={() => setPageScope(scope)} />
                    {scope === "all" ? "All pages" : scope === "single" ? "Single page" : "Page range"}
                  </label>
                ))}
              </div>
              {pageScope === "single" && (
                <input type="number" min={1} max={pdfInfo.pageCount} value={singlePage} onChange={(event) => setSinglePage(clamp(Number(event.target.value), 1, pdfInfo.pageCount))} className="mt-3 w-32 rounded-lg border border-border bg-background px-3 py-2 text-foreground" />
              )}
              {pageScope === "range" && (
                <div className="mt-3 flex gap-3">
                  <input type="number" min={1} max={pdfInfo.pageCount} value={rangeStart} onChange={(event) => setRangeStart(clamp(Number(event.target.value), 1, pdfInfo.pageCount))} className="w-32 rounded-lg border border-border bg-background px-3 py-2 text-foreground" />
                  <input type="number" min={1} max={pdfInfo.pageCount} value={rangeEnd} onChange={(event) => setRangeEnd(clamp(Number(event.target.value), 1, pdfInfo.pageCount))} className="w-32 rounded-lg border border-border bg-background px-3 py-2 text-foreground" />
                </div>
              )}
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                ["pdf", "Searchable PDF", "Copies original pages and adds an invisible OCR text layer. Output may be larger."],
                ["text", "Text Only", "Extract all text into a downloadable .txt file."],
              ].map(([mode, title, description]) => (
                <button key={mode} type="button" onClick={() => setOutputMode(mode as OutputMode)} className={`rounded-lg border p-4 text-left ${outputMode === mode ? "border-[#3B3BFF] bg-[#3B3BFF]/10" : "border-border"}`}>
                  <span className="font-semibold text-foreground">{title}</span>
                  <span className="mt-1 block text-sm text-muted">{description}</span>
                </button>
              ))}
            </div>

            <label className="mt-6 flex items-start gap-3 rounded-lg border border-border bg-background p-4">
              <input type="checkbox" checked={enhanceImage} onChange={(event) => setEnhanceImage(event.target.checked)} className="mt-1" />
              <span>
                <span className="block text-sm font-semibold text-foreground">Enhance image quality before OCR</span>
                <span className="text-sm text-muted">Improves accuracy on low-quality scans. Slightly slower.</span>
              </span>
            </label>

            <div className="mt-6">
              <p className="text-sm font-semibold text-foreground">OCR Accuracy Mode</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {[
                  ["fast", "Fast", "1x DPR canvas"],
                  ["balanced", "Balanced", "2x DPR canvas"],
                  ["precise", "Precise", "Up to 3x DPR canvas, capped on large pages"],
                ].map(([mode, title, description]) => (
                  <button key={mode} type="button" onClick={() => setAccuracyMode(mode as AccuracyMode)} className={`rounded-lg border p-3 text-left ${accuracyMode === mode ? "border-[#3B3BFF] bg-[#3B3BFF]/10" : "border-border"}`}>
                    <span className="block font-semibold text-foreground">{title}</span>
                    <span className="text-sm text-muted">{description}</span>
                  </button>
                ))}
              </div>
            </div>

            {isMobile && pdfInfo.pageCount > 10 && <div className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-500">Processing many pages on mobile may be slow. Consider using Balanced mode.</div>}

            <button type="button" disabled={!canStart} onClick={startOcr} className="mt-6 inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
              Start OCR →
            </button>
          </section>
        )}

        {step === 3 && (
          <section className="rounded-lg border border-border bg-card p-5 sm:p-6">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <p className="text-lg font-semibold text-foreground">{currentPageLabel}</p>
                <p className="mt-1 text-sm text-muted">{remainingLabel}</p>
              </div>
              <button type="button" onClick={cancelProcessing} className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground">
                <X className="h-4 w-4" /> Cancel
              </button>
            </div>
            <div className="mt-5 h-3 overflow-hidden rounded-full bg-background">
              <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: ACCENT }} />
            </div>
            <p className="mt-2 text-right text-sm font-semibold text-foreground">{progress}%</p>
            <div className="mt-5 max-h-80 overflow-y-auto rounded-lg border border-border">
              {pageStatuses.map((item) => (
                <div key={item.pageNumber} className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0">
                  <div className="flex items-center gap-3">
                    <StatusIcon status={item.status} />
                    <span className="font-medium text-foreground">Page {item.pageNumber}</span>
                  </div>
                  <span className="text-sm text-muted">
                    {item.status === "waiting" && "Waiting"}
                    {item.status === "processing" && "Processing"}
                    {item.status === "done" && `${item.confidence ?? 0}% confidence`}
                    {item.status === "skipped" && "Already searchable"}
                    {item.status === "failed" && (item.note ?? "Low quality - partial result")}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {step === 4 && result && pdfInfo && (
          <section className="rounded-lg border border-border bg-card p-5 sm:p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <p className="text-lg font-semibold text-foreground">OCR result ready</p>
                <div className={`mt-2 inline-flex rounded-full px-3 py-1 text-sm font-bold ${confidenceBadge.className}`}>
                  {confidenceBadge.label} · {result.confidence}% confidence
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={handleDownload} className="inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white" style={{ backgroundColor: ACCENT }}>
                  <Download className="h-4 w-4" /> Download {result.mode === "pdf" ? "PDF" : "TXT"}
                </button>
                <ShortcutHint shortcut="D" label="Press" />
              </div>
            </div>

            <div className="mt-5 max-h-60 overflow-y-auto rounded-lg border border-border">
              {result.pageSummaries.map((item) => (
                <div key={item.pageNumber} className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0">
                  <span className="text-sm font-medium text-foreground">Page {item.pageNumber}</span>
                  <span className="text-sm text-muted">{item.status === "skipped" ? "Already searchable" : `${item.confidence ?? 0}% confidence`}</span>
                </div>
              ))}
            </div>

            {result.mode === "text" && <pre className="mt-5 max-h-52 overflow-auto rounded-lg border border-border bg-background p-4 text-sm text-body">{(result.text ?? "").slice(0, 500)}</pre>}

            <SizeComparisonBadge originalSize={pdfInfo.file.size} compressedSize={result.outputSize} />
            <p className="mt-3 text-sm text-muted">
              {result.mode === "pdf" ? "Searchable PDFs copy original pages and add a hidden text layer, so output size may increase." : "Text output contains recognized text only and does not preserve page appearance."}
            </p>

            <button type="button" onClick={() => setStep(2)} className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground">
              <RotateCcw className="h-4 w-4" /> Run OCR again with different settings
            </button>
          </section>
        )}
      </main>
    </AppShell>
  );
}
