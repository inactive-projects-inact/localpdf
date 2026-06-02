"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { CheckCircle, ChevronRight, Copy, Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import AppShell from "../components/AppShell";
import ShortcutHint from "../components/ShortcutHint";
import { useFileHistory } from "../components/FileHistoryProvider";
import type { FileHistoryItem } from "../components/FileHistoryProvider";
import type { PDFPageProxy, TextItem as PdfTextItem } from "pdfjs-dist/types/src/display/api";

type PdfJs = typeof import("pdfjs-dist");
type PdfDocumentProxy = import("pdfjs-dist").PDFDocumentProxy;
type Step = "upload" | "configure" | "processing" | "result";
type PageScope = "all" | "range";

type Options = {
  headings: boolean;
  separators: boolean;
  lists: boolean;
  cleanWhitespace: boolean;
};

type Line = {
  text: string;
  x: number;
  y: number;
  height: number;
};

const ACCENT_COLOR = "#3B3BFF";

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

function getMedian(values: number[]): number {
  if (values.length === 0) return 12;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 12;
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

function normalizeListLine(text: string): string {
  if (/^\d+\.\s+/.test(text)) return text;
  return text.replace(/^[•*–-]\s*/, "- ");
}

async function pageToMarkdown(page: PDFPageProxy, options: Options): Promise<string> {
  const content = await page.getTextContent({ includeMarkedContent: true });
  const items = content.items.filter((item): item is PdfTextItem => "str" in item && item.str.trim().length > 0);
  const fontSizes = items.map((item) => item.height).filter((height) => height > 0);
  const medianSize = getMedian(fontSizes);
  const sorted = [...items].sort((a, b) => Number(b.transform[5]) - Number(a.transform[5]) || Number(a.transform[4]) - Number(b.transform[4]));
  const lines: Line[] = [];

  for (const item of sorted) {
    const y = Number(item.transform[5]);
    const x = Number(item.transform[4]);
    const existing = lines.find((line) => Math.abs(line.y - y) <= 2);
    if (existing) {
      existing.text = `${existing.text} ${item.str}`.replace(/\s+/g, " ").trim();
      existing.height = Math.max(existing.height, item.height);
      existing.x = Math.min(existing.x, x);
    } else {
      lines.push({ text: item.str.trim(), x, y, height: item.height });
    }
  }

  const blocks: string[] = [];
  let paragraph: string[] = [];
  let lastIndent: number | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push(paragraph.join(" ").replace(/\s+/g, " ").trim());
      paragraph = [];
    }
  };

  for (const line of lines) {
    const text = line.text.trim();
    if (!text) continue;
    const isList = options.lists && (/^[•*–-]\s+/.test(text) || /^\d+\.\s+/.test(text));
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
      blocks.push(isList ? normalizeListLine(text) : `${headingPrefix}${text}`);
      lastIndent = null;
      continue;
    }

    if (lastIndent !== null && Math.abs(line.x - lastIndent) > 8) {
      flushParagraph();
    }
    paragraph.push(text);
    lastIndent = line.x;
  }

  flushParagraph();
  return blocks.join("\n\n");
}

function filenameBase(fileName: string): string {
  return fileName.replace(/\.pdf$/i, "");
}

export default function PdfToMarkdownPage() {
  const { addFile } = useFileHistory();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PdfDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [textBased, setTextBased] = useState<boolean | null>(null);
  const [pageScope, setPageScope] = useState<PageScope>("all");
  const [startPage, setStartPage] = useState(1);
  const [endPage, setEndPage] = useState(1);
  const [options, setOptions] = useState<Options>({ headings: true, separators: true, lists: true, cleanWhitespace: true });
  const [currentPage, setCurrentPage] = useState(0);
  const [completedPages, setCompletedPages] = useState(0);
  const [markdown, setMarkdown] = useState("");

  const actualStart = pageScope === "all" ? 1 : clamp(startPage, 1, pageCount || 1);
  const actualEnd = pageScope === "all" ? pageCount : clamp(endPage, actualStart, pageCount || actualStart);
  const totalPages = Math.max(0, actualEnd - actualStart + 1);
  const progress = totalPages > 0 ? (completedPages / totalPages) * 100 : 0;
  const words = markdown.trim() ? markdown.trim().split(/\s+/).length : 0;
  const htmlPreview = useMemo(() => renderMarkdown(markdown), [markdown]);

  const handleDrop = useCallback(async (files: File[]) => {
    const selectedFile = files[0];
    if (!selectedFile) return;
    try {
      const pdfjs = await loadPdfJs();
      const arrayBuffer = await selectedFile.arrayBuffer();
      const proxy = await pdfjs.getDocument({ data: arrayBuffer.slice(0) }).promise;
      const page = await proxy.getPage(1);
      const content = await page.getTextContent({ includeMarkedContent: true });
      const hasText = content.items.some((item) => "str" in item && item.str.trim().length > 0);
      setFile(selectedFile);
      setPdfDoc(proxy);
      setPageCount(proxy.numPages);
      setStartPage(1);
      setEndPage(proxy.numPages);
      setTextBased(hasText);
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

  const convertMarkdown = useCallback(async () => {
    if (!pdfDoc) return;
    setStep("processing");
    setCompletedPages(0);
    toast.info("Extracting text...");
    try {
      const pages: string[] = [];
      let converted = 0;
      for (let pageNum = actualStart; pageNum <= actualEnd; pageNum += 1) {
        setCurrentPage(pageNum);
        const page = await pdfDoc.getPage(pageNum);
        pages.push(await pageToMarkdown(page, options));
        converted += 1;
        setCompletedPages(converted);
      }
      let output = options.separators ? pages.join("\n\n---\n\n") : pages.join("\n\n");
      if (options.cleanWhitespace) {
        output = output.replace(/\n{3,}/g, "\n\n").trim();
      }
      setMarkdown(output);
      setStep("result");
      if (output.trim().length < 30) {
        toast.warning("This PDF appears to be scanned. Results may be limited.");
      }
      toast.success(`Done! ${converted} pages converted to Markdown.`);
    } catch (error) {
      console.error(error);
      toast.error("Something went wrong.");
      setStep("configure");
    }
  }, [actualEnd, actualStart, options, pdfDoc]);

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
      URL.revokeObjectURL(url);
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
    setStep("upload");
    setFile(null);
    setPdfDoc(null);
    setPageCount(0);
    setTextBased(null);
    setMarkdown("");
    setCompletedPages(0);
  }, []);

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
              <p className="mt-2 max-w-2xl text-muted">Extract headings, paragraphs, and lists from PDFs into editable Markdown.</p>
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
                      <p className="text-muted">{pageCount} pages</p>
                      <p className="text-muted">{formatBytes(file.size)}</p>
                      {textBased === true && <div className="rounded-md bg-green-500/10 p-3 text-green-700 dark:text-green-300">Text-based PDF detected. Extraction will be accurate.</div>}
                      {textBased === false && <div className="rounded-md bg-amber-500/10 p-3 text-amber-700 dark:text-amber-300">Scanned PDF detected. Text extraction may be limited. Consider using OCR first.</div>}
                      <button type="button" onClick={goConfigure} aria-label="Configure Markdown extraction" className="w-full rounded-md bg-indigo-600 px-5 py-3 font-bold text-white hover:bg-indigo-700">Extract &rarr;</button>
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
                <p className="mt-4 text-sm font-semibold text-muted">✓ {completedPages} pages extracted</p>
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
                    <p className="mt-2 text-sm text-muted">{markdown.length} characters · {words} words</p>
                  </div>
                </div>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-semibold text-muted">~{words} words · {completedPages} pages extracted</p>
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
