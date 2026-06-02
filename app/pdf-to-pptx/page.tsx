"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  Clock,
  Image as ImageIcon,
  Loader2,
  Type,
} from "lucide-react";
import { toast } from "sonner";
import AppShell from "../components/AppShell";
import ShortcutHint from "../components/ShortcutHint";
import SizeComparisonBadge from "../components/SizeComparisonBadge";
import { useFileHistory } from "../components/FileHistoryProvider";
import type { FileHistoryItem } from "../components/FileHistoryProvider";
import type { TextItem as PdfTextItem } from "pdfjs-dist/types/src/display/api";

type PdfJs = typeof import("pdfjs-dist");
type PdfDocumentProxy = import("pdfjs-dist").PDFDocumentProxy;
type PptxConstructor = typeof import("pptxgenjs").default;
type PptxPresentation = InstanceType<PptxConstructor>;

type Step = "upload" | "configure" | "process" | "result";
type Mode = "image" | "text";
type Theme = "light" | "dark" | "branded";
type PageScope = "all" | "custom";
type PageStatus = "waiting" | "processing" | "done" | "failed";

type PageStatusEntry = {
  status: PageStatus;
  size?: number;
};

const ACCENT_COLOR = "#F59E0B";

async function loadPdfJs(): Promise<PdfJs> {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }
  return pdfjs;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function median(values: number[]): number {
  if (values.length === 0) return 12;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 12;
}

function secondsLabel(seconds: number | null): string {
  if (seconds === null) return "Calculating time...";
  if (seconds < 60) return `Estimated time: ~${seconds}s remaining`;
  return `Estimated time: ~${Math.ceil(seconds / 60)}m remaining`;
}

export default function PdfToPptxPage() {
  const { addFile } = useFileHistory();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [pdfProxy, setPdfProxy] = useState<PdfDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [firstPageDims, setFirstPageDims] = useState({ w: 0, h: 0 });
  const [mode, setMode] = useState<Mode>("image");
  const [pageScope, setPageScope] = useState<PageScope>("all");
  const [startPage, setStartPage] = useState(1);
  const [endPage, setEndPage] = useState(1);
  const [theme, setTheme] = useState<Theme>("light");
  const [currentPage, setCurrentPage] = useState(0);
  const [pageStatuses, setPageStatuses] = useState<Record<number, PageStatusEntry>>({});
  const [estimatedSeconds, setEstimatedSeconds] = useState<number | null>(null);
  const [processedCount, setProcessedCount] = useState(0);
  const [createdSlides, setCreatedSlides] = useState(0);
  const [failedPagesCount, setFailedPagesCount] = useState(0);
  const [resultPres, setResultPres] = useState<PptxPresentation | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const cancelRef = useRef(false);
  const pageDurationsRef = useRef<number[]>([]);

  const actualStart = pageScope === "all" ? 1 : clamp(startPage, 1, pageCount || 1);
  const actualEnd = pageScope === "all" ? pageCount : clamp(endPage, actualStart, pageCount || actualStart);
  const totalToProcess = Math.max(0, actualEnd - actualStart + 1);
  const progressPercent = totalToProcess > 0 ? (processedCount / totalToProcess) * 100 : 0;
  const originalSize = file?.size ?? 0;
  const estimatedPptxSize = useMemo(() => {
    const captured = Object.values(pageStatuses).reduce((total, entry) => total + (entry.size ?? 0), 0);
    if (captured > 0) return captured;
    return mode === "image" ? originalSize * 1.5 : originalSize * 0.25;
  }, [mode, originalSize, pageStatuses]);

  const handleDownload = useCallback(async () => {
    if (!resultPres || !file) return;

    const fileName = `converted-${file.name.replace(/\.pdf$/i, "")}.pptx`;
    try {
      await resultPres.writeFile({ fileName });
      addFile({
        filename: fileName,
        size: Math.round(estimatedPptxSize),
        timestamp: Date.now(),
        tool: "PDF to PPTX" as unknown as FileHistoryItem["tool"],
      });
    } catch (error) {
      console.error(error);
      toast.error("Something went wrong.");
    }
  }, [addFile, estimatedPptxSize, file, resultPres]);

  const handleDrop = useCallback(async (acceptedFiles: File[]) => {
    const selectedFile = acceptedFiles[0];
    if (!selectedFile) return;

    try {
      const pdfjs = await loadPdfJs();
      const arrayBuffer = await selectedFile.arrayBuffer();
      const proxy = await pdfjs.getDocument({ data: arrayBuffer.slice(0) }).promise;
      const firstPage = await proxy.getPage(1);
      const viewport = firstPage.getViewport({ scale: 1 });
      setFile(selectedFile);
      setPdfProxy(proxy);
      setPageCount(proxy.numPages);
      setEndPage(proxy.numPages);
      setFirstPageDims({ w: viewport.width, h: viewport.height });
    } catch (error) {
      console.error(error);
      toast.error("Something went wrong.");
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: handleDrop,
    accept: { "application/pdf": [".pdf"] },
    multiple: false,
    noKeyboard: true,
  });

  const startConversion = useCallback(async () => {
    if (!pdfProxy || !file || firstPageDims.h === 0) return;

    setStep("process");
    setCancelled(false);
    cancelRef.current = false;
    pageDurationsRef.current = [];
    setProcessedCount(0);
    setCreatedSlides(0);
    setFailedPagesCount(0);
    setEstimatedSeconds(null);
    setCurrentPage(actualStart);
    const initialStatuses: Record<number, PageStatusEntry> = {};
    for (let i = actualStart; i <= actualEnd; i += 1) {
      initialStatuses[i] = { status: "waiting" };
    }
    setPageStatuses(initialStatuses);
    toast.info("Starting conversion...");

    try {
      const PptxGenJS = (await import("pptxgenjs")).default;
      const pres = new PptxGenJS();
      const aspectRatio = firstPageDims.w / firstPageDims.h;
      const slideW = 10;
      const slideH = slideW / aspectRatio;
      pres.defineLayout({ name: "CUSTOM", width: slideW, height: slideH });
      pres.layout = "CUSTOM";

      let localProcessed = 0;
      let localCreated = 0;
      let localFailed = 0;

      for (let i = actualStart; i <= actualEnd; i++) {
        setCurrentPage(i);
        setPageStatuses((prev) => ({ ...prev, [i]: { status: "processing" } }));
        const pageStartMs = performance.now();
        try {
          const page = await pdfProxy.getPage(i);
          const slide = pres.addSlide();
          if (mode === "image") {
            const viewport = page.getViewport({ scale: 2.0 });
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              throw new Error("Could not create canvas context.");
            }
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: ctx, viewport }).promise;
            const base64 = canvas.toDataURL("image/jpeg", 0.85);
            const estimatedSize = Math.round(base64.length * 0.75);
            slide.addImage({ data: base64, x: 0, y: 0, w: slideW, h: slideH });
            canvas.width = 0;
            canvas.height = 0;
            setPageStatuses((prev) => ({ ...prev, [i]: { status: "done", size: estimatedSize } }));
          } else {
            if (theme === "dark") {
              slide.background = { color: "0F0F0F" };
            } else if (theme === "branded") {
              slide.addShape(pres.ShapeType.rect, {
                x: 0,
                y: 0,
                w: slideW,
                h: 0.5,
                fill: { color: "3B3BFF" },
                line: { color: "3B3BFF" },
              });
            } else {
              slide.background = { color: "FFFFFF" };
            }

            const textContent = await page.getTextContent();
            const viewport = page.getViewport({ scale: 1.0 });
            const textItems = textContent.items.filter((item): item is PdfTextItem => "str" in item);
            const medianFontSize = median(textItems.map((item) => item.height || 0).filter((height) => height > 0));
            let textBytes = 0;

            for (const item of textItems) {
              if (!item.str.trim()) continue;
              textBytes += item.str.length;
              const isHeading = item.height > medianFontSize * 1.4;
              const slideX = (Number(item.transform[4]) / viewport.width) * slideW;
              const slideY = slideH - (Number(item.transform[5]) / viewport.height) * slideH;
              const textColor = theme === "dark" ? "FFFFFF" : "0F0F0F";
              const yOffset = isHeading ? 0.28 : 0.18;
              slide.addText(item.str, {
                x: slideX,
                y: Math.max(0, slideY - yOffset),
                w: Math.max(0.4, (item.width / viewport.width) * slideW + 0.2),
                h: Math.max(0.2, (item.height / viewport.height) * slideH + 0.1),
                fontSize: isHeading ? Math.max(14, item.height * 0.82) : Math.max(8, item.height * 0.72),
                bold: isHeading,
                color: textColor,
                margin: 0,
                breakLine: false,
                fit: "shrink",
              });
            }
            setPageStatuses((prev) => ({ ...prev, [i]: { status: "done", size: Math.max(1024, textBytes * 8) } }));
          }
          localCreated += 1;
          setCreatedSlides(localCreated);
        } catch (error) {
          console.error(`Page ${i} failed`, error);
          localFailed += 1;
          setFailedPagesCount(localFailed);
          setPageStatuses((prev) => ({ ...prev, [i]: { status: "failed" } }));
        }

        localProcessed += 1;
        setProcessedCount(localProcessed);
        const pageMs = performance.now() - pageStartMs;
        pageDurationsRef.current = [...pageDurationsRef.current.slice(-4), pageMs];
        const averageMs =
          pageDurationsRef.current.reduce((total, duration) => total + duration, 0) / pageDurationsRef.current.length;
        const remainingPages = totalToProcess - localProcessed;
        setEstimatedSeconds(Math.max(0, Math.round((averageMs * remainingPages) / 1000)));
        await new Promise((resolve) => setTimeout(resolve, 30));
        if (cancelRef.current) break;
      }

      setResultPres(pres);
      setStep("result");
      if (cancelRef.current) {
        setCancelled(true);
        toast.info("Conversion stopped — partial file ready.");
      } else {
        toast.success(`Done! ${localCreated} slides created.`);
      }
    } catch (error) {
      console.error(error);
      toast.error("Something went wrong.");
      setStep("configure");
    }
  }, [actualEnd, actualStart, file, firstPageDims.h, firstPageDims.w, mode, pdfProxy, theme, totalToProcess]);

  const cancelConversion = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const goToConfigure = useCallback(() => {
    setStep("configure");
  }, []);

  const goToUpload = useCallback(() => {
    setStep("upload");
  }, []);

  const selectImageMode = useCallback(() => {
    setMode("image");
  }, []);

  const selectTextMode = useCallback(() => {
    setMode("text");
  }, []);

  const selectAllPages = useCallback(() => {
    setPageScope("all");
  }, []);

  const selectCustomPages = useCallback(() => {
    setPageScope("custom");
  }, []);

  const handleStartPageChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = clamp(Number(event.target.value) || 1, 1, pageCount || 1);
      setStartPage(next);
      setEndPage((current) => Math.max(current, next));
    },
    [pageCount],
  );

  const handleEndPageChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setEndPage(clamp(Number(event.target.value) || pageCount, startPage, pageCount || startPage));
    },
    [pageCount, startPage],
  );

  useEffect(() => {
    void loadPdfJs();
    return () => {};
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) {
        return;
      }

      if (event.key.toLowerCase() === "u" && step === "upload") {
        event.preventDefault();
        open();
      }

      if (event.key.toLowerCase() === "d" && step === "result") {
        event.preventDefault();
        void handleDownload();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleDownload, open, step]);

  return (
    <AppShell>
      <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <Link
            href="/tools"
            aria-label="Back to all tools"
            className="mb-5 inline-flex text-sm font-semibold text-muted transition hover:text-foreground"
          >
            &larr; Back to all tools
          </Link>

          <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted">
            <Link href="/" aria-label="Go to home page" className="transition hover:text-foreground">
              Home
            </Link>
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
            <Link href="/tools" aria-label="Go to tools page" className="transition hover:text-foreground">
              Tools
            </Link>
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
            <span className="font-semibold text-foreground">PDF to PowerPoint</span>
          </nav>

          <section className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-8">
            <div className="mb-8">
              <p className="text-sm font-bold uppercase tracking-[0.18em]" style={{ color: ACCENT_COLOR }}>
                100% private
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">PDF to PowerPoint</h1>
              <p className="mt-2 max-w-2xl text-muted">
                Convert each PDF page into a slide in your browser. No uploads, no server processing.
              </p>
            </div>

            {step === "upload" && (
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div
                  {...getRootProps()}
                  aria-label="Upload PDF dropzone"
                  className={`cursor-pointer rounded-lg border-2 border-dashed p-10 text-center transition ${
                    isDragActive ? "border-amber-500 bg-amber-500/10" : "border-border bg-background hover:border-amber-500"
                  }`}
                >
                  <input {...getInputProps({ "aria-label": "Upload PDF" })} />
                  <p className="text-xl font-bold">{isDragActive ? "Drop your PDF here" : "Drag & drop your PDF here"}</p>
                  <p className="mt-2 text-sm text-muted">PDF only, processed locally.</p>
                  <button
                    type="button"
                    onClick={open}
                    aria-label="Browse for a PDF file"
                    className="mt-6 inline-flex items-center justify-center gap-3 rounded-md bg-amber-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-amber-600"
                  >
                    Browse PDF
                    <ShortcutHint shortcut="U" />
                  </button>
                </div>
                <aside className="rounded-lg border border-border bg-background p-5">
                  <h2 className="text-lg font-bold">File</h2>
                  {file ? (
                    <div className="mt-4 space-y-3 text-sm">
                      <p className="break-all font-semibold">{file.name}</p>
                      <p className="text-muted">{pageCount} pages</p>
                      <p className="text-muted">{formatBytes(file.size)}</p>
                      {pageCount > 30 && (
                        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-amber-700 dark:text-amber-300">
                          <p className="text-sm font-semibold">Large PDF — processing may take 1–2 minutes. Keep this tab open.</p>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={goToConfigure}
                        aria-label="Configure PDF to PowerPoint conversion"
                        className="mt-3 w-full rounded-md bg-amber-500 px-5 py-3 font-bold text-white transition hover:bg-amber-600"
                      >
                        Configure &rarr;
                      </button>
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-muted">Choose a PDF to begin.</p>
                  )}
                </aside>
              </div>
            )}

            {step === "configure" && (
              <div className="space-y-7">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-2xl font-bold">Configure Conversion</h2>
                    {file && (
                      <p className="mt-1 text-sm text-muted">
                        {file.name} · {pageCount} pages · {formatBytes(file.size)}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={goToUpload}
                    aria-label="Choose a different PDF"
                    className="text-left text-sm font-bold text-muted hover:text-foreground"
                  >
                    Change PDF
                  </button>
                </div>

                {pageCount > 30 && (
                  <div className="flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-amber-700 dark:text-amber-300">
                    <AlertTriangle aria-hidden="true" className="h-5 w-5 shrink-0" />
                    <p className="text-sm font-semibold">Large PDF — processing may take 1–2 minutes. Keep this tab open.</p>
                  </div>
                )}

                <div>
                  <h3 className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-muted">Conversion Mode</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <button
                      type="button"
                      onClick={selectImageMode}
                      aria-label="Select High Fidelity mode"
                      className={`rounded-lg border-2 p-5 text-left transition ${
                        mode === "image" ? "border-amber-500 bg-amber-500/10" : "border-border bg-background hover:border-amber-500/60"
                      }`}
                    >
                      <ImageIcon aria-hidden="true" className="mb-4 h-8 w-8 text-amber-500" />
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-lg font-bold">High Fidelity</h4>
                        <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-black uppercase text-white">
                          Recommended
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-muted">Each page becomes a slide image. Perfect visual match. Text is not editable.</p>
                    </button>
                    <button
                      type="button"
                      onClick={selectTextMode}
                      aria-label="Select Editable Text mode"
                      className={`rounded-lg border-2 p-5 text-left transition ${
                        mode === "text" ? "border-amber-500 bg-amber-500/10" : "border-border bg-background hover:border-amber-500/60"
                      }`}
                    >
                      <Type aria-hidden="true" className="mb-4 h-8 w-8 text-amber-500" />
                      <h4 className="text-lg font-bold">Editable Text</h4>
                      <p className="mt-2 text-sm text-muted">
                        Extracts text as editable boxes. Best for simple text documents. Layout is approximate.
                      </p>
                    </button>
                  </div>
                </div>

                <div className="hidden space-y-7 md:block">
                  <fieldset>
                    <legend className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-muted">Page Scope</legend>
                    <div className="flex flex-wrap items-center gap-4">
                      <label className="flex items-center gap-2 text-sm font-semibold">
                        <input
                          type="radio"
                          checked={pageScope === "all"}
                          onChange={selectAllPages}
                          aria-label="Convert all pages"
                          className="accent-amber-500"
                        />
                        All pages
                      </label>
                      <label className="flex items-center gap-2 text-sm font-semibold">
                        <input
                          type="radio"
                          checked={pageScope === "custom"}
                          onChange={selectCustomPages}
                          aria-label="Convert a page range"
                          className="accent-amber-500"
                        />
                        Page range
                      </label>
                      {pageScope === "custom" && (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            max={pageCount}
                            value={startPage}
                            onChange={handleStartPageChange}
                            aria-label="Start page"
                            className="w-20 rounded-md border border-border bg-background px-2 py-2 text-center"
                          />
                          <span className="text-muted">to</span>
                          <input
                            type="number"
                            min={startPage}
                            max={pageCount}
                            value={endPage}
                            onChange={handleEndPageChange}
                            aria-label="End page"
                            className="w-20 rounded-md border border-border bg-background px-2 py-2 text-center"
                          />
                        </div>
                      )}
                    </div>
                  </fieldset>

                  {mode === "text" && (
                    <fieldset>
                      <legend className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-muted">Slide Theme</legend>
                      <div className="grid gap-3 sm:grid-cols-3">
                        {(["light", "dark", "branded"] as Theme[]).map((item) => (
                          <label key={item} className="rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold capitalize">
                            <input
                              type="radio"
                              checked={theme === item}
                              onChange={() => setTheme(item)}
                              aria-label={`Use ${item} slide theme`}
                              className="mr-2 accent-amber-500"
                            />
                            {item}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => void startConversion()}
                  aria-label="Convert PDF to PowerPoint"
                  className="w-full rounded-md bg-amber-500 px-5 py-4 text-lg font-bold text-white transition hover:bg-amber-600"
                >
                  Convert &rarr;
                </button>
              </div>
            )}

            {step === "process" && (
              <div className="mx-auto max-w-3xl py-4">
                <div className="text-center">
                  <h2 className="text-xl font-bold">
                    Converting page {currentPage} of {actualEnd}...
                  </h2>
                  <p className="mt-2 text-sm text-muted">{secondsLabel(estimatedSeconds)}</p>
                </div>

                <div className="mt-8 h-3 overflow-hidden rounded-full bg-muted/20">
                  <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${progressPercent}%` }} />
                </div>

                <div className="mt-8 max-h-60 overflow-y-auto rounded-lg border border-border bg-background p-2">
                  {Object.entries(pageStatuses).map(([page, entry]) => (
                    <div key={page} className="flex items-center justify-between rounded-md px-3 py-2 text-sm">
                      <span className="font-semibold">Page {page}</span>
                      <span className="flex items-center gap-2 text-muted">
                        {entry.status === "waiting" && (
                          <>
                            <Clock aria-hidden="true" className="h-4 w-4 text-gray-400" />
                            Waiting
                          </>
                        )}
                        {entry.status === "processing" && (
                          <>
                            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-indigo-500" />
                            Processing
                          </>
                        )}
                        {entry.status === "done" && (
                          <>
                            <span className="text-xs">{formatBytes(entry.size ?? 0)}</span>
                            <CheckCircle aria-hidden="true" className="h-4 w-4 text-green-500" />
                            Done
                          </>
                        )}
                        {entry.status === "failed" && (
                          <>
                            <AlertTriangle aria-hidden="true" className="h-4 w-4 text-red-500" />
                            Skipped
                          </>
                        )}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-8 text-center">
                  <button
                    type="button"
                    onClick={cancelConversion}
                    aria-label="Cancel conversion and prepare partial download"
                    className="text-sm font-bold text-muted transition hover:text-red-500"
                  >
                    Cancel conversion
                  </button>
                </div>
              </div>
            )}

            {step === "result" && (
              <div className="mx-auto max-w-2xl py-8 text-center">
                <CheckCircle aria-hidden="true" className="mx-auto mb-5 h-14 w-14 text-amber-500" />
                <div className="mx-auto mb-5 inline-flex rounded-full bg-amber-500/10 px-4 py-2 text-sm font-bold text-amber-600 dark:text-amber-300">
                  {createdSlides} slides created
                </div>
                <h2 className="text-2xl font-black">{cancelled ? "Partial PowerPoint ready" : "PowerPoint ready"}</h2>
                {failedPagesCount > 0 && (
                  <div className="mt-5 inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-700 dark:text-amber-300">
                    <AlertTriangle aria-hidden="true" className="h-4 w-4" />
                    {failedPagesCount} slides may have limited content
                  </div>
                )}
                <SizeComparisonBadge originalSize={originalSize} compressedSize={Math.round(estimatedPptxSize)} />
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                  <button
                    type="button"
                    onClick={() => void handleDownload()}
                    aria-label="Download converted PowerPoint"
                    className="inline-flex items-center justify-center gap-3 rounded-md bg-amber-500 px-5 py-3 font-bold text-white transition hover:bg-amber-600"
                  >
                    Download PowerPoint
                    <ShortcutHint shortcut="D" />
                  </button>
                  <button
                    type="button"
                    onClick={goToConfigure}
                    aria-label="Convert again with different settings"
                    className="rounded-md border border-border px-5 py-3 font-bold"
                  >
                    Convert again with different settings
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </AppShell>
  );
}
