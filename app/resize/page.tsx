"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Maximize2 } from "lucide-react";
import { toast } from "sonner";
import AppShell from "../components/AppShell";
import SizeComparisonBadge from "../components/SizeComparisonBadge";
import ShortcutHint from "../components/ShortcutHint";
import { useFileHistory } from "../components/FileHistoryProvider";
import { formatBytes } from "../lib/format-bytes";
import { resizePdf, type ResizeScopeMode } from "../lib/pdf-resize";
import {
  downloadBlob,
  renderPdfPageToCanvas,
  type Orientation,
  type PageSizeKey,
} from "../lib/pdf-utils";
import { getToolDefinition, hasPdfHeader } from "../lib/tool-registry";

const TOOL = getToolDefinition("resize");
const ACCENT = "#3B82F6";

type Status = "idle" | "loading" | "processing" | "done" | "error";

export default function ResizePage() {
  const [file, setFile] = useState<File | null>(null);
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [mode, setMode] = useState<ResizeScopeMode>("all");
  const [singlePage, setSinglePage] = useState(1);
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeKey>("A4");
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [customWidthMm, setCustomWidthMm] = useState(210);
  const [customHeightMm, setCustomHeightMm] = useState(297);
  const [scaleContent, setScaleContent] = useState(true);
  const [status, setStatus] = useState<Status>("idle");
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultFilename, setResultFilename] = useState("resized.pdf");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewTaskRef = useRef(0);
  const { addFile, pendingFiles, pendingTool, clearPendingFiles } = useFileHistory();

  const validateRange = useCallback((): string | null => {
    if (mode === "single") {
      if (singlePage < 1 || singlePage > pageCount) return `Page must be between 1 and ${pageCount}.`;
      return null;
    }
    if (mode === "range") {
      if (rangeStart < 1 || rangeEnd < 1) return "Page numbers must be at least 1.";
      if (rangeStart > pageCount || rangeEnd > pageCount) return `Pages must be between 1 and ${pageCount}.`;
      if (rangeStart > rangeEnd) return "Start page must be less than or equal to end page.";
      return null;
    }
    return null;
  }, [mode, singlePage, rangeStart, rangeEnd, pageCount]);

  const resetAll = useCallback(() => {
    setFile(null);
    setPdfBytes(null);
    setPageCount(0);
    setStatus("idle");
    setResultBlob(null);
  }, []);

  const loadPdf = useCallback(async (uploaded: File) => {
    setStatus("loading");
    setResultBlob(null);
    const valid = await hasPdfHeader(uploaded);
    if (!valid) {
      setStatus("error");
      toast.error("This file is not a valid PDF.", { id: "resize-load" });
      return;
    }
    try {
      const { PDFDocument } = await import("pdf-lib");
      const bytes = await uploaded.arrayBuffer();
      const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const count = pdf.getPageCount();
      setFile(uploaded);
      setPdfBytes(bytes);
      setPageCount(count);
      setSinglePage(1);
      setRangeStart(1);
      setRangeEnd(count);
      setStatus("idle");
    } catch {
      setStatus("error");
      toast.error("Could not read this PDF.", { id: "resize-load" });
    }
  }, []);

  useEffect(() => {
    if (pendingFiles.length > 0 && !file && (!pendingTool || pendingTool === "resize")) {
      const next = pendingFiles[0];
      queueMicrotask(() => {
        void loadPdf(next);
        clearPendingFiles();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDrop = useCallback(
    (accepted: File[]) => {
      const f = accepted[0];
      if (f) void loadPdf(f);
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
    onDropRejected: () => toast.error("Only PDF files up to 500 MB are accepted."),
  });

  const updatePreview = useCallback(async () => {
    if (!pdfBytes || !canvasRef.current) return;
    const err = validateRange();
    if (err) return;

    const taskId = ++previewTaskRef.current;
    try {
      const resized = await resizePdf({
        pdfBytes,
        mode,
        singlePage,
        rangeStart,
        rangeEnd,
        pageSize,
        orientation,
        customWidthMm,
        customHeightMm,
        scaleContent,
      });
      if (taskId !== previewTaskRef.current) return;
      const buf = new Uint8Array(resized).slice().buffer;
      await renderPdfPageToCanvas(buf, 1, canvasRef.current);
    } catch {
      if (taskId === previewTaskRef.current) {
        await renderPdfPageToCanvas(pdfBytes, 1, canvasRef.current);
      }
    }
  }, [
    pdfBytes,
    mode,
    singlePage,
    rangeStart,
    rangeEnd,
    pageSize,
    orientation,
    customWidthMm,
    customHeightMm,
    scaleContent,
    validateRange,
  ]);

  useEffect(() => {
    if (!pdfBytes || pageCount === 0) return;
    const t = window.setTimeout(() => void updatePreview(), 200);
    return () => window.clearTimeout(t);
  }, [pdfBytes, pageCount, updatePreview]);

  const handleResize = async () => {
    if (!pdfBytes || !file) return;
    const err = validateRange();
    if (err) {
      toast.error("Invalid page range. Please check your inputs.", { id: "resize" });
      return;
    }

    setStatus("processing");
    setResultBlob(null);
    toast.loading("Resizing PDF...", { id: "resize" });

    try {
      const result = await resizePdf({
        pdfBytes,
        mode,
        singlePage,
        rangeStart,
        rangeEnd,
        pageSize,
        orientation,
        customWidthMm,
        customHeightMm,
        scaleContent,
      });
      const blob = new Blob([new Uint8Array(result)], { type: "application/pdf" });
      const base = file.name.replace(/\.pdf$/i, "") || "document";
      const filename = `resized-${base}.pdf`;
      setResultBlob(blob);
      setResultFilename(filename);
      setStatus("done");
      toast.success("Done! PDF resized successfully.", { id: "resize" });
      addFile({ filename, size: blob.size, timestamp: Date.now(), tool: "resize" });
    } catch {
      setStatus("error");
      toast.error("Something went wrong. Please try again.", { id: "resize" });
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key.toLowerCase() === "u" && !file) {
        e.preventDefault();
        open();
      } else if (e.key.toLowerCase() === "d" && status === "done" && resultBlob) {
        e.preventDefault();
        downloadBlob(resultBlob, resultFilename);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [file, status, resultBlob, resultFilename, open]);

  const hasFile = file !== null && pageCount > 0;
  const isDone = status === "done" && resultBlob !== null;
  const rangeError = hasFile ? validateRange() : null;

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <Header icon={Maximize2} title="Resize PDF" subtitle="Change page dimensions for all, one, or a range of pages." accent={ACCENT} />

        {!hasFile && (
          <DropZone
            accent={ACCENT}
            getRootProps={getRootProps}
            getInputProps={getInputProps}
            isDragActive={isDragActive}
            open={open}
          />
        )}

        {status === "loading" && <LoadingState accent={ACCENT} label="Reading PDF…" />}

        {hasFile && file && (
          <>
            <FileBar file={file} pageCount={pageCount} accent={ACCENT} onRemove={resetAll} />

            <ModeTabs
              mode={mode}
              onChange={(m) => {
                setMode(m);
                setResultBlob(null);
                setStatus("idle");
              }}
              labels={["All pages", "Single page", "Page range"]}
              modes={["all", "single", "range"]}
            />

            <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
              {mode === "single" && (
                <NumberField
                  label="Page number"
                  value={singlePage}
                  min={1}
                  max={pageCount}
                  onChange={(v) => {
                    setSinglePage(v);
                    setResultBlob(null);
                  }}
                />
              )}
              {mode === "range" && (
                <div className="flex items-center justify-center gap-3">
                  <NumberField label="Start" value={rangeStart} min={1} max={pageCount} onChange={setRangeStart} compact />
                  <span className="text-muted">—</span>
                  <NumberField label="End" value={rangeEnd} min={1} max={pageCount} onChange={setRangeEnd} compact />
                </div>
              )}

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-semibold text-foreground">Page size</label>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(e.target.value as PageSizeKey)}
                    className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                  >
                    {(["A4", "A3", "A5", "Letter", "Legal", "Tabloid", "Custom"] as PageSizeKey[]).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-semibold text-foreground">Orientation</label>
                  <div className="mt-2 flex gap-2">
                    {(["portrait", "landscape"] as Orientation[]).map((o) => (
                      <button
                        key={o}
                        type="button"
                        onClick={() => setOrientation(o)}
                        className={`flex-1 rounded-lg py-2 text-sm font-semibold capitalize ${
                          orientation === o ? "text-white" : "border border-border bg-background"
                        }`}
                        style={orientation === o ? { backgroundColor: ACCENT } : undefined}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {pageSize === "Custom" && (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <NumberField label="Width (mm)" value={customWidthMm} min={50} max={1000} onChange={setCustomWidthMm} />
                  <NumberField label="Height (mm)" value={customHeightMm} min={50} max={1000} onChange={setCustomHeightMm} />
                </div>
              )}

              <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={scaleContent}
                  onChange={(e) => setScaleContent(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                Scale content to fit new size
              </label>
            </div>

            <PreviewPanel accent={ACCENT} canvasRef={canvasRef} />

            <div {...getRootProps()} className="mt-4 rounded-xl border border-dashed border-border bg-card px-4 py-4 text-center text-sm text-muted">
              <input {...getInputProps()} />
              Drop a different PDF to replace
            </div>
          </>
        )}

        {status === "processing" && <LoadingState accent={ACCENT} label="Resizing PDF…" />}
        {isDone && resultBlob && file && <SizeComparisonBadge originalSize={file.size} compressedSize={resultBlob.size} />}

        {hasFile && (
          <ActionBar
            accent={ACCENT}
            isDone={isDone}
            disabled={status === "processing" || !!rangeError}
            onPrimary={() => (isDone && resultBlob ? downloadBlob(resultBlob, resultFilename) : void handleResize())}
            onSecondary={() => {
              setResultBlob(null);
              setStatus("idle");
            }}
            primaryLabel={isDone ? "Download PDF" : "Resize PDF"}
            showDownload={isDone}
          />
        )}
      </main>
    </AppShell>
  );
}

function Header({
  icon: Icon,
  title,
  subtitle,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  accent: string;
}) {
  return (
    <div className="mb-8">
      <div className="mb-2 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: `${accent}1A`, color: accent }}>
          <Icon className="h-6 w-6" aria-hidden />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h1>
      </div>
      <p className="text-muted">{subtitle}</p>
    </div>
  );
}

function DropZone({
  accent,
  getRootProps,
  getInputProps,
  isDragActive,
  open,
}: {
  accent: string;
  getRootProps: () => Record<string, unknown>;
  getInputProps: () => Record<string, unknown>;
  isDragActive: boolean;
  open: () => void;
}) {
  return (
    <div
      {...getRootProps()}
      className={`rounded-2xl border-2 border-dashed px-4 py-10 text-center sm:py-14 ${
        isDragActive ? "bg-opacity-5" : "border-border bg-card hover:bg-opacity-5"
      }`}
      style={{ borderColor: isDragActive ? accent : undefined, backgroundColor: isDragActive ? `${accent}0D` : undefined }}
    >
      <input {...getInputProps()} aria-label="Upload PDF" />
      <p className="mt-4 font-semibold text-foreground">{isDragActive ? "Drop PDF here" : "Drag & drop a PDF"}</p>
      <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            open();
          }}
          className="rounded-xl px-6 py-2.5 text-sm font-semibold text-white"
          style={{ backgroundColor: accent }}
        >
          Browse files
        </button>
        <ShortcutHint shortcut="U" label="Press" />
      </div>
    </div>
  );
}

function FileBar({
  file,
  pageCount,
  accent,
  onRemove,
}: {
  file: File;
  pageCount: number;
  accent: string;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex h-11 w-11 items-center justify-center rounded-lg" style={{ backgroundColor: `${accent}1A`, color: accent }}>
        <Maximize2 className="h-6 w-6" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-foreground">{file.name}</p>
        <p className="text-xs text-muted">
          {formatBytes(file.size)} · {pageCount} page{pageCount !== 1 ? "s" : ""}
        </p>
      </div>
      <button type="button" onClick={onRemove} className="text-muted hover:text-red-500" aria-label="Remove">
        ×
      </button>
    </div>
  );
}

function ModeTabs<T extends string>({
  mode,
  onChange,
  labels,
  modes,
}: {
  mode: T;
  onChange: (m: T) => void;
  labels: string[];
  modes: T[];
}) {
  return (
    <div className="mt-6 flex rounded-xl border border-border bg-card p-1" role="tablist">
      {modes.map((m, i) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={mode === m}
          onClick={() => onChange(m)}
          className={`flex-1 rounded-lg px-2 py-2.5 text-xs font-semibold sm:text-sm ${
            mode === m ? "bg-background shadow-sm ring-1 ring-border" : "text-muted"
          }`}
        >
          {labels[i]}
        </button>
      ))}
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
  compact,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "" : "mt-2"}>
      <label className="sr-only">{label}</label>
      {!compact && <p className="text-sm font-semibold text-foreground">{label}</p>}
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`${compact ? "w-24" : "w-full"} mt-1 rounded-xl border border-border bg-background px-3 py-2.5 text-center text-sm font-semibold`}
        aria-label={label}
      />
    </div>
  );
}

function PreviewPanel({ accent, canvasRef }: { accent: string; canvasRef: React.RefObject<HTMLCanvasElement | null> }) {
  return (
    <div className="mt-6 rounded-2xl border border-border bg-card p-4">
      <p className="text-sm font-semibold text-foreground">Page 1 preview</p>
      <div className="mt-3 flex justify-center overflow-auto rounded-xl border border-border bg-background p-3">
        <canvas ref={canvasRef} className="max-h-[360px] max-w-full" />
      </div>
      <p className="mt-2 text-center text-xs" style={{ color: accent }}>
        Live preview of resize settings
      </p>
    </div>
  );
}

function LoadingState({ accent, label }: { accent: string; label: string }) {
  return (
    <div className="mt-6 flex items-center justify-center gap-3 rounded-2xl border border-border bg-card p-6">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: `${accent}4D`, borderTopColor: accent }} />
      <p className="text-sm font-medium">{label}</p>
    </div>
  );
}

function ActionBar({
  accent,
  isDone,
  disabled,
  onPrimary,
  onSecondary,
  primaryLabel,
  showDownload,
}: {
  accent: string;
  isDone: boolean;
  disabled: boolean;
  onPrimary: () => void;
  onSecondary: () => void;
  primaryLabel: string;
  showDownload: boolean;
}) {
  return (
    <div className="mt-8 flex flex-col gap-3 pb-20 sm:flex-row sm:justify-end sm:pb-0">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled && !isDone}
          onClick={onPrimary}
          className="inline-flex w-full items-center justify-center rounded-xl px-8 py-3.5 text-base font-semibold text-white shadow-lg disabled:opacity-50 sm:w-auto"
          style={{ backgroundColor: accent }}
        >
          {primaryLabel}
        </button>
        {showDownload && <ShortcutHint shortcut="D" />}
        {!showDownload && <ShortcutHint shortcut="U" label="Upload" />}
      </div>
      {isDone && (
        <button type="button" onClick={onSecondary} className="rounded-xl border border-border bg-card px-8 py-3.5 font-semibold">
          Resize again
        </button>
      )}
    </div>
  );
}
