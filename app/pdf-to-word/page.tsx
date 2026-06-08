"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import Link from "next/link";
import { ChevronRight, FileText, Upload, Download, Home, AlertTriangle } from "lucide-react";
import AppShell from "../components/AppShell";
import ShortcutHint from "../components/ShortcutHint";
import SizeComparisonBadge from "../components/SizeComparisonBadge";
import { useFileHistory } from "../components/FileHistoryProvider";
import { usePdfPipelineWorker } from "../hooks/usePdfPipelineWorker";

const ACCENT = "#3B82F6";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type Step = "upload" | "configure" | "result";
type PipelineOperation = "idle" | "analyze" | "convert";

export default function PdfToWordPage() {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  const [result, setResult] = useState<{ bytes: Uint8Array; name: string } | null>(null);
  const [activeOperation, setActiveOperation] = useState<PipelineOperation>("idle");
  const uploadRef = useRef<HTMLInputElement>(null);
  const { addFile } = useFileHistory();
  const createWordWorker = useCallback(
    () => new Worker(new URL("../lib/pdfToWord.worker.ts", import.meta.url), { type: "module" }),
    [],
  );
  const {
    status: pipelineStatus,
    progress: pipelineProgress,
    memoryWarning,
    result: pipelineResult,
    error: pipelineError,
    process: startPipeline,
    cancel,
    reset: resetPipeline,
  } = usePdfPipelineWorker(createWordWorker);

  const processing = activeOperation === "convert" && pipelineStatus === "processing";
  const analyzing = activeOperation === "analyze" && pipelineStatus === "processing";

  const handleFile = useCallback(async (f: File) => {
    if (!f.name.toLowerCase().endsWith(".pdf") && f.type !== "application/pdf") {
      toast.error("Please select a valid PDF file.");
      return;
    }
    resetPipeline();
    setActiveOperation("analyze");
    setFile(f);
    setResult(null);
    setPageCount(0);
    setStep("configure");
    void startPipeline(f, {
      tool: "pdf-to-word",
      operation: "analyze",
    });
    addFile({ filename: f.name, size: f.size, timestamp: Date.now(), tool: "pdfToWord" });
    toast.success(`"${f.name}" loaded`);
  }, [addFile, resetPipeline, startPipeline]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles[0]) handleFile(acceptedFiles[0]);
  }, [handleFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    multiple: false,
    maxFiles: 1,
    noClick: false,
    onDropRejected: () => toast.error("Please select a valid PDF file."),
  });

  const handleConvert = useCallback(async () => {
    if (!file) return;
    setActiveOperation("convert");
    setResult(null);
    toast.loading("Extracting text from PDF...", { id: "pdf2word" });
    await startPipeline(file, {
      tool: "pdf-to-word",
      operation: "convert",
    });
  }, [file, startPipeline]);

  useEffect(() => {
    if (pipelineStatus === "done" && activeOperation === "analyze" && pipelineResult.output?.kind === "pdf-to-word-analysis") {
      const { pageCount: analyzedPageCount } = pipelineResult.output;
      queueMicrotask(() => {
        setPageCount(analyzedPageCount);
        setActiveOperation("idle");
        resetPipeline();
      });
      return;
    }

    if (pipelineStatus === "done" && activeOperation === "convert" && pipelineResult.output?.kind === "file") {
      const { bytes, filename } = pipelineResult.output;
      queueMicrotask(() => {
        setResult({ bytes, name: filename });
        setStep("result");
        setActiveOperation("idle");
        toast.success("Done! Your Word file is ready.", { id: "pdf2word" });
      });
      return;
    }

    if (pipelineStatus === "error" && activeOperation !== "idle" && pipelineError) {
      const operation = activeOperation;
      queueMicrotask(() => {
        toast.error(pipelineError.message, { id: operation === "convert" ? "pdf2word" : undefined });
        if (operation === "analyze") {
          setFile(null);
          setStep("upload");
        }
        setActiveOperation("idle");
        resetPipeline();
      });
      return;
    }

    if (pipelineStatus === "cancelled" && activeOperation !== "idle") {
      queueMicrotask(() => {
        toast.info("Conversion cancelled.", { id: "pdf2word" });
        setActiveOperation("idle");
        resetPipeline();
      });
    }
  }, [activeOperation, pipelineError, pipelineResult.output, pipelineStatus, resetPipeline]);

  const handleDownload = useCallback(() => {
    if (!result) return;
    const buffer = result.bytes.buffer.slice(result.bytes.byteOffset, result.bytes.byteOffset + result.bytes.byteLength) as ArrayBuffer;
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.name;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Download started!");
  }, [result]);

  // Keyboard shortcuts
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
    resetPipeline();
    setActiveOperation("idle");
    setFile(null);
    setResult(null);
    setPageCount(0);
    setStep("upload");
  }, [resetPipeline]);

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
          <span className="text-foreground">PDF to Word</span>
        </nav>

        <Link href="/tools" className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors">
          ← Back to all tools
        </Link>

        {/* Header */}
        <div className="mb-8 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ background: "#0F1A2A", color: ACCENT }}>
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">PDF to Word (Text Extraction)</h1>
            <p className="mt-1 text-sm text-muted">Extract basic text into a .docx file. Best for simple text documents.</p>
          </div>
        </div>

        {/* Step 1 — Upload */}
        {step === "upload" && (
          <div
            {...getRootProps()}
            className={`group relative flex flex-col items-center justify-center gap-5 rounded-3xl border-2 border-dashed p-12 text-center transition-all cursor-pointer ${
              isDragActive
                ? "border-blue-500 bg-blue-500/10 scale-[1.01]"
                : "border-border bg-card hover:border-blue-500/50 hover:bg-blue-500/5"
            }`}
            style={{ minHeight: 320 }}
          >
            <input {...getInputProps()} ref={uploadRef} />
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl transition-transform group-hover:scale-110"
              style={{ background: "#0F1A2A", color: ACCENT }}>
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
            {/* File info */}
            <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ background: "#0F1A2A", color: ACCENT }}>
                <FileText className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-foreground">{file.name}</p>
                <p className="text-sm text-muted">
                  {formatBytes(file.size)}{analyzing ? " - checking pages" : pageCount > 0 ? ` · ${pageCount} page${pageCount !== 1 ? "s" : ""}` : ""}
                </p>
              </div>
              <button onClick={reset} className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground transition-colors border border-border hover:border-foreground/20">
                Change
              </button>
            </div>

            {/* Info banner */}
            <div className="flex items-start gap-3 rounded-xl border p-4 border-red-500/30 bg-red-500/10">
              <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0 text-red-500" />
              <div className="text-sm text-red-700 dark:text-red-400">
                <strong>Raw Text Extraction Only:</strong> This client-side tool cannot safely reconstruct complex Word layouts. 
                It simply extracts text and approximates paragraphs. Images, tables, and columns will be lost or jumbled.
              </div>
            </div>

            {/* Convert button */}
            <div className="flex items-center justify-between gap-4">
              <button
                onClick={handleConvert}
                disabled={processing || analyzing}
                className="flex flex-1 items-center justify-center gap-2.5 rounded-2xl py-4 text-base font-bold text-white shadow-lg transition-all hover:opacity-90 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                style={{ background: ACCENT }}
              >
                {processing ? (
                  <>
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Converting…
                  </>
                ) : (
                  <>
                    <FileText className="h-5 w-5" />
                    Convert to Word
                  </>
                )}
              </button>
            </div>
            {processing && (
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-sm font-semibold text-foreground">{pipelineProgress?.message ?? "Converting..."}</p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full transition-all" style={{ width: `${pipelineProgress?.percent ?? 0}%`, backgroundColor: ACCENT }} />
                </div>
                {memoryWarning && (
                  <p className="mt-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-700 dark:text-yellow-300">
                    Large PDF detected. Conversion may use about {formatBytes(memoryWarning.estimatedBytes)} of memory.
                  </p>
                )}
                <button type="button" onClick={cancel} className="mt-4 rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-muted">
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {/* Step 3 — Result */}
        {step === "result" && result && file && (
          <div className="space-y-5">
            {/* Success banner */}
            <div className="flex items-center gap-4 rounded-2xl border border-blue-500/30 bg-blue-500/8 p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400">
                <FileText className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground">Your Word file is ready!</p>
                <p className="mt-0.5 text-sm text-muted truncate">{result.name}</p>
              </div>
            </div>

            <SizeComparisonBadge originalSize={file.size} compressedSize={result.bytes.length} />

            {/* Download button */}
            <button
              id="download-btn"
              onClick={handleDownload}
              className="flex w-full items-center justify-center gap-2.5 rounded-2xl py-4 text-base font-bold text-white shadow-lg transition-all hover:opacity-90 hover:-translate-y-0.5"
              style={{ background: ACCENT }}
            >
              <Download className="h-5 w-5" />
              Download .docx
              <ShortcutHint shortcut="D" />
            </button>

            <button
              onClick={reset}
              className="w-full rounded-2xl border border-border bg-card py-3 text-sm font-semibold text-foreground transition hover:bg-background"
            >
              Convert another PDF
            </button>
          </div>
        )}
      </main>
    </AppShell>
  );
}
