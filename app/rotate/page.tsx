"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { RotateCw } from "lucide-react";
import { toast } from "sonner";
import AppShell from "../components/AppShell";
import SizeComparisonBadge from "../components/SizeComparisonBadge";
import ShortcutHint from "../components/ShortcutHint";
import { useFileHistory } from "../components/FileHistoryProvider";
import { useProcessorWorker } from "../hooks/useProcessorWorker";
import { formatBytes } from "../lib/format-bytes";
import { getToolDefinition, hasPdfHeader } from "../lib/tool-registry";
import { useCanvasRenderer } from "../hooks/useCanvasRenderer";

type RotateMode = "all" | "single";
type RotateAngle = 90 | 180 | 270;

const TOOL = getToolDefinition("rotate");
const ACCENT = "#10B981";

async function getPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  if (typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }
  return pdfjs;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function normalizeAngle(angle: number): 0 | 90 | 180 | 270 {
  const normalized = ((angle % 360) + 360) % 360;
  if (normalized === 90) return 90;
  if (normalized === 180) return 180;
  if (normalized === 270) return 270;
  return 0;
}

function previewRotationForPage1(mode: RotateMode, selectedPage: number, angle: RotateAngle): number {
  if (mode === "all") return angle;
  if (selectedPage === 1) return angle;
  return 0;
}

export default function RotatePage() {
  const [file, setFile] = useState<File | null>(null);
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [basePageRotation, setBasePageRotation] = useState(0);
  const [mode, setMode] = useState<RotateMode>("all");
  const [selectedPage, setSelectedPage] = useState(1);
  const [angle, setAngle] = useState<RotateAngle>(90);
  const [previewRendering, setPreviewRendering] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const worker = useProcessorWorker();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  // previewTaskRef guards against stale renders when settings change rapidly.
  const previewTaskRef = useRef(0);
  const previewJobIdRef = useRef(0);

  const canvasRenderer = useCanvasRenderer({
    onResult: useCallback((result) => {
      // Each result carries a taskId encoded in its requestId.
      // Only apply if this is still the active task.
      const taskId = parseInt(result.requestId.split("-")[1] ?? "0", 10);
      if (taskId !== previewTaskRef.current) {
        if (result.url) URL.revokeObjectURL(result.url);
        return;
      }
      const canvas = canvasRef.current;
      if (!canvas) {
        if (result.url) URL.revokeObjectURL(result.url);
        setPreviewRendering(false);
        return;
      }
      if (result.url === null) {
        // OffscreenCanvas unavailable — fall back to main-thread render.
        // (pdfBytes and basePageRotation are captured via the renderPreview closure below)
        setPreviewRendering(false);
        return;
      }
      // Draw via an Image element to avoid keeping a canvas around.
      const img = new Image();
      img.onload = () => {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
        ctx?.drawImage(img, 0, 0);
        if (taskId === previewTaskRef.current) setPreviewRendering(false);
      };
      img.onerror = () => {
        if (taskId === previewTaskRef.current) setPreviewRendering(false);
      };
      img.src = result.url;
      // Revoke after the image element has loaded (or immediately on error).
      img.addEventListener("load", () => URL.revokeObjectURL(result.url!), { once: true });
      img.addEventListener("error", () => URL.revokeObjectURL(result.url!), { once: true });
    }, []),
    onError: useCallback((requestId, _pageIndex, reason) => {
      const taskId = parseInt(requestId.split("-")[1] ?? "0", 10);
      if (taskId === previewTaskRef.current) setPreviewRendering(false);
      void reason; // "cancelled" is already filtered by the hook
    }, []),
  });

  const { addFile, pendingFiles, pendingTool, clearPendingFiles } = useFileHistory();

  const resetAll = useCallback(() => {
    setFile(null);
    setPdfBytes(null);
    setPageCount(0);
    setBasePageRotation(0);
    setSelectedPage(1);
    setMode("all");
    setAngle(90);
    worker.reset();
    // Cancel any in-flight preview render.
    canvasRenderer.cancel(previewJobIdRef.current);
    previewJobIdRef.current += 1;
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      canvas.width = 0;
      canvas.height = 0;
    }
  }, [worker, canvasRenderer]);

  const loadPdf = useCallback(
    async (uploaded: File) => {
      worker.reset();

      const valid = await hasPdfHeader(uploaded);
      if (!valid) {
        toast.error("This file is not a valid PDF.", { id: "rotate-load" });
        return;
      }

      setIsLoading(true);
      try {
        const bytes = await uploaded.arrayBuffer();
        const { getDocument } = await getPdfjs();
        const pdf = await getDocument({ data: bytes.slice(0) }).promise;
        const count = pdf.numPages;
        const firstPage = await pdf.getPage(1);
        const existingRotation = firstPage.rotate;
        await pdf.destroy();

        setFile(uploaded);
        setPdfBytes(bytes);
        setPageCount(count);
        setBasePageRotation(existingRotation);
        setSelectedPage(1);
      } catch {
        toast.error("Could not read this PDF. It may be corrupted or password-protected.", {
          id: "rotate-load",
        });
      } finally {
        setIsLoading(false);
      }
    },
    [worker],
  );

  useEffect(() => {
    if (pendingFiles.length > 0 && !file && (!pendingTool || pendingTool === "rotate")) {
      const nextFile = pendingFiles[0];
      queueMicrotask(() => {
        void loadPdf(nextFile);
        clearPendingFiles();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const uploaded = acceptedFiles[0];
      if (uploaded) void loadPdf(uploaded);
    },
    [loadPdf],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: TOOL.input.accept,
    multiple: false,
    maxFiles: 1,
    maxSize: TOOL.input.maxSizeBytes,
    noClick: file !== null,
    noKeyboard: true,
    onDropRejected: (rejections) => {
      const err = rejections[0]?.errors[0];
      if (err?.code === "file-too-large") {
        toast.error("File exceeds the 500 MB limit.");
      } else {
        toast.error(`Only PDF files are accepted. Got: ${rejections[0]?.file.name ?? "unknown"}`);
      }
    },
  });

  const renderPreview = useCallback(() => {
    if (!pdfBytes || !canvasRef.current) return;

    const extraRotation = previewRotationForPage1(mode, selectedPage, angle);
    const displayRotation = normalizeAngle(basePageRotation + extraRotation);
    // Bump counters so the onResult callback can detect stale renders.
    previewTaskRef.current += 1;
    const taskId = previewTaskRef.current;
    previewJobIdRef.current += 1;
    const jobId = previewJobIdRef.current;
    setPreviewRendering(true);

    canvasRenderer.request({
      jobId,
      requestId: `preview-${taskId}`,
      fileBytes: pdfBytes as ArrayBuffer,
      pageIndex: 0,
      targetWidth: Math.ceil(400 * 1.25),
      extraRotation: displayRotation,
    });
  }, [pdfBytes, mode, selectedPage, angle, basePageRotation, canvasRenderer]);

  useEffect(() => {
    if (!pdfBytes || pageCount === 0) return;
    const timer = window.setTimeout(() => {
      void renderPreview();
    }, 150);
    return () => window.clearTimeout(timer);
  }, [pdfBytes, pageCount, mode, selectedPage, angle, basePageRotation, renderPreview]);

  const applyRotation = () => {
    if (!file) return;

    const baseName = file.name.replace(/\.pdf$/i, "") || "document";
    const filename = `rotated-${baseName}.pdf`;

    worker.process(file, {
      tool: "rotate",
      options: { mode, angle, page: selectedPage }
    }, filename);
  };

  useEffect(() => {
    if (worker.status === "done" && worker.resultBlob && worker.resultFilename) {
      toast.success("Done! PDF rotated successfully.", { id: "rotate" });
      addFile({ filename: worker.resultFilename, size: worker.resultBlob.size, timestamp: Date.now(), tool: "rotate" });
      
      const updatePreviewAfterWorker = async () => {
         const bytes = await worker.resultBlob!.arrayBuffer();
         setPdfBytes(bytes);
         const { getDocument } = await getPdfjs();
         const updated = await getDocument({ data: bytes.slice(0) }).promise;
         const firstPage = await updated.getPage(1);
         setBasePageRotation(firstPage.rotate);
         await updated.destroy();
         void renderPreview();
      };
      void updatePreviewAfterWorker();
    } else if (worker.status === "error") {
      toast.error(worker.error || "Something went wrong.", { id: "rotate" });
    }
  }, [worker.status, worker.resultBlob, worker.resultFilename, worker.error, addFile]);

  // Worker lifecycle is now fully managed by useCanvasRenderer — no manual cleanup needed here.

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      if (e.key.toLowerCase() === "u" && !file) {
        e.preventDefault();
        open();
      } else if (e.key.toLowerCase() === "d" && worker.status === "done" && worker.resultBlob) {
        e.preventDefault();
        downloadBlob(worker.resultBlob, worker.resultFilename!);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [file, worker.status, worker.resultBlob, worker.resultFilename, open]);

  const isRotating = worker.status === "processing";
  const isDone = worker.status === "done" && worker.resultBlob !== null;
  const isError = worker.status === "error";
  const hasFile = file !== null && pageCount > 0;
  const canRotate = hasFile && !isRotating;

  const angleButtons: { value: RotateAngle; label: string }[] = [
    { value: 90, label: "90°" },
    { value: 180, label: "180°" },
    { value: 270, label: "270°" },
  ];

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-8">
          <div className="mb-2 flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${ACCENT}1A`, color: ACCENT }}
            >
              <RotateCw className="h-6 w-6" aria-hidden />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Rotate PDF</h1>
          </div>
          <p className="text-muted">Rotate every page or a single page — processed entirely in your browser.</p>
        </div>

        {!hasFile && (
          <div
            {...getRootProps()}
            className={`relative rounded-2xl border-2 border-dashed px-4 py-10 text-center transition sm:py-14 ${
              isDragActive
                ? "border-[#10B981] bg-[#10B981]/5"
                : "border-border bg-card hover:border-[#10B981]/40 hover:bg-[#10B981]/5"
            }`}
          >
            <input {...getInputProps()} aria-label="Upload PDF file" />
            <div
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg"
              style={{ backgroundColor: ACCENT, boxShadow: `0 10px 15px -3px ${ACCENT}40` }}
            >
              <RotateCw className="h-7 w-7" aria-hidden />
            </div>
            <p className="mt-4 text-base font-semibold text-foreground">
              {isDragActive ? "Drop your PDF here" : "Drag & drop a PDF file"}
            </p>
            <p className="mt-1 text-sm text-muted">or</p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  open();
                }}
                className="inline-flex items-center justify-center rounded-xl px-6 py-2.5 text-sm font-semibold text-white shadow-md transition-transform hover:scale-105 active:scale-95"
                style={{ backgroundColor: ACCENT }}
              >
                Browse files
              </button>
              <ShortcutHint shortcut="U" label="Press" />
            </div>
            <p className="mt-4 text-xs text-muted">PDF only. Files stay on your device.</p>
          </div>
        )}

        {isLoading && (
          <div className="mt-6 flex items-center justify-center gap-3 rounded-2xl border border-border bg-card p-6">
            <div
              className="h-5 w-5 animate-spin rounded-full border-2 border-t-transparent"
              style={{ borderColor: `${ACCENT}4D`, borderTopColor: ACCENT }}
              aria-hidden
            />
            <p className="text-sm font-medium text-foreground">Reading PDF…</p>
          </div>
        )}

        {hasFile && file && (
          <>
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm sm:gap-4 sm:p-4">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${ACCENT}1A`, color: ACCENT }}
              >
                <RotateCw className="h-6 w-6" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground sm:text-base">{file.name}</p>
                <p className="text-xs text-muted sm:text-sm">
                  {formatBytes(file.size)} · {pageCount} page{pageCount !== 1 ? "s" : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={resetAll}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-red-500/10 hover:text-red-500"
                aria-label="Remove PDF"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-6 flex rounded-xl border border-border bg-card p-1 shadow-sm" role="tablist" aria-label="Rotation mode">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "all"}
                onClick={() => {
                  setMode("all");
                  worker.reset();
                }}
                className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold transition sm:px-4 ${
                  mode === "all"
                    ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                    : "text-muted hover:text-foreground"
                }`}
              >
                Rotate all pages
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "single"}
                onClick={() => {
                  setMode("single");
                  worker.reset();
                }}
                className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold transition sm:px-4 ${
                  mode === "single"
                    ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                    : "text-muted hover:text-foreground"
                }`}
              >
                Rotate single page
              </button>
            </div>

            <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
              {mode === "single" && (
                <div className="mb-5">
                  <label htmlFor="page-select" className="text-sm font-semibold text-foreground">
                    Page to rotate
                  </label>
                  <select
                    id="page-select"
                    value={selectedPage}
                    onChange={(e) => {
                      setSelectedPage(Number(e.target.value));
                      worker.reset();
                    }}
                    className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm font-medium text-foreground outline-none transition focus:border-[#10B981] focus:ring-2 focus:ring-[#10B981]/20"
                  >
                    {Array.from({ length: pageCount }, (_, i) => i + 1).map((num) => (
                      <option key={num} value={num}>
                        Page {num}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <p className="text-sm font-semibold text-foreground">Rotation angle</p>
              <div className="mt-3 flex flex-wrap gap-3">
                {angleButtons.map((btn) => (
                  <button
                    key={btn.value}
                    type="button"
                    onClick={() => {
                      setAngle(btn.value);
                      worker.reset();
                    }}
                    className={`min-w-[4.5rem] flex-1 rounded-xl border px-4 py-3 text-sm font-bold transition sm:flex-none ${
                      angle === btn.value
                        ? "border-[#10B981] text-white shadow-md"
                        : "border-border bg-background text-foreground hover:border-[#10B981]/50"
                    }`}
                    style={angle === btn.value ? { backgroundColor: ACCENT } : undefined}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">Page 1 preview</p>
                {previewRendering && (
                  <span className="text-xs text-muted">Updating…</span>
                )}
              </div>
              <div className="flex justify-center overflow-auto rounded-xl border border-border bg-background p-3">
                <canvas ref={canvasRef} className="max-h-[420px] max-w-full" aria-label="PDF page 1 preview" />
              </div>
              {mode === "single" && selectedPage !== 1 && (
                <p className="mt-2 text-center text-xs text-muted">
                  Preview shows page 1 unchanged. Page {selectedPage} will rotate when you apply.
                </p>
              )}
            </div>

            <div
              {...getRootProps()}
              className={`mt-4 rounded-xl border border-dashed px-4 py-4 text-center text-sm transition ${
                isDragActive
                  ? "border-[#10B981] bg-[#10B981]/5"
                  : "border-border bg-card text-muted hover:border-[#10B981]/40"
              }`}
            >
              <input {...getInputProps()} aria-label="Replace PDF file" />
              Drop a different PDF to replace this one
            </div>
          </>
        )}

        {isRotating && (
          <div className="mt-8 flex items-center justify-center gap-3 rounded-2xl border border-border bg-card p-6">
            <div
              className="h-5 w-5 animate-spin rounded-full border-2 border-t-transparent"
              style={{ borderColor: `${ACCENT}4D`, borderTopColor: ACCENT }}
              aria-hidden
            />
            <p className="text-sm font-medium text-foreground">{worker.message || "Rotating PDF…"} {worker.progress}%</p>
          </div>
        )}

        {isError && (
          <div className="mt-8 rounded-2xl border border-red-500/30 bg-red-500/5 p-5 shadow-sm">
            <p className="font-semibold text-foreground">Something went wrong</p>
            <p className="mt-1 text-sm text-muted">Please try another PDF or a different rotation setting.</p>
            <button
              type="button"
              onClick={resetAll}
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground transition hover:bg-background"
            >
              Try another file
            </button>
          </div>
        )}

        {isDone && worker.resultBlob && file && (
          <SizeComparisonBadge originalSize={file.size} compressedSize={worker.resultBlob.size} />
        )}

        {hasFile && (
          <div className="mt-8 flex w-full flex-col gap-3 pb-20 sm:flex-row sm:justify-end sm:pb-0">
            {isDone ? (
              <>
                <div className="flex w-full items-center gap-2 sm:w-auto">
                  <button
                    type="button"
                    onClick={() => {
                      if (worker.resultBlob) downloadBlob(worker.resultBlob, worker.resultFilename!);
                    }}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-8 py-3.5 text-base font-semibold text-white shadow-lg transition hover:opacity-90 sm:w-auto"
                    style={{ backgroundColor: ACCENT }}
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12M12 16.5V3"
                      />
                    </svg>
                    Download PDF
                  </button>
                  <ShortcutHint shortcut="D" />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    worker.reset();
                  }}
                  className="inline-flex w-full items-center justify-center rounded-xl border border-border bg-card px-8 py-3.5 text-base font-semibold text-foreground transition hover:bg-accent-light hover:text-accent sm:w-auto"
                >
                  Rotate again
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => void applyRotation()}
                disabled={!canRotate}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-8 py-3.5 text-base font-semibold text-white shadow-lg transition enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                style={{ backgroundColor: ACCENT }}
              >
                <RotateCw className="h-5 w-5" aria-hidden />
                Rotate PDF
              </button>
            )}
          </div>
        )}

        {isDone && (
          <p className="mt-4 text-center text-sm text-muted">
            Ready: <span className="font-medium text-foreground">{worker.resultFilename}</span>
          </p>
        )}
      </main>
    </AppShell>
  );
}
