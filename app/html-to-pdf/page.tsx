"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { ChevronRight, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import AppShell from "../components/AppShell";
import ShortcutHint from "../components/ShortcutHint";
import SizeComparisonBadge from "../components/SizeComparisonBadge";
import { useFileHistory } from "../components/FileHistoryProvider";
import type { FileHistoryItem } from "../components/FileHistoryProvider";

type Step = "input" | "config" | "processing" | "result";
type InputMode = "paste" | "upload";
type PageSize = "A4" | "A3" | "Letter" | "Legal" | "Custom";
type Orientation = "portrait" | "landscape";
type Margin = "none" | "small" | "medium" | "large";
type ScaleMode = "fit" | "actual";
type Background = "white" | "transparent";
type Pagination = "auto" | "single";

type Config = {
  pageSize: PageSize;
  orientation: Orientation;
  margin: Margin;
  scale: ScaleMode;
  background: Background;
  pagination: Pagination;
  customWidthMm: number;
  customHeightMm: number;
};

type UploadedHtmlFile = {
  name: string;
  size: number;
  preview: string;
};

const ACCENT_COLOR = "#10B981";
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MM_TO_POINTS = 72 / 25.4;
const CSS_PX_PER_POINT = 96 / 72;
const MIN_CUSTOM_MM = 25;
const MAX_CUSTOM_MM = 1000;
const DEFAULT_HTML = `<h1>Hello World</h1>
<p>This is a sample HTML document.</p>
<ul>
  <li>Private</li>
  <li>Fast</li>
  <li>Free</li>
</ul>`;
const PAGE_DIMS: Record<PageSize, [number, number]> = {
  A4: [595.28, 841.89],
  A3: [841.89, 1190.55],
  Letter: [612, 792],
  Legal: [612, 1008],
  Custom: [595.28, 841.89],
};
const MARGINS: Record<Margin, number> = {
  none: 0,
  small: 28.35,
  medium: 56.7,
  large: 85.04,
};

function byteLength(value: string): number {
  return new Blob([value]).size;
}

function filenameWithoutExtension(name: string): string {
  return name.replace(/\.[^/.]+$/, "");
}

function clampCustomMm(value: number): number {
  if (!Number.isFinite(value)) return MIN_CUSTOM_MM;
  return Math.min(MAX_CUSTOM_MM, Math.max(MIN_CUSTOM_MM, value));
}

function pageDimensions(config: Config): [number, number] {
  const [pageW, pageH] =
    config.pageSize === "Custom"
      ? [clampCustomMm(config.customWidthMm) * MM_TO_POINTS, clampCustomMm(config.customHeightMm) * MM_TO_POINTS]
      : PAGE_DIMS[config.pageSize];
  return config.orientation === "landscape" ? [pageH, pageW] : [pageW, pageH];
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function withTimeout(task: Promise<void>, ms: number): Promise<void> {
  await Promise.race([task, delay(ms)]);
}

async function waitForIframeContent(iframe: HTMLIFrameElement): Promise<Document> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let timeout = 0;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      iframe.removeEventListener("load", finish);
      iframe.removeEventListener("error", fail);
      resolve();
    };
    const fail = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      iframe.removeEventListener("load", finish);
      iframe.removeEventListener("error", fail);
      reject(new Error("Could not load HTML preview frame."));
    };

    iframe.addEventListener("load", finish);
    iframe.addEventListener("error", fail);
    timeout = window.setTimeout(finish, 4000);
  });

  const iframeDocument = iframe.contentDocument;
  if (!iframeDocument) {
    throw new Error("Could not access iframe document.");
  }

  if (iframeDocument.fonts) {
    await withTimeout(iframeDocument.fonts.ready.then(() => undefined), 3000);
  }

  const pendingImages = Array.from(iframeDocument.images).filter((image) => !image.complete);
  await Promise.all(
    pendingImages.map((image) =>
      withTimeout(
        new Promise<void>((resolve) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        }),
        5000,
      ),
    ),
  );

  await nextFrame();
  return iframeDocument;
}

async function canvasToPdfImageBytes(canvas: HTMLCanvasElement, background: Background): Promise<{ bytes: Uint8Array; format: "jpg" | "png" }> {
  const mimeType = background === "white" ? "image/jpeg" : "image/png";
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, mimeType, 0.9);
  });
  if (!blob) {
    throw new Error("Could not encode captured HTML image.");
  }
  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    format: mimeType === "image/jpeg" ? "jpg" : "png",
  };
}

export default function HtmlToPdfPage() {
  const { addFile } = useFileHistory();
  const [step, setStep] = useState<Step>("input");
  const [inputMode, setInputMode] = useState<InputMode>("paste");
  const [rawHtml, setRawHtml] = useState(DEFAULT_HTML);
  const [sanitizedHtml, setSanitizedHtml] = useState("");
  const [uploadedFile, setUploadedFile] = useState<UploadedHtmlFile | null>(null);
  const [config, setConfig] = useState<Config>({
    pageSize: "A4",
    orientation: "portrait",
    margin: "medium",
    scale: "fit",
    background: "white",
    pagination: "auto",
    customWidthMm: 210,
    customHeightMm: 297,
  });
  const [processingLabel, setProcessingLabel] = useState("");
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeRunId = useRef(0);

  const htmlBytes = useMemo(() => byteLength(rawHtml), [rawHtml]);
  const inputTooLarge = htmlBytes > MAX_HTML_BYTES;
  const pdfByteLength = pdfBytes?.byteLength ?? 0;
  const lineCount = rawHtml.length === 0 ? 0 : rawHtml.split("\n").length;
  const previewDimensions = useMemo(() => pageDimensions(config), [config]);

  const sanitizeHtml = useCallback(async (html: string): Promise<string> => {
    const DOMPurify = (await import("dompurify")).default;
    return DOMPurify.sanitize(html, {
      FORCE_BODY: true,
      FORBID_TAGS: ["script", "style"],
      FORBID_ATTR: ["onerror", "onload", "onclick"],
    });
  }, []);

  const createHiddenIframeCapture = useCallback(
    async (cleanHtml: string): Promise<HTMLCanvasElement> => {
      let iframe: HTMLIFrameElement | null = document.createElement("iframe");
      const [pageW, pageH] = pageDimensions(config);
      const margin = MARGINS[config.margin];
      const contentW = pageW - margin * 2;
      const contentH = pageH - margin * 2;
      if (contentW <= 0 || contentH <= 0) {
        throw new Error("Selected margins leave no printable area.");
      }

      const frameWidthPx = config.scale === "fit" ? Math.ceil(contentW * CSS_PX_PER_POINT) : 1200;
      const frameMinHeightPx = Math.ceil(contentH * CSS_PX_PER_POINT);
      iframe.style.position = "absolute";
      iframe.style.left = "-9999px";
      iframe.style.top = "0";
      iframe.style.width = `${frameWidthPx}px`;
      iframe.style.minHeight = `${frameMinHeightPx}px`;
      iframe.style.background = config.background === "white" ? "#ffffff" : "transparent";
      iframe.setAttribute("aria-hidden", "true");

      try {
        const loaded = waitForIframeContent(iframe);
        document.body.appendChild(iframe);
        iframe.srcdoc = cleanHtml;
        const iframeDocument = await loaded;

        setProcessingLabel("Capturing layout...");
        const html2canvas = (await import("html2canvas")).default;
        return await html2canvas(iframeDocument.body, {
          backgroundColor: config.background === "white" ? "#ffffff" : null,
          scale: 1,
          useCORS: true,
        });
      } finally {
        iframe?.remove();
        iframe = null;
      }
    },
    [config],
  );

  const generatePdf = useCallback(async () => {
    if (!rawHtml.trim()) return;

    if (htmlBytes > MAX_HTML_BYTES) {
      toast.error("Input too large. Please limit HTML to 2MB.");
      return;
    }

    const runId = activeRunId.current + 1;
    activeRunId.current = runId;
    setPdfBytes(null);
    setPdfPageCount(0);
    setStep("processing");
    setProcessingLabel("Rendering HTML...");
    toast.info("Rendering HTML...");
    
    // Yield to allow UI to update to processing state
    await delay(100);

    let canvas: HTMLCanvasElement | null = null;

    try {
      const clean = await sanitizeHtml(rawHtml);
      if (activeRunId.current !== runId) return;
      setSanitizedHtml(clean);
      canvas = await createHiddenIframeCapture(clean);
      if (activeRunId.current !== runId) return;
      toast.info("Building PDF...");
      setProcessingLabel("Building PDF pages... 0 of 0");

      const { PDFDocument } = await import("pdf-lib");
      const pdfDoc = await PDFDocument.create();
      const [pageW, pageH] = pageDimensions(config);
      const margin = MARGINS[config.margin];
      const contentW = pageW - margin * 2;
      const contentH = pageH - margin * 2;
      if (contentW <= 0 || contentH <= 0) {
        throw new Error("Selected margins leave no printable area.");
      }
      const pxToPtScale = config.scale === "fit" ? contentW / canvas.width : 1;
      if (!Number.isFinite(pxToPtScale) || pxToPtScale <= 0) {
        throw new Error("Captured HTML layout has an invalid size.");
      }
      const embedCanvas = async (sourceCanvas: HTMLCanvasElement) => {
        const imageBytes = await canvasToPdfImageBytes(sourceCanvas, config.background);
        return imageBytes.format === "jpg" ? pdfDoc.embedJpg(imageBytes.bytes) : pdfDoc.embedPng(imageBytes.bytes);
      };

      if (config.pagination === "single") {
        const img = await embedCanvas(canvas);
        if (activeRunId.current !== runId) return;
        const imgW = canvas.width * pxToPtScale;
        const imgH = canvas.height * pxToPtScale;
        const page = pdfDoc.addPage([pageW, imgH + margin * 2]);
        page.drawImage(img, { x: margin, y: margin, width: imgW, height: imgH });
        setPdfPageCount(1);
      } else {
        const sliceHeightPx = Math.floor(contentH / pxToPtScale);
        if (sliceHeightPx < 1) {
          throw new Error("Selected page settings leave no printable area.");
        }
        const totalPages = Math.ceil(canvas.height / sliceHeightPx);
        
        for (let i = 0; i < totalPages; i++) {
          if (activeRunId.current !== runId) return;
          setProcessingLabel(`Building PDF pages... ${i + 1} of ${totalPages}`);
          await nextFrame();
          const sliceCanvas = document.createElement("canvas");
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = Math.min(sliceHeightPx, canvas.height - i * sliceHeightPx);
          const ctx = sliceCanvas.getContext("2d");
          if (!ctx) {
            throw new Error("Could not create canvas context.");
          }
          ctx.drawImage(canvas, 0, -i * sliceHeightPx);
          const img = await embedCanvas(sliceCanvas);
          const page = pdfDoc.addPage([pageW, pageH]);
          const ptHeight = sliceCanvas.height * pxToPtScale;
          const imgW = canvas.width * pxToPtScale;
          page.drawImage(img, {
            x: margin,
            y: pageH - margin - ptHeight,
            width: imgW,
            height: ptHeight,
          });
          
          sliceCanvas.width = 0;
          sliceCanvas.height = 0;
        }
        setPdfPageCount(totalPages);
      }

      const bytes = await pdfDoc.save();
      if (activeRunId.current !== runId) return;
      setPdfBytes(bytes);
      setStep("result");
      toast.success("Done! PDF is ready.");
    } catch (error) {
      if (activeRunId.current === runId) {
        console.error(error);
        toast.error("Something went wrong. Check your HTML and try again.");
        setStep("config");
      }
    } finally {
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
        canvas = null;
      }
    }
  }, [config, createHiddenIframeCapture, htmlBytes, rawHtml, sanitizeHtml]);

  const downloadPdf = useCallback(() => {
    if (!pdfBytes) return;

    const buffer = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer;
    const blob = new Blob([buffer], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const downloadName = uploadedFile ? `converted-${filenameWithoutExtension(uploadedFile.name)}.pdf` : "converted-document.pdf";
    anchor.href = url;
    anchor.download = downloadName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    addFile({
      filename: downloadName,
      size: pdfBytes.byteLength,
      timestamp: Date.now(),
      tool: "HTML to PDF" as unknown as FileHistoryItem["tool"],
    });
  }, [addFile, pdfBytes, uploadedFile]);

  const handleTextareaChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setRawHtml(event.target.value);
    setPdfBytes(null);
    setPdfPageCount(0);
  }, []);

  const handleTextareaKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Tab") return;

    event.preventDefault();
    const target = event.currentTarget;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const nextValue = `${target.value.slice(0, start)}  ${target.value.slice(end)}`;
    setRawHtml(nextValue);
    setPdfBytes(null);
    setPdfPageCount(0);
    window.setTimeout(() => {
      target.selectionStart = start + 2;
      target.selectionEnd = start + 2;
    }, 0);
  }, []);

  const readUploadedFile = useCallback((file: File) => {
    if (file.size > MAX_HTML_BYTES) {
      toast.error("Input too large. Please limit HTML to 2MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      if (byteLength(text) > MAX_HTML_BYTES) {
        toast.error("Input too large. Please limit HTML to 2MB.");
        return;
      }
      setRawHtml(text);
      setUploadedFile({ name: file.name, size: file.size, preview: text.slice(0, 300) });
      setPdfBytes(null);
      setPdfPageCount(0);
    };
    reader.onerror = () => {
      toast.error("Something went wrong. Check your HTML and try again.");
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;
      readUploadedFile(file);
    },
    [readUploadedFile],
  );

  const handleDropRejected = useCallback(() => {
    toast.error("Use a .html or .htm file under 2MB.");
  }, []);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: handleDrop,
    onDropRejected: handleDropRejected,
    accept: { "text/html": [".html", ".htm"] },
    maxSize: MAX_HTML_BYTES,
    multiple: false,
    noKeyboard: true,
  });

  const goToPreview = useCallback(async () => {
    if (inputTooLarge) {
      toast.error("Input too large. Please limit HTML to 2MB.");
      return;
    }
    const clean = await sanitizeHtml(rawHtml);
    setSanitizedHtml(clean);
    setStep("config");
  }, [inputTooLarge, rawHtml, sanitizeHtml]);

  const setModePaste = useCallback(() => {
    setInputMode("paste");
  }, []);

  const setModeUpload = useCallback(() => {
    setInputMode("upload");
  }, []);

  const editInput = useCallback(() => {
    activeRunId.current += 1;
    setStep("input");
  }, []);

  const editConfig = useCallback(() => {
    setStep("config");
  }, []);

  const updateConfig = useCallback(<K extends keyof Config>(key: K, value: Config[K]) => {
    setConfig((current) => ({ ...current, [key]: value }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        if (!rawHtml.trim()) {
          if (!cancelled) setSanitizedHtml("");
          return;
        }
        if (byteLength(rawHtml) > MAX_HTML_BYTES) {
          if (!cancelled) setSanitizedHtml("");
          return;
        }
        try {
          const clean = await sanitizeHtml(rawHtml);
          if (!cancelled) setSanitizedHtml(clean);
        } catch (error) {
          console.error(error);
        }
      })();
    }, 600);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [rawHtml, sanitizeHtml]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) {
        return;
      }

      if (event.ctrlKey && event.key === "Enter" && step === "config") {
        event.preventDefault();
        void generatePdf();
      }

      if (event.key.toLowerCase() === "d" && step === "result") {
        event.preventDefault();
        downloadPdf();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [downloadPdf, generatePdf, step]);

  return (
    <AppShell>
      <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
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
            <span className="font-semibold text-foreground">HTML to PDF</span>
          </nav>

          <section className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-8">
            <div className="mb-8">
              <p className="text-sm font-bold uppercase tracking-[0.18em]" style={{ color: ACCENT_COLOR }}>
                Browser only
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">HTML to PDF</h1>
              <p className="mt-2 max-w-2xl text-muted">
                Paste HTML or upload an HTML file, preview it safely, and generate a PDF without uploading anything.
              </p>
            </div>

            {step === "input" && (
              <div>
                <div className="mb-6 grid gap-2 sm:inline-grid sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={setModePaste}
                    aria-label="Use paste HTML tab"
                    className={`rounded-md px-5 py-3 text-sm font-bold ${
                      inputMode === "paste" ? "bg-emerald-500 text-white" : "bg-muted/10 text-muted"
                    }`}
                  >
                    Paste HTML
                  </button>
                  <button
                    type="button"
                    onClick={setModeUpload}
                    aria-label="Use upload file tab"
                    className={`rounded-md px-5 py-3 text-sm font-bold ${
                      inputMode === "upload" ? "bg-emerald-500 text-white" : "bg-muted/10 text-muted"
                    }`}
                  >
                    Upload File
                  </button>
                </div>

                {inputMode === "paste" && (
                  <div className="relative">
                    <textarea
                      ref={textareaRef}
                      value={rawHtml}
                      onChange={handleTextareaChange}
                      onKeyDown={handleTextareaKeyDown}
                      placeholder="<h1>Your title</h1>&#10;<p>Your paragraph.</p>&#10;<ul><li>First item</li></ul>"
                      aria-label="Paste HTML source"
                      className="min-h-[280px] w-full resize-y rounded-lg border border-border bg-gray-950 p-4 font-mono text-[13px] text-gray-100 outline-none ring-emerald-500 transition focus:ring-2"
                    />
                    <p className="absolute bottom-3 right-3 rounded bg-gray-950 px-2 py-1 font-mono text-xs text-gray-400">
                      {lineCount} lines | {rawHtml.length} characters | {(htmlBytes / 1024).toFixed(1)} KB
                    </p>
                  </div>
                )}

                {inputTooLarge && (
                  <p className="mt-3 text-sm font-semibold text-red-600 dark:text-red-400">
                    HTML input is over the 2 MB browser-side limit. Reduce the file before previewing or generating.
                  </p>
                )}

                {inputMode === "upload" && (
                  <div>
                    <div
                      {...getRootProps()}
                      aria-label="Upload HTML file dropzone"
                      className={`cursor-pointer rounded-lg border-2 border-dashed p-10 text-center transition ${
                        isDragActive ? "border-emerald-500 bg-emerald-500/10" : "border-border bg-background hover:border-emerald-500"
                      }`}
                    >
                      <input {...getInputProps({ "aria-label": "Upload HTML file" })} />
                      <p className="text-lg font-bold">{isDragActive ? "Drop your HTML file" : "Drag & drop your .html or .htm file"}</p>
                      <button
                        type="button"
                        onClick={open}
                        aria-label="Browse for an HTML file"
                        className="mt-4 rounded-md bg-emerald-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-600"
                      >
                        Browse file
                      </button>
                    </div>
                    {uploadedFile && (
                      <div className="mt-5 rounded-lg border border-border bg-background p-4">
                        <p className="break-all text-sm font-bold">{uploadedFile.name}</p>
                        <p className="mt-1 text-sm text-muted">{(uploadedFile.size / 1024).toFixed(1)} KB</p>
                        <pre className="mt-4 max-h-36 overflow-auto rounded-md bg-muted/10 p-3 text-left font-mono text-xs text-muted">
                          {uploadedFile.preview}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-5">
                  <h3 className="mb-2 flex items-center text-sm font-bold text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="mr-2 h-4 w-4" />
                    Browser-Side Limitations
                  </h3>
                  <ul className="list-inside list-disc space-y-1 text-sm text-amber-700/80 dark:text-amber-400/80">
                    <li>Inputs larger than 2 MB are rejected to avoid browser hangs and memory exhaustion.</li>
                    <li>External images can be blocked by CORS policies.</li>
                    <li>Custom web fonts may fall back to system fonts.</li>
                    <li>CSS animations are captured in their static state.</li>
                    <li>JavaScript is stripped and not executed.</li>
                    <li>The output is a raster capture of the rendered HTML, not selectable HTML text.</li>
                  </ul>
                </div>

                <div className="mt-8 flex justify-end">
                  <button
                    type="button"
                    onClick={goToPreview}
                    disabled={!rawHtml.trim() || inputTooLarge}
                    aria-label="Preview HTML"
                    className="rounded-md bg-emerald-500 px-6 py-3 font-bold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Preview &rarr;
                  </button>
                </div>
              </div>
            )}

            {step === "config" && (
              <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(280px,2fr)]">
                <div className="rounded-lg border border-border bg-muted/10 p-5">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-lg font-bold">Preview - actual PDF may vary slightly</h2>
                    <button
                      type="button"
                      onClick={editInput}
                      aria-label="Edit HTML input"
                      className="text-left text-sm font-bold text-emerald-500 hover:underline"
                    >
                      Edit HTML
                    </button>
                  </div>
                  <div className="overflow-auto py-3">
                    <div
                      className="mx-auto overflow-hidden bg-white shadow-xl"
                      style={{
                        width: previewDimensions[0] <= previewDimensions[1] ? "min(100%, 420px)" : "min(100%, 560px)",
                        aspectRatio: `${previewDimensions[0]} / ${previewDimensions[1]}`,
                      }}
                    >
                      <iframe
                        title="HTML to PDF preview"
                        srcDoc={sanitizedHtml}
                        sandbox="allow-same-origin"
                        aria-label="Sanitized HTML preview"
                        className="h-full w-full border-0 bg-white"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-background p-5">
                  <h2 className="mb-5 text-lg font-bold">Document Settings</h2>
                  <div className="space-y-6">
                    <fieldset>
                      <legend className="mb-2 text-sm font-bold">Page Size</legend>
                      <div className="grid grid-cols-2 gap-2">
                        {(["A4", "A3", "Letter", "Legal", "Custom"] as PageSize[]).map((size) => (
                          <label key={size} className="rounded-md border border-border px-3 py-2 text-sm font-semibold">
                            <input
                              type="radio"
                              name="page-size"
                              checked={config.pageSize === size}
                              onChange={() => updateConfig("pageSize", size)}
                              aria-label={`Use ${size} page size`}
                              className="mr-2 accent-emerald-500"
                            />
                            {size}
                          </label>
                        ))}
                      </div>
                    </fieldset>

                    {config.pageSize === "Custom" && (
                      <div className="grid grid-cols-2 gap-3">
                        <label className="block text-sm font-bold">
                          Width (mm)
                          <input
                            type="number"
                            min={MIN_CUSTOM_MM}
                            max={MAX_CUSTOM_MM}
                            value={config.customWidthMm}
                            onChange={(event) => updateConfig("customWidthMm", clampCustomMm(Number(event.target.value)))}
                            aria-label="Custom page width in millimeters"
                            className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2"
                          />
                        </label>
                        <label className="block text-sm font-bold">
                          Height (mm)
                          <input
                            type="number"
                            min={MIN_CUSTOM_MM}
                            max={MAX_CUSTOM_MM}
                            value={config.customHeightMm}
                            onChange={(event) => updateConfig("customHeightMm", clampCustomMm(Number(event.target.value)))}
                            aria-label="Custom page height in millimeters"
                            className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2"
                          />
                        </label>
                      </div>
                    )}

                    <fieldset>
                      <legend className="mb-2 text-sm font-bold">Orientation</legend>
                      <div className="grid grid-cols-2 gap-2">
                        {(["portrait", "landscape"] as Orientation[]).map((orientation) => (
                          <button
                            key={orientation}
                            type="button"
                            onClick={() => updateConfig("orientation", orientation)}
                            aria-label={`Use ${orientation} orientation`}
                            className={`rounded-md px-3 py-2 text-sm font-bold capitalize ${
                              config.orientation === orientation ? "bg-emerald-500 text-white" : "bg-muted/10 text-muted"
                            }`}
                          >
                            {orientation}
                          </button>
                        ))}
                      </div>
                    </fieldset>

                    <label className="block text-sm font-bold">
                      Margin
                      <select
                        value={config.margin}
                        onChange={(event) => updateConfig("margin", event.target.value as Margin)}
                        aria-label="Select PDF margin"
                        className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2"
                      >
                        <option value="none">None (0mm)</option>
                        <option value="small">Small (10mm)</option>
                        <option value="medium">Medium (20mm)</option>
                        <option value="large">Large (30mm)</option>
                      </select>
                    </label>

                    <fieldset>
                      <legend className="mb-2 text-sm font-bold">Scale</legend>
                      <div className="grid grid-cols-2 gap-2">
                        {(["fit", "actual"] as ScaleMode[]).map((scale) => (
                          <button
                            key={scale}
                            type="button"
                            onClick={() => updateConfig("scale", scale)}
                            aria-label={scale === "fit" ? "Fit HTML to page width" : "Use actual HTML size"}
                            className={`rounded-md px-3 py-2 text-sm font-bold ${
                              config.scale === scale ? "bg-emerald-500 text-white" : "bg-muted/10 text-muted"
                            }`}
                          >
                            {scale === "fit" ? "Fit to width" : "Actual size"}
                          </button>
                        ))}
                      </div>
                    </fieldset>

                    <fieldset>
                      <legend className="mb-2 text-sm font-bold">Background</legend>
                      <div className="grid grid-cols-2 gap-2">
                        {(["white", "transparent"] as Background[]).map((background) => (
                          <button
                            key={background}
                            type="button"
                            onClick={() => updateConfig("background", background)}
                            aria-label={`Use ${background} background`}
                            className={`rounded-md px-3 py-2 text-sm font-bold capitalize ${
                              config.background === background ? "bg-emerald-500 text-white" : "bg-muted/10 text-muted"
                            }`}
                          >
                            {background}
                          </button>
                        ))}
                      </div>
                    </fieldset>

                    <fieldset>
                      <legend className="mb-2 text-sm font-bold">Pagination</legend>
                      <div className="grid grid-cols-2 gap-2">
                        {(["auto", "single"] as Pagination[]).map((pagination) => (
                          <button
                            key={pagination}
                            type="button"
                            onClick={() => updateConfig("pagination", pagination)}
                            aria-label={pagination === "auto" ? "Auto-paginate PDF" : "Use single tall page"}
                            className={`rounded-md px-3 py-2 text-sm font-bold ${
                              config.pagination === pagination ? "bg-emerald-500 text-white" : "bg-muted/10 text-muted"
                            }`}
                          >
                            {pagination === "auto" ? "Auto-paginate" : "Single tall page"}
                          </button>
                        ))}
                      </div>
                    </fieldset>

                    <p className="text-sm text-muted">
                      Actual size preserves captured CSS pixels as PDF points and may overflow narrow pages; use Fit to width when page bounds matter.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void generatePdf()}
                    disabled={inputTooLarge}
                    aria-label="Generate PDF"
                    className="mt-7 flex w-full items-center justify-center gap-3 rounded-md bg-emerald-500 px-5 py-3 font-bold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Generate PDF &rarr;
                    <ShortcutHint shortcut="Ctrl+Enter" />
                  </button>
                </div>
              </div>
            )}

            {step === "processing" && (
              <div className="mx-auto flex max-w-lg flex-col items-center py-16 text-center">
                <Loader2 aria-hidden="true" className="mb-6 h-12 w-12 animate-spin text-emerald-500" />
                <h2 className="text-xl font-bold">{processingLabel}</h2>
                <p className="mt-2 text-sm text-muted">This is happening entirely in your browser. Very complex pages can still pause during capture.</p>
              </div>
            )}

            {step === "result" && (
              <div className="mx-auto max-w-2xl py-8 text-center">
                <div className="mx-auto mb-6 inline-flex rounded-full bg-emerald-500/10 px-4 py-2 text-sm font-bold text-emerald-500">
                  {pdfPageCount} page PDF generated
                </div>
                <h2 className="text-2xl font-black">Done! PDF is ready.</h2>
                <SizeComparisonBadge originalSize={htmlBytes} compressedSize={pdfByteLength} />
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                  <button
                    type="button"
                    onClick={downloadPdf}
                    aria-label="Download converted PDF"
                    className="inline-flex items-center justify-center gap-3 rounded-md bg-emerald-500 px-5 py-3 font-bold text-white transition hover:bg-emerald-600"
                  >
                    Download PDF
                    <ShortcutHint shortcut="D" />
                  </button>
                  <button
                    type="button"
                    onClick={editConfig}
                    aria-label="Edit and regenerate PDF"
                    className="rounded-md border border-border px-5 py-3 font-bold"
                  >
                    Edit and regenerate
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
