"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { ChevronRight, Copy, Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import AppShell from "../components/AppShell";
import ShortcutHint from "../components/ShortcutHint";
import { useFileHistory } from "../components/FileHistoryProvider";
import type { FileHistoryItem } from "../components/FileHistoryProvider";
import { usePdfPipelineWorker } from "../hooks/usePdfPipelineWorker";
import type { PdfToMarkdownOptions } from "../lib/pdf-pipeline-protocol";

type Step = "upload" | "configure" | "processing" | "result";
type PageScope = "all" | "range";
type PipelineOperation = "idle" | "analyze" | "convert";

type MarkdownOptions = Omit<PdfToMarkdownOptions, "startPage" | "endPage">;

const ACCENT_COLOR = "#3B3BFF";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderMarkdown(md: string): string {
  return escapeHtml(md)
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/^(\d+)\. (.+)$/gm, "<li>$2</li>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<[hl])(.+)$/gm, "<p>$1</p>")
    .replace(/---/g, "<hr/>");
}

function filenameBase(fileName: string): string {
  return fileName.replace(/\.pdf$/i, "");
}

export default function PdfToMarkdownPage() {
  const { addFile } = useFileHistory();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [textBased, setTextBased] = useState<boolean | null>(null);
  const [pageScope, setPageScope] = useState<PageScope>("all");
  const [startPage, setStartPage] = useState(1);
  const [endPage, setEndPage] = useState(1);
  const [options, setOptions] = useState<MarkdownOptions>({ headings: true, separators: true, lists: true, cleanWhitespace: true });
  const [markdown, setMarkdown] = useState("");
  const [convertedPages, setConvertedPages] = useState(0);
  const [activeOperation, setActiveOperation] = useState<PipelineOperation>("idle");

  const createMarkdownWorker = useCallback(
    () => new Worker(new URL("../lib/pdfToMarkdown.worker.ts", import.meta.url), { type: "module" }),
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
  } = usePdfPipelineWorker(createMarkdownWorker);

  const actualStart = pageScope === "all" ? 1 : clamp(startPage, 1, pageCount || 1);
  const actualEnd = pageScope === "all" ? pageCount : clamp(endPage, actualStart, pageCount || actualStart);
  const totalPages = Math.max(0, actualEnd - actualStart + 1);
  const progress = pipelineStatus === "processing" && activeOperation === "convert" ? pipelineProgress?.percent ?? 0 : 0;
  const currentPage = pipelineProgress?.page?.current ?? actualStart;
  const completedPages = pipelineProgress?.unitsDone ?? 0;
  const words = markdown.trim() ? markdown.trim().split(/\s+/).length : 0;
  const htmlPreview = useMemo(() => renderMarkdown(markdown), [markdown]);

  const buildPipelineOptions = useCallback(
    (): PdfToMarkdownOptions => ({
      ...options,
      startPage: actualStart,
      endPage: actualEnd,
    }),
    [actualEnd, actualStart, options],
  );

  const handleDrop = useCallback(
    (files: File[]) => {
      const selectedFile = files[0];
      if (!selectedFile) return;
      resetPipeline();
      setActiveOperation("analyze");
      setFile(selectedFile);
      setMarkdown("");
      setConvertedPages(0);
      setPageCount(0);
      setTextBased(null);
      setStep("upload");
      void startPipeline(selectedFile, {
        tool: "pdf-to-markdown",
        operation: "analyze",
        options: { ...options, startPage: 1, endPage: 1 },
      });
    },
    [options, resetPipeline, startPipeline],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: handleDrop,
    accept: { "application/pdf": [".pdf"] },
    multiple: false,
    noKeyboard: true,
  });

  const goConfigure = useCallback(() => setStep("configure"), []);

  const convertMarkdown = useCallback(async () => {
    if (!file) return;
    if (actualEnd - actualStart > 100) {
      toast.error("Document too large. Extraction is limited to 100 pages at a time.");
      return;
    }
    setActiveOperation("convert");
    setStep("processing");
    setConvertedPages(0);
    setMarkdown("");
    toast.info("Extracting text...");
    await startPipeline(file, {
      tool: "pdf-to-markdown",
      operation: "convert",
      options: buildPipelineOptions(),
    });
  }, [actualEnd, actualStart, buildPipelineOptions, file, startPipeline]);

  useEffect(() => {
    if (pipelineStatus === "done" && activeOperation === "analyze" && pipelineResult.output?.kind === "pdf-to-markdown-analysis") {
      setPageCount(pipelineResult.output.pageCount);
      setStartPage(1);
      setEndPage(pipelineResult.output.pageCount);
      setTextBased(pipelineResult.output.textBased);
      setActiveOperation("idle");
      resetPipeline();
      return;
    }

    if (pipelineStatus === "done" && activeOperation === "convert" && pipelineResult.output?.kind === "text") {
      setMarkdown(pipelineResult.text ?? "");
      setConvertedPages(totalPages);
      setStep("result");
      setActiveOperation("idle");
      toast.success(`Done! ${totalPages} pages converted to Markdown.`);
      return;
    }

    if (pipelineStatus === "error" && activeOperation !== "idle" && pipelineError) {
      toast.error(pipelineError.message);
      if (activeOperation === "convert") setStep("configure");
      setActiveOperation("idle");
      resetPipeline();
      return;
    }

    if (pipelineStatus === "cancelled" && activeOperation !== "idle") {
      toast.info("Conversion cancelled.");
      if (activeOperation === "convert") setStep("configure");
      setActiveOperation("idle");
      resetPipeline();
    }
  }, [
    activeOperation,
    pipelineError,
    pipelineResult.output,
    pipelineResult.text,
    pipelineStatus,
    resetPipeline,
    totalPages,
  ]);

  const copyMarkdown = useCallback(async () => {
    await navigator.clipboard.writeText(markdown);
    toast.success("Copied to clipboard.");
  }, [markdown]);

  const downloadFile = useCallback(
    (extension: "md" | "txt") => {
      if (!file) return;
      const blob = new Blob([markdown], { type: extension === "md" ? "text/markdown" : "text/plain" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${filenameBase(file.name)}.${extension}`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      if (extension === "md") {
        addFile({
          filename: anchor.download,
          size: blob.size,
          timestamp: Date.now(),
          tool: "PDF to Markdown" as unknown as FileHistoryItem["tool"],
        });
      }
    },
    [addFile, file, markdown],
  );

  const resetAll = useCallback(() => {
    resetPipeline();
    setActiveOperation("idle");
    setStep("upload");
    setFile(null);
    setPageCount(0);
    setTextBased(null);
    setMarkdown("");
    setConvertedPages(0);
  }, [resetPipeline]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      if (event.key.toLowerCase() === "u" && step === "upload") {
        event.preventDefault();
        open();
      }
      if (event.key.toLowerCase() === "d" && step === "result") {
        event.preventDefault();
        downloadFile("md");
      }
      if (event.key.toLowerCase() === "c" && step === "result") {
        event.preventDefault();
        void copyMarkdown();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [copyMarkdown, downloadFile, open, step]);

  return (
    <AppShell>
      <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <Link href="/tools" aria-label="Back to all tools" className="mb-5 inline-flex text-sm font-semibold text-muted hover:text-foreground">&larr; Back to all tools</Link>
          <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 text-sm text-muted">
            <Link href="/" aria-label="Go to home page" className="hover:text-foreground">Home</Link>
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
            <Link href="/tools" aria-label="Go to tools page" className="hover:text-foreground">Tools</Link>
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
            <span className="font-semibold text-foreground">PDF to Markdown</span>
          </nav>
          <section className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-8">
            <div className="mb-8">
              <p className="text-sm font-bold uppercase tracking-[0.18em]" style={{ color: ACCENT_COLOR }}>Structured text</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">PDF to Markdown</h1>
              <p className="mt-2 max-w-2xl text-muted">Extract selectable PDF text into editable Markdown with approximate reading order, headings, lists, and simple tables.</p>
            </div>

            {step === "upload" && (
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div {...getRootProps()} aria-label="Upload PDF dropzone" className={`cursor-pointer rounded-lg border-2 border-dashed p-10 text-center transition ${isDragActive ? "border-indigo-500 bg-indigo-500/10" : "border-border bg-background hover:border-indigo-500"}`}>
                  <input {...getInputProps({ "aria-label": "Upload PDF" })} />
                  <FileText aria-hidden="true" className="mx-auto mb-4 h-10 w-10 text-indigo-500" />
                  <p className="text-xl font-bold">{isDragActive ? "Drop your PDF here" : "Drag & drop your PDF here"}</p>
                  <p className="mt-2 text-sm text-muted">PDF only, processed locally.</p>
                  <button type="button" onClick={open} aria-label="Browse for a PDF file" className="mt-6 inline-flex items-center justify-center gap-3 rounded-md bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-700">Browse PDF <ShortcutHint shortcut="U" /></button>
                </div>
                <aside className="rounded-lg border border-border bg-background p-5">
                  <h2 className="text-lg font-bold">File</h2>
                  {file ? (
                    <div className="mt-4 space-y-3 text-sm">
                      <p className="break-all font-semibold">{file.name}</p>
                      {activeOperation === "analyze" && pipelineStatus === "processing" ? (
                        <p className="text-muted">{pipelineProgress?.message ?? "Reading PDF..."}</p>
                      ) : (
                        <>
                          <p className="text-muted">{pageCount} pages</p>
                          <p className="text-muted">{formatBytes(file.size)}</p>
                          {textBased === true && <div className="rounded-md bg-green-500/10 p-3 text-green-700 dark:text-green-300">Selectable text detected. Extraction quality depends on the PDF&apos;s internal text order.</div>}
                          {textBased === false && <div className="rounded-md bg-amber-500/10 p-3 text-amber-700 dark:text-amber-300">Scanned PDF detected. Text extraction may be limited. Consider using OCR first.</div>}
                          <button type="button" onClick={goConfigure} disabled={pageCount === 0} aria-label="Configure Markdown extraction" className="w-full rounded-md bg-indigo-600 px-5 py-3 font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">Extract &rarr;</button>
                        </>
                      )}
                    </div>
                  ) : <p className="mt-4 text-sm text-muted">Choose a PDF to begin.</p>}
                </aside>
              </div>
            )}

            {step === "configure" && (
              <div className="space-y-7">
                <h2 className="text-2xl font-bold">Configure Markdown Output</h2>
                <fieldset>
                  <legend className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-muted">Page Scope</legend>
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 text-sm font-semibold"><input type="radio" checked={pageScope === "all"} onChange={() => setPageScope("all")} aria-label="Extract all pages" className="accent-indigo-600" />All pages</label>
                    <label className="flex items-center gap-2 text-sm font-semibold"><input type="radio" checked={pageScope === "range"} onChange={() => setPageScope("range")} aria-label="Extract page range" className="accent-indigo-600" />Page range</label>
                    {pageScope === "range" && (
                      <div className="flex items-center gap-2">
                        <input type="number" min={1} max={pageCount} value={startPage} onChange={(e) => setStartPage(clamp(Number(e.target.value) || 1, 1, pageCount))} aria-label="Start page" className="w-20 rounded-md border border-border bg-background px-2 py-2 text-center" />
                        <span className="text-muted">to</span>
                        <input type="number" min={startPage} max={pageCount} value={endPage} onChange={(e) => setEndPage(clamp(Number(e.target.value) || pageCount, startPage, pageCount))} aria-label="End page" className="w-20 rounded-md border border-border bg-background px-2 py-2 text-center" />
                      </div>
                    )}
                  </div>
                </fieldset>

                {memoryWarning && (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-400">
                    This PDF may need substantial memory. Close other heavy tabs if conversion fails.
                  </div>
                )}

                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-400">
                  <strong>Limited Text Extraction:</strong> This client-side tool uses selectable PDF text and layout heuristics for reading order, columns, headings, lists, and simple tables. It <strong>cannot</strong> reliably reconstruct complex tables, footnotes, rotated text, images, or true document structure.
                </div>

                <fieldset>
                  <legend className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-muted">Formatting Options</legend>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="rounded-lg border border-border bg-background p-4 text-sm font-semibold"><input type="checkbox" checked={options.headings} onChange={(e) => setOptions((o) => ({ ...o, headings: e.target.checked }))} aria-label="Detect headings automatically" className="mr-2 accent-indigo-600" />Detect headings automatically<p className="mt-1 text-xs font-normal text-muted">Converts large text to # ## ### markdown headings</p></label>
                    <label className="rounded-lg border border-border bg-background p-4 text-sm font-semibold"><input type="checkbox" checked={options.separators} onChange={(e) => setOptions((o) => ({ ...o, separators: e.target.checked }))} aria-label="Add page separator between pages" className="mr-2 accent-indigo-600" />Add page separator between pages<p className="mt-1 text-xs font-normal text-muted">Inserts --- between each page&apos;s content</p></label>
                    <label className="rounded-lg border border-border bg-background p-4 text-sm font-semibold"><input type="checkbox" checked={options.lists} onChange={(e) => setOptions((o) => ({ ...o, lists: e.target.checked }))} aria-label="Detect bullet and numbered lists" className="mr-2 accent-indigo-600" />Detect bullet and numbered lists</label>
                    <label className="rounded-lg border border-border bg-background p-4 text-sm font-semibold"><input type="checkbox" checked={options.cleanWhitespace} onChange={(e) => setOptions((o) => ({ ...o, cleanWhitespace: e.target.checked }))} aria-label="Remove excessive blank lines" className="mr-2 accent-indigo-600" />Remove excessive blank lines<p className="mt-1 text-xs font-normal text-muted">Collapses 3+ consecutive blank lines into one</p></label>
                  </div>
                </fieldset>
                <button type="button" onClick={() => void convertMarkdown()} aria-label="Convert PDF to Markdown" className="w-full rounded-md bg-indigo-600 px-5 py-4 text-lg font-bold text-white hover:bg-indigo-700">Convert to Markdown &rarr;</button>
              </div>
            )}

            {step === "processing" && (
              <div className="mx-auto max-w-xl py-12 text-center">
                <Loader2 aria-hidden="true" className="mx-auto mb-5 h-12 w-12 animate-spin text-indigo-600" />
                <h2 className="text-xl font-bold">Extracting page {currentPage} of {actualEnd}...</h2>
                <div className="mt-6 h-3 overflow-hidden rounded-full bg-muted/20"><div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${progress}%` }} /></div>
                <p className="mt-4 text-sm font-semibold text-muted">Done: {completedPages} pages extracted</p>
                {memoryWarning && <p className="mt-3 text-sm font-semibold text-amber-500">High memory use possible for this PDF.</p>}
                <button type="button" onClick={cancel} className="mt-4 rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-muted">Cancel</button>
              </div>
            )}

            {step === "result" && (
              <div>
                <div className="grid gap-6 lg:grid-cols-2">
                  <div>
                    <h2 className="mb-3 text-lg font-bold">Preview</h2>
                    <div className="prose max-h-[560px] overflow-auto rounded-lg border border-border bg-white p-6 text-gray-950 prose-headings:text-gray-950 prose-p:text-gray-800">
                      <div dangerouslySetInnerHTML={{ __html: htmlPreview }} />
                    </div>
                  </div>
                  <div>
                    <h2 className="mb-3 text-lg font-bold">Edit Markdown</h2>
                    <textarea value={markdown} onChange={(e) => setMarkdown(e.target.value)} aria-label="Edit raw Markdown" className="min-h-[560px] w-full resize-y rounded-lg border border-border bg-gray-950 p-4 font-mono text-sm text-gray-100" />
                    <p className="mt-2 text-sm text-muted">{markdown.length} characters - {words} words</p>
                  </div>
                </div>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-semibold text-muted">~{words} words - {convertedPages} pages extracted</p>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button type="button" onClick={() => void copyMarkdown()} aria-label="Copy Markdown to clipboard" className="inline-flex items-center justify-center gap-2 rounded-md border border-border px-4 py-3 font-bold"><Copy aria-hidden="true" className="h-4 w-4" />Copy <ShortcutHint shortcut="C" /></button>
                    <button type="button" onClick={() => downloadFile("md")} aria-label="Download Markdown file" className="inline-flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-3 font-bold text-white hover:bg-indigo-700"><Download aria-hidden="true" className="h-4 w-4" />Download .md <ShortcutHint shortcut="D" /></button>
                    <button type="button" onClick={() => downloadFile("txt")} aria-label="Download text file" className="rounded-md border border-border px-4 py-3 font-bold">Download .txt</button>
                    <button type="button" onClick={resetAll} aria-label="Convert another PDF" className="rounded-md border border-border px-4 py-3 font-bold">Convert another</button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </AppShell>
  );
}
