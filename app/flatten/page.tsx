"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { AlertTriangle, CheckCircle, ChevronRight, Clock, Loader2, Monitor, Printer, ZoomIn } from "lucide-react";
import { toast } from "sonner";
import AppShell from "../components/AppShell";
import ShortcutHint from "../components/ShortcutHint";
import SizeComparisonBadge from "../components/SizeComparisonBadge";
import { useFileHistory } from "../components/FileHistoryProvider";
import type { FileHistoryItem } from "../components/FileHistoryProvider";

type PdfJs = typeof import("pdfjs-dist");
type PdfDocumentProxy = import("pdfjs-dist").PDFDocumentProxy;
type Step = "upload" | "configure" | "processing" | "result";
type Quality = "screen" | "print" | "high";
type PageScope = "all" | "range";
type PageStatus = "waiting" | "processing" | "done" | "failed";

type StatusEntry = {
  status: PageStatus;
  size?: number;
};

const ACCENT_COLOR = "#FF4D4D";
const QUALITY_OPTIONS: Record<Quality, { label: string; description: string; qualityScale: number; jpegQuality: number }> = {
  screen: {
    label: "Screen",
    description: "Smallest file size. Best for sharing digitally.",
    qualityScale: 1.0,
    jpegQuality: 0.75,
  },
  print: {
    label: "Print",
    description: "Balanced quality and size. Good for most uses.",
    qualityScale: 1.5,
    jpegQuality: 0.88,
  },
  high: {
    label: "High Quality",
    description: "Largest file. Best for professional printing.",
    qualityScale: 2.5,
    jpegQuality: 0.95,
  },
};

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

export default function FlattenPdfPage() {
  const { addFile } = useFileHistory();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [pdfJsDoc, setPdfJsDoc] = useState<PdfDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [hasFormFields, setHasFormFields] = useState(false);
  const [quality, setQuality] = useState<Quality>("print");
  const [colorMode, setColorMode] = useState<"color" | "grayscale">("color");
  const [pageScope, setPageScope] = useState<PageScope>("all");
  const [startPage, setStartPage] = useState(1);
  const [endPage, setEndPage] = useState(1);
  const [currentPage, setCurrentPage] = useState(0);
  const [completedPages, setCompletedPages] = useState(0);
  const [flattenedCount, setFlattenedCount] = useState(0);
  const [statuses, setStatuses] = useState<Record<number, StatusEntry>>({});
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [resultName, setResultName] = useState("");
  const [wasCancelled, setWasCancelled] = useState(false);
  const cancelRef = useRef(false);

  const selectedQuality = QUALITY_OPTIONS[quality];
  const actualStart = pageScope === "all" ? 1 : clamp(startPage, 1, pageCount || 1);
  const actualEnd = pageScope === "all" ? pageCount : clamp(endPage, actualStart, pageCount || actualStart);
  const totalToProcess = Math.max(0, actualEnd - actualStart + 1);
  const progress = totalToProcess > 0 ? (completedPages / totalToProcess) * 100 : 0;
  const estimatedOutput = useMemo(() => {
    const kb = Math.max(1, totalToProcess) * (selectedQuality.qualityScale ** 2 * 50);
    return kb / 1024;
  }, [selectedQuality.qualityScale, totalToProcess]);

  const handleDrop = useCallback(async (files: File[]) => {
    const selectedFile = files[0];
    if (!selectedFile) return;
    try {
      const pdfjs = await loadPdfJs();
      const { PDFDocument } = await import("pdf-lib");
      const arrayBuffer = await selectedFile.arrayBuffer();
      const proxy = await pdfjs.getDocument({ data: arrayBuffer.slice(0) }).promise;
      const pdfDoc = await PDFDocument.load(arrayBuffer.slice(0));
      setFile(selectedFile);
      setPdfJsDoc(proxy);
      setPageCount(proxy.numPages);
      setStartPage(1);
      setEndPage(proxy.numPages);
      setHasFormFields(pdfDoc.getForm().getFields().length > 0);
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

  const goConfigure = useCallback(() => setStep("configure"), []);
  const resetAll = useCallback(() => {
    setStep("upload");
    setFile(null);
    setPdfJsDoc(null);
    setPageCount(0);
    setResultBytes(null);
    setStatuses({});
    setCompletedPages(0);
    setFlattenedCount(0);
    setWasCancelled(false);
  }, []);

  const flattenPdf = useCallback(async () => {
    if (!file || !pdfJsDoc) return;

    setStep("processing");
    toast.info("Flattening PDF...");
    cancelRef.current = false;
    setWasCancelled(false);
    setCompletedPages(0);
    setFlattenedCount(0);
    const initial: Record<number, StatusEntry> = {};
    for (let pageNum = actualStart; pageNum <= actualEnd; pageNum += 1) {
      initial[pageNum] = { status: "waiting" };
    }
    setStatuses(initial);

    try {
      const { PDFDocument } = await import("pdf-lib");
      const originalBuffer = await file.arrayBuffer();
      const originalDoc = await PDFDocument.load(originalBuffer.slice(0));
      const newPdfDoc = await PDFDocument.create();
      let localCompleted = 0;
      let localFlattened = 0;

      for (let pageNum = actualStart; pageNum <= actualEnd; pageNum += 1) {
        if (cancelRef.current) break;
        setCurrentPage(pageNum);
        setStatuses((prev) => ({ ...prev, [pageNum]: { status: "processing" } }));
        try {
          const page = await pdfJsDoc.getPage(pageNum);
          const viewport = page.getViewport({ scale: selectedQuality.qualityScale });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const context = canvas.getContext("2d", { willReadFrequently: colorMode === "grayscale" });
          if (!context) throw new Error("Could not create canvas context.");
          await page.render({ canvasContext: context, viewport }).promise;

          if (colorMode === "grayscale") {
            const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
            const { data } = imageData;
            for (let i = 0; i < data.length; i += 4) {
              const avg = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
              data[i] = avg;
              data[i + 1] = avg;
              data[i + 2] = avg;
            }
            context.putImageData(imageData, 0, 0);
          }

          const dataUrl = canvas.toDataURL("image/jpeg", selectedQuality.jpegQuality);
          const imgBytes = await fetch(dataUrl).then((response) => response.arrayBuffer());
          const jpgImage = await newPdfDoc.embedJpg(imgBytes);
          const newPage = newPdfDoc.addPage([viewport.width * 0.75, viewport.height * 0.75]);
          newPage.drawImage(jpgImage, { x: 0, y: 0, width: newPage.getWidth(), height: newPage.getHeight() });
          canvas.width = 0;
          canvas.height = 0;
          localFlattened += 1;
          setFlattenedCount(localFlattened);
          setStatuses((prev) => ({ ...prev, [pageNum]: { status: "done", size: imgBytes.byteLength } }));
        } catch (error) {
          console.error(error);
          const [copiedPage] = await newPdfDoc.copyPages(originalDoc, [pageNum - 1]);
          newPdfDoc.addPage(copiedPage);
          setStatuses((prev) => ({ ...prev, [pageNum]: { status: "failed" } }));
        }
        localCompleted += 1;
        setCompletedPages(localCompleted);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      const bytes = await newPdfDoc.save();
      setResultBytes(bytes);
      setResultName(`flattened-${file.name}`);
      setStep("result");
      if (cancelRef.current) {
        setWasCancelled(true);
        toast.info("Flattening stopped — partial file ready.");
      } else {
        toast.success("Done! PDF flattened successfully.");
      }
    } catch (error) {
      console.error(error);
      toast.error("Something went wrong.");
      setStep("configure");
    }
  }, [actualEnd, actualStart, colorMode, file, pdfJsDoc, selectedQuality.jpegQuality, selectedQuality.qualityScale]);

  const cancelFlatten = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const downloadResult = useCallback(() => {
    if (!resultBytes || !file) return;
    const buffer = resultBytes.buffer.slice(resultBytes.byteOffset, resultBytes.byteOffset + resultBytes.byteLength) as ArrayBuffer;
    const url = URL.createObjectURL(new Blob([buffer], { type: "application/pdf" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = resultName || `flattened-${file.name}`;
    anchor.click();
    URL.revokeObjectURL(url);
    addFile({
      filename: anchor.download,
      size: resultBytes.byteLength,
      timestamp: Date.now(),
      tool: "Flatten" as unknown as FileHistoryItem["tool"],
    });
  }, [addFile, file, resultBytes, resultName]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      if (event.key.toLowerCase() === "u" && step === "upload") {
        event.preventDefault();
        open();
      }
      if (event.key.toLowerCase() === "d" && step === "result") {
        event.preventDefault();
        downloadResult();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [downloadResult, open, step]);

  return (
    <AppShell>
      <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <Link href="/tools" aria-label="Back to all tools" className="mb-5 inline-flex text-sm font-semibold text-muted hover:text-foreground">
            &larr; Back to all tools
          </Link>
          <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 text-sm text-muted">
            <Link href="/" aria-label="Go to home page" className="hover:text-foreground">Home</Link>
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
            <Link href="/tools" aria-label="Go to tools page" className="hover:text-foreground">Tools</Link>
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
            <span className="font-semibold text-foreground">Flatten PDF</span>
          </nav>
          <section className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-8">
            <div className="mb-8">
              <p className="text-sm font-bold uppercase tracking-[0.18em]" style={{ color: ACCENT_COLOR }}>Static PDF</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Flatten PDF</h1>
              <p className="mt-2 max-w-2xl text-muted">Remove forms, annotations, signatures, layers, and scripts by rebuilding every page as a static image.</p>
            </div>

            {step === "upload" && (
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div {...getRootProps()} aria-label="Upload PDF dropzone" className={`cursor-pointer rounded-lg border-2 border-dashed p-10 text-center transition ${isDragActive ? "border-red-400 bg-red-500/10" : "border-border bg-background hover:border-red-400"}`}>
                  <input {...getInputProps({ "aria-label": "Upload PDF" })} />
                  <p className="text-xl font-bold">{isDragActive ? "Drop your PDF here" : "Drag & drop your PDF here"}</p>
                  <p className="mt-2 text-sm text-muted">PDF only, processed locally.</p>
                  <button type="button" onClick={open} aria-label="Browse for a PDF file" className="mt-6 inline-flex items-center justify-center gap-3 rounded-md bg-red-500 px-5 py-3 text-sm font-bold text-white hover:bg-red-600">
                    Browse PDF <ShortcutHint shortcut="U" />
                  </button>
                </div>
                <aside className="rounded-lg border border-border bg-background p-5">
                  <h2 className="text-lg font-bold">File</h2>
                  {file ? (
                    <div className="mt-4 space-y-3 text-sm">
                      <p className="break-all font-semibold">{file.name}</p>
                      <p className="text-muted">{pageCount} pages</p>
                      <p className="text-muted">{formatBytes(file.size)}</p>
                      <div className={`rounded-md p-3 ${hasFormFields ? "bg-green-500/10 text-green-700 dark:text-green-300" : "bg-muted/10 text-muted"}`}>
                        {hasFormFields ? "Form fields detected — these will be flattened." : "No form fields detected — annotations and layers will still be flattened."}
                      </div>
                      <button type="button" onClick={goConfigure} aria-label="Configure flatten settings" className="w-full rounded-md bg-red-500 px-5 py-3 font-bold text-white hover:bg-red-600">
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
                <div>
                  <h2 className="text-2xl font-bold">Configure Flattening</h2>
                  <p className="mt-1 text-sm text-muted">{file?.name}</p>
                </div>
                <fieldset>
                  <legend className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-muted">Output Quality</legend>
                  <div className="grid gap-4 md:grid-cols-3">
                    {(["screen", "print", "high"] as Quality[]).map((item) => {
                      const Icon = item === "screen" ? Monitor : item === "print" ? Printer : ZoomIn;
                      return (
                        <button key={item} type="button" onClick={() => setQuality(item)} aria-label={`Select ${QUALITY_OPTIONS[item].label} quality`} className={`rounded-lg border-2 p-5 text-left ${quality === item ? "border-red-500 bg-red-500/10" : "border-border bg-background hover:border-red-400"}`}>
                          <Icon aria-hidden="true" className="mb-4 h-7 w-7 text-red-500" />
                          <h3 className="font-bold">{QUALITY_OPTIONS[item].label}{item === "print" && <span className="ml-2 rounded-full bg-red-500 px-2 py-0.5 text-[10px] uppercase text-white">Recommended</span>}</h3>
                          <p className="mt-2 text-sm text-muted">{QUALITY_OPTIONS[item].description}</p>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-muted">Color Mode</legend>
                  <div className="grid gap-3 sm:inline-grid sm:grid-cols-2">
                    <button type="button" onClick={() => setColorMode("color")} aria-label="Use color output" className={`rounded-md px-5 py-3 font-bold ${colorMode === "color" ? "bg-red-500 text-white" : "bg-muted/10 text-muted"}`}>Color</button>
                    <button type="button" onClick={() => setColorMode("grayscale")} aria-label="Use grayscale output" className={`rounded-md px-5 py-3 font-bold ${colorMode === "grayscale" ? "bg-red-500 text-white" : "bg-muted/10 text-muted"}`}>Grayscale</button>
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-muted">Page Scope</legend>
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 text-sm font-semibold"><input type="radio" checked={pageScope === "all"} onChange={() => setPageScope("all")} aria-label="Flatten all pages" className="accent-red-500" />All pages</label>
                    <label className="flex items-center gap-2 text-sm font-semibold"><input type="radio" checked={pageScope === "range"} onChange={() => setPageScope("range")} aria-label="Flatten page range" className="accent-red-500" />Page range</label>
                    {pageScope === "range" && (
                      <div className="flex items-center gap-2">
                        <input type="number" min={1} max={pageCount} value={startPage} onChange={(e) => setStartPage(clamp(Number(e.target.value) || 1, 1, pageCount))} aria-label="Start page" className="w-20 rounded-md border border-border bg-background px-2 py-2 text-center" />
                        <span className="text-muted">to</span>
                        <input type="number" min={startPage} max={pageCount} value={endPage} onChange={(e) => setEndPage(clamp(Number(e.target.value) || pageCount, startPage, pageCount))} aria-label="End page" className="w-20 rounded-md border border-border bg-background px-2 py-2 text-center" />
                      </div>
                    )}
                  </div>
                </fieldset>
                <p className="rounded-lg bg-muted/10 p-4 text-sm font-semibold text-muted">Estimated output: ~{estimatedOutput.toFixed(1)} MB</p>
                <button type="button" onClick={() => void flattenPdf()} aria-label="Flatten PDF" className="w-full rounded-md bg-red-500 px-5 py-4 text-lg font-bold text-white hover:bg-red-600">Flatten PDF &rarr;</button>
              </div>
            )}

            {step === "processing" && (
              <div className="mx-auto max-w-3xl py-4">
                <h2 className="text-center text-xl font-bold">Flattening page {currentPage} of {actualEnd}...</h2>
                <div className="mt-6 h-3 overflow-hidden rounded-full bg-muted/20"><div className="h-full rounded-full bg-red-500 transition-all" style={{ width: `${progress}%` }} /></div>
                <div className="mt-6 max-h-[200px] overflow-y-auto rounded-lg border border-border bg-background p-2">
                  {Object.entries(statuses).map(([page, entry]) => (
                    <div key={page} className="flex items-center justify-between rounded-md px-3 py-2 text-sm">
                      <span className="font-semibold">Page {page}</span>
                      <span className="flex items-center gap-2 text-muted">
                        {entry.status === "waiting" && <><Clock aria-hidden="true" className="h-4 w-4 text-gray-400" />Waiting</>}
                        {entry.status === "processing" && <><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-indigo-500" />Processing</>}
                        {entry.status === "done" && <><span className="text-xs">{formatBytes(entry.size ?? 0)}</span><CheckCircle aria-hidden="true" className="h-4 w-4 text-green-500" />Done</>}
                        {entry.status === "failed" && <><AlertTriangle aria-hidden="true" className="h-4 w-4 text-red-500" />Skipped — original page kept</>}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-6 text-center"><button type="button" onClick={cancelFlatten} aria-label="Cancel flattening" className="text-sm font-bold text-muted hover:text-red-500">Cancel</button></div>
              </div>
            )}

            {step === "result" && file && resultBytes && (
              <div className="mx-auto max-w-2xl py-8 text-center">
                <CheckCircle aria-hidden="true" className="mx-auto mb-5 h-14 w-14 text-red-500" />
                <h2 className="text-2xl font-black">{wasCancelled ? "Partial flattened PDF ready" : "PDF flattened"}</h2>
                <p className="mt-2 text-muted">{flattenedCount} pages flattened · All form fields removed · All annotations removed</p>
                <SizeComparisonBadge originalSize={file.size} compressedSize={resultBytes.byteLength} />
                {resultBytes.byteLength > file.size && <p className="mt-5 rounded-lg bg-amber-500/10 p-3 text-sm font-semibold text-amber-700 dark:text-amber-300">Flattened file is larger than original — this is normal for image-heavy PDFs at high quality settings</p>}
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                  <button type="button" onClick={downloadResult} aria-label="Download flattened PDF" className="inline-flex items-center justify-center gap-3 rounded-md bg-red-500 px-5 py-3 font-bold text-white hover:bg-red-600">Download PDF <ShortcutHint shortcut="D" /></button>
                  <button type="button" onClick={resetAll} aria-label="Flatten another PDF" className="rounded-md border border-border px-5 py-3 font-bold">Flatten another</button>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </AppShell>
  );
}
