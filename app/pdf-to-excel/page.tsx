"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import Link from "next/link";
import { ChevronRight, Table, Upload, Download, Info, Home } from "lucide-react";
import AppShell from "../components/AppShell";
import ShortcutHint from "../components/ShortcutHint";
import SizeComparisonBadge from "../components/SizeComparisonBadge";
import { useFileHistory } from "../components/FileHistoryProvider";
import type { PDFDocumentProxy, TextItem as PdfTextItem } from "pdfjs-dist/types/src/display/api";

const ACCENT = "#10B981";
const MAX_PDF_BYTES = 50 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type ExtractionScope = "all" | "single" | "range";
type Step = "upload" | "configure" | "result";
type PageRows = { pageNumber: number; rows: string[][] };
type ExcelWorkerMessage =
  | { type: "DONE"; jobId: number; result: ArrayBuffer }
  | { type: "ERROR"; jobId: number; error?: string };

function isValidTextItem(item: unknown): item is PdfTextItem {
  const candidate = item as Partial<PdfTextItem>;
  return (
    typeof candidate.str === "string" &&
    Array.isArray(candidate.transform) &&
    candidate.transform.length >= 6 &&
    candidate.transform.every((value) => typeof value === "number" && Number.isFinite(value))
  );
}

function rowsFromTextItems(items: unknown[]): string[][] {
  const rowMap = new Map<number, Array<{ text: string; x: number }>>();
  for (const item of items) {
    if (!isValidTextItem(item)) continue;
    const text = item.str.trim();
    if (!text) continue;
    const rawY = Math.round(item.transform[5]);
    let matchedY = rawY;
    for (const existingY of rowMap.keys()) {
      if (Math.abs(existingY - rawY) <= 5) {
        matchedY = existingY;
        break;
      }
    }
    const row = rowMap.get(matchedY) ?? [];
    row.push({ text, x: item.transform[4] });
    rowMap.set(matchedY, row);
  }

  return Array.from(rowMap.keys())
    .sort((a, b) => b - a)
    .map((y) => (rowMap.get(y) ?? []).sort((a, b) => a.x - b.x).map((cell) => cell.text))
    .filter((row) => row.length > 0);
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}

export default function PdfToExcelPage() {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  const [scope, setScope] = useState<ExtractionScope>("all");
  const [singlePage, setSinglePage] = useState<number>(1);
  const [rangeStart, setRangeStart] = useState<number>(1);
  const [rangeEnd, setRangeEnd] = useState<number>(1);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{ bytes: Uint8Array; name: string } | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const runIdRef = useRef(0);
  const workerRef = useRef<Worker | null>(null);
  const pdfProxyRef = useRef<PDFDocumentProxy | null>(null);
  const cancelRef = useRef(false);
  const { addFile } = useFileHistory();

  const cleanupWorker = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  const cleanupPdfProxy = useCallback(() => {
    const proxy = pdfProxyRef.current;
    pdfProxyRef.current = null;
    void proxy?.cleanup?.();
    void proxy?.destroy?.();
  }, []);

  const handleFile = useCallback(async (f: File) => {
    if (!f.name.toLowerCase().endsWith(".pdf") && f.type !== "application/pdf") {
      toast.error("Please select a valid PDF file.");
      return;
    }
    if (f.size > MAX_PDF_BYTES) {
      toast.error("PDF is too large. Maximum size is 50MB.");
      return;
    }
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    cleanupWorker();
    cleanupPdfProxy();
    let doc: PDFDocumentProxy | null = null;
    try {
      const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
      GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const ab = await f.arrayBuffer();
      doc = await getDocument({ data: ab }).promise;
      if (doc.numPages < 1) throw new Error("Could not read any pages from this PDF.");
      if (runIdRef.current !== runId) {
        return;
      }
      setFile(f);
      setResult(null);
      setPageCount(doc.numPages);
      setRangeEnd(doc.numPages);
      setSinglePage(1);
      setRangeStart(1);
      setStep("configure");
      addFile({ filename: f.name, size: f.size, timestamp: Date.now(), tool: "pdfToExcel" });
      toast.success(`"${f.name}" loaded`);
    } catch (error) {
      if (runIdRef.current !== runId) return;
      setFile(null);
      setPageCount(0);
      setStep("upload");
      toast.error(error instanceof Error ? error.message : "Could not inspect this PDF.");
    } finally {
      await doc?.cleanup?.();
      await doc?.destroy?.();
    }
  }, [addFile, cleanupPdfProxy, cleanupWorker]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles[0]) handleFile(acceptedFiles[0]);
  }, [handleFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    multiple: false,
    maxFiles: 1,
    maxSize: MAX_PDF_BYTES,
    onDropRejected: () => toast.error("Please select a valid PDF file under 50MB."),
  });

  const handleExtract = useCallback(async () => {
    if (!file) return;
    if (pageCount < 1) {
      toast.error("Could not determine a valid page count. Choose the PDF again.", { id: "pdf2excel" });
      return;
    }
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    cancelRef.current = false;
    setProcessing(true);
    setResult(null);
    cleanupWorker();
    cleanupPdfProxy();

    try {
      toast.loading("Analyzing PDF structure...", { id: "pdf2excel" });

      const ab = await file.arrayBuffer();
      const totalPages = pageCount;

      // Determine which pages to extract
      let pagesToExtract: number[] = [];
      if (scope === "all") {
        pagesToExtract = Array.from({ length: totalPages }, (_, i) => i + 1);
      } else if (scope === "single") {
        const p = Math.max(1, Math.min(singlePage, totalPages));
        pagesToExtract = [p];
      } else {
        const start = Math.max(1, Math.min(rangeStart, totalPages));
        const end = Math.max(start, Math.min(rangeEnd, totalPages));
        pagesToExtract = Array.from({ length: end - start + 1 }, (_, i) => i + start);
      }
      if (pagesToExtract.length === 0) throw new Error("No pages selected for extraction.");

      const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
      GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const pdfDoc = await getDocument({ data: ab }).promise;
      pdfProxyRef.current = pdfDoc;
      if (pdfDoc.numPages < 1) throw new Error("Could not read any pages from this PDF.");

      const extractedPages: PageRows[] = [];
      for (const pageNumber of pagesToExtract) {
        if (runIdRef.current !== runId || cancelRef.current) throw new DOMException("Extraction cancelled.", "AbortError");
        const page = await pdfDoc.getPage(pageNumber);
        try {
          const textContent = await page.getTextContent();
          const rows = rowsFromTextItems(textContent.items);
          if (rows.length > 0) extractedPages.push({ pageNumber, rows });
        } finally {
          page.cleanup?.();
        }
        await yieldToBrowser();
      }
      if (extractedPages.length === 0) throw new Error("No extractable text rows were found in the selected pages.");

      const worker = new Worker(new URL("../lib/pdfToExcel.worker.ts", import.meta.url), { type: "module" });
      workerRef.current = worker;
      worker.onmessage = (e: MessageEvent<ExcelWorkerMessage>) => {
        if (e.data.jobId !== runIdRef.current) return;
        if (e.data.type === "DONE") {
          const xlsxBytes = new Uint8Array(e.data.result);
          const baseName = file.name.replace(/\.pdf$/i, "");
          setResult({ bytes: xlsxBytes, name: `extracted-${baseName}.xlsx` });
          setStep("result");
          toast.success("Done! Your Excel file is ready.", { id: "pdf2excel" });
          setProcessing(false);
          cleanupWorker();
          cleanupPdfProxy();
        } else {
          toast.error(e.data.error || "Extraction failed.", { id: "pdf2excel" });
          setProcessing(false);
          cleanupWorker();
          cleanupPdfProxy();
        }
      };
      worker.onerror = (err) => {
        if (runIdRef.current !== runId) return;
        toast.error("Worker error: " + err.message, { id: "pdf2excel" });
        setProcessing(false);
        cleanupWorker();
        cleanupPdfProxy();
      };
      worker.postMessage({
        type: "BUILD",
        jobId: runId,
        pages: extractedPages,
      });
    } catch (err) {
      if (runIdRef.current !== runId) return;
      const msg = err instanceof Error ? err.message : "Extraction failed.";
      if (err instanceof DOMException && err.name === "AbortError") toast.info("Extraction cancelled.", { id: "pdf2excel" });
      else toast.error(msg, { id: "pdf2excel" });
      setProcessing(false);
      cleanupWorker();
      cleanupPdfProxy();
    }
  }, [cleanupPdfProxy, cleanupWorker, file, pageCount, rangeEnd, rangeStart, scope, singlePage]);

  const handleDownload = useCallback(() => {
    if (!result) return;
    const buffer = result.bytes.buffer.slice(result.bytes.byteOffset, result.bytes.byteOffset + result.bytes.byteLength) as ArrayBuffer;
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.name;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    toast.success("Download started!");
  }, [result]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "u" || e.key === "U") uploadRef.current?.click();
      if ((e.key === "d" || e.key === "D") && result) handleDownload();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleDownload, result]);

  const reset = useCallback(() => {
    runIdRef.current += 1;
    cancelRef.current = true;
    cleanupWorker();
    cleanupPdfProxy();
    setFile(null);
    setResult(null);
    setPageCount(0);
    setScope("all");
    setProcessing(false);
    setStep("upload");
  }, [cleanupPdfProxy, cleanupWorker]);

  const cancelProcessing = useCallback(() => {
    runIdRef.current += 1;
    cancelRef.current = true;
    cleanupWorker();
    cleanupPdfProxy();
    setProcessing(false);
    toast.info("Extraction cancelled.", { id: "pdf2excel" });
  }, [cleanupPdfProxy, cleanupWorker]);

  useEffect(() => {
    return () => {
      runIdRef.current += 1;
      cancelRef.current = true;
      cleanupWorker();
      cleanupPdfProxy();
    };
  }, [cleanupPdfProxy, cleanupWorker]);

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {/* Breadcrumb */}
        <nav className="mb-2 flex items-center gap-1.5 text-xs text-muted" aria-label="Breadcrumb">
          <Link href="/" className="flex items-center gap-1 hover:text-foreground transition-colors">
            <Home className="h-3 w-3" /> Home
          </Link>
          <ChevronRight className="h-3 w-3" />
          <Link href="/tools" className="hover:text-foreground transition-colors">Tools</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground">PDF to Excel</span>
        </nav>

        <Link href="/tools" className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors">
          ← Back to all tools
        </Link>

        {/* Header */}
        <div className="mb-8 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ background: "#0F2A1A", color: ACCENT }}>
            <Table className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">PDF to Excel</h1>
            <p className="mt-1 text-sm text-muted">Extract raw text from PDF into spreadsheet rows. Not a true table reconstruction.</p>
          </div>
        </div>

        {/* Step 1 — Upload */}
        {step === "upload" && (
          <div
            {...getRootProps()}
            className={`group relative flex flex-col items-center justify-center gap-5 rounded-3xl border-2 border-dashed p-12 text-center transition-all cursor-pointer ${
              isDragActive
                ? "border-emerald-500 bg-emerald-500/10 scale-[1.01]"
                : "border-border bg-card hover:border-emerald-500/50 hover:bg-emerald-500/5"
            }`}
            style={{ minHeight: 320 }}
          >
            <input {...getInputProps()} ref={uploadRef} />
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl transition-transform group-hover:scale-110"
              style={{ background: "#0F2A1A", color: ACCENT }}>
              <Upload className="h-9 w-9" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">
                {isDragActive ? "Drop your PDF here" : "Drag & drop your PDF"}
              </p>
              <p className="mt-1.5 text-sm text-muted">or click to browse — PDF files only</p>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-background px-5 py-2.5">
              <Upload className="h-4 w-4" style={{ color: ACCENT }} />
              <span className="text-sm font-semibold text-foreground">Choose PDF</span>
              <ShortcutHint shortcut="U" />
            </div>
            <p className="text-xs text-muted">100% private · files never leave your device</p>
          </div>
        )}

        {/* Step 2 — Configure */}
        {step === "configure" && file && (
          <div className="space-y-5">
            <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ background: "#0F2A1A", color: ACCENT }}>
                <Table className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-foreground">{file.name}</p>
                <p className="text-sm text-muted">
                  {formatBytes(file.size)}{pageCount > 0 ? ` · ${pageCount} page${pageCount !== 1 ? "s" : ""}` : ""}
                </p>
              </div>
              <button onClick={reset} className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground transition-colors border border-border">
                Change
              </button>
            </div>

            <div className="flex items-start gap-3 rounded-xl border p-4" style={{ borderColor: `${ACCENT}30`, background: `${ACCENT}08` }}>
              <Info className="h-4 w-4 mt-0.5 shrink-0" style={{ color: ACCENT }} />
              <p className="text-sm text-muted">
                <strong>Limited Extraction:</strong> This tool groups text by vertical position to create rows. It does not perform true table reconstruction and cannot accurately handle merged cells or complex layouts.
              </p>
            </div>

            {/* Scope options */}
            <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
              <p className="text-sm font-semibold text-foreground">Extraction Scope</p>
              <div className="flex flex-wrap gap-3">
                {(["all", "single", "range"] as ExtractionScope[]).map(s => (
                  <button
                    key={s}
                    onClick={() => setScope(s)}
                    className={`rounded-xl px-4 py-2 text-sm font-medium transition-all border ${
                      scope === s
                        ? "border-transparent text-white"
                        : "border-border text-muted hover:text-foreground"
                    }`}
                    style={scope === s ? { background: ACCENT } : {}}
                  >
                    {s === "all" ? "All Pages" : s === "single" ? "Single Page" : "Page Range"}
                  </button>
                ))}
              </div>

              {scope === "single" && (
                <label className="flex items-center gap-3">
                  <span className="text-sm text-muted">Page number:</span>
                  <input
                    type="number"
                    min={1}
                    max={pageCount || 999}
                    value={singlePage}
                    onChange={e => setSinglePage(Number(e.target.value))}
                    className="w-20 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                  />
                </label>
              )}

              {scope === "range" && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted">From</span>
                  <input
                    type="number"
                    min={1}
                    max={pageCount || 999}
                    value={rangeStart}
                    onChange={e => setRangeStart(Number(e.target.value))}
                    className="w-20 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                  />
                  <span className="text-sm text-muted">to</span>
                  <input
                    type="number"
                    min={rangeStart}
                    max={pageCount || 999}
                    value={rangeEnd}
                    onChange={e => setRangeEnd(Number(e.target.value))}
                    className="w-20 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                  />
                </div>
              )}
            </div>

            <button
              onClick={handleExtract}
              disabled={processing}
              className="flex w-full items-center justify-center gap-2.5 rounded-2xl py-4 text-base font-bold text-white shadow-lg transition-all hover:opacity-90 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              style={{ background: ACCENT }}
            >
              {processing ? (
                <>
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Extracting…
                </>
              ) : (
                <>
                  <Table className="h-5 w-5" />
                  Extract to Excel
                </>
              )}
            </button>
            {processing && (
              <button
                type="button"
                onClick={cancelProcessing}
                className="w-full rounded-2xl border border-border bg-card py-3 text-sm font-semibold text-foreground transition hover:bg-background"
              >
                Cancel
              </button>
            )}
          </div>
        )}

        {/* Step 3 — Result */}
        {step === "result" && result && file && (
          <div className="space-y-5">
            <div className="flex items-center gap-4 rounded-2xl border p-5" style={{ borderColor: `${ACCENT}30`, background: `${ACCENT}08` }}>
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ background: `${ACCENT}20`, color: ACCENT }}>
                <Table className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground">Your Excel file is ready!</p>
                <p className="mt-0.5 text-sm text-muted truncate">{result.name}</p>
              </div>
            </div>

            <SizeComparisonBadge originalSize={file.size} compressedSize={result.bytes.length} />

            <button
              id="download-btn"
              onClick={handleDownload}
              className="flex w-full items-center justify-center gap-2.5 rounded-2xl py-4 text-base font-bold text-white shadow-lg transition-all hover:opacity-90 hover:-translate-y-0.5"
              style={{ background: ACCENT }}
            >
              <Download className="h-5 w-5" />
              Download .xlsx
              <ShortcutHint shortcut="D" />
            </button>

            <button
              onClick={reset}
              className="w-full rounded-2xl border border-border bg-card py-3 text-sm font-semibold text-foreground transition hover:bg-background"
            >
              Extract another PDF
            </button>
          </div>
        )}
      </main>
    </AppShell>
  );
}
