"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Hash } from "lucide-react";
import { toast } from "sonner";
import AppShell from "../components/AppShell";
import SizeComparisonBadge from "../components/SizeComparisonBadge";
import ShortcutHint from "../components/ShortcutHint";
import { useFileHistory } from "../components/FileHistoryProvider";
import { formatBytes } from "../lib/format-bytes";
import {
  formatLabel,
  getCoordinates,
  type NumberColorKey,
  type NumberFormat,
  type NumberPosition,
} from "../lib/pdf-page-numbers";
import { downloadBlob, renderPdfPageToCanvas, getPdfjs } from "../lib/pdf-utils";
import { useProcessorWorker } from "../hooks/useProcessorWorker";
import { getToolDefinition, hasPdfHeader } from "../lib/tool-registry";

const TOOL = getToolDefinition("pageNumbers");
const ACCENT = "#FF4D4D";

const POSITIONS: { id: NumberPosition; label: string }[] = [
  { id: "top-left", label: "Top Left" },
  { id: "top-center", label: "Top Center" },
  { id: "top-right", label: "Top Right" },
  { id: "bottom-left", label: "Bottom Left" },
  { id: "bottom-center", label: "Bottom Center" },
  { id: "bottom-right", label: "Bottom Right" },
];

const FORMATS: { id: NumberFormat; label: string }[] = [
  { id: "plain", label: "1, 2, 3" },
  { id: "page-of-total", label: "Page 1 of 10" },
  { id: "page-only", label: "Page 1" },
  { id: "n-of-total", label: "1 of 10" },
];

export default function PageNumbersPage() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [position, setPosition] = useState<NumberPosition>("bottom-center");
  const [format, setFormat] = useState<NumberFormat>("plain");
  const [startNumber, setStartNumber] = useState(1);
  const [fontSize, setFontSize] = useState(12);
  const [colorKey, setColorKey] = useState<NumberColorKey>("black");
  const [marginPreset, setMarginPreset] = useState<"small" | "medium" | "large">("medium");
  const [skipFirstPage, setSkipFirstPage] = useState(false);
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(1);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const worker = useProcessorWorker();
  const { addFile, pendingFiles, pendingTool, clearPendingFiles } = useFileHistory();

  const loadPdf = useCallback(async (uploaded: File) => {
    worker.reset();
    const valid = await hasPdfHeader(uploaded);
    if (!valid) {
      toast.error("Invalid PDF.", { id: "pagenum-load" });
      return;
    }
    try {
      const bytes = await uploaded.arrayBuffer();
      const { getDocument } = await getPdfjs();
      const pdf = await getDocument({ data: bytes.slice(0) }).promise;
      const count = pdf.numPages;
      const canvas = document.createElement("canvas");
      await renderPdfPageToCanvas(bytes, 1, canvas);
      offscreenCanvasRef.current = canvas;
      
      setFile(uploaded);
      setPageCount(count);
      setRangeEnd(count);
      await pdf.destroy();
    } catch {
      toast.error("Could not read PDF.", { id: "pagenum-load" });
    }
  }, [worker]);

  useEffect(() => {
    if (pendingFiles.length > 0 && !file && (!pendingTool || pendingTool === "pageNumbers")) {
      queueMicrotask(() => {
        void loadPdf(pendingFiles[0]);
        clearPendingFiles();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: (f) => f[0] && void loadPdf(f[0]),
    accept: TOOL.input.accept,
    multiple: false,
    maxSize: TOOL.input.maxSizeBytes,
    noClick: file !== null,
    noKeyboard: true,
  });

  const updatePreview = useCallback(() => {
    if (!offscreenCanvasRef.current || !canvasRef.current) return;
    const base = offscreenCanvasRef.current;
    const canvas = canvasRef.current;
    canvas.width = base.width;
    canvas.height = base.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    ctx.drawImage(base, 0, 0);

    if (skipFirstPage || (useCustomRange && rangeStart > 1)) return;

    const scale = 1.25; // Default scale from renderPdfPageToCanvas
    const label = formatLabel(startNumber, pageCount, format);
    ctx.font = `${fontSize * scale}px Helvetica, Arial, sans-serif`;
    const textWidth = ctx.measureText(label).width;
    const marginPt = marginPreset === "small" ? 8 : marginPreset === "medium" ? 14 : 22;
    const marginPx = ((marginPt * 72) / 25.4) * scale;

    const { x: visualX, y: visualY } = getCoordinates(position, canvas.width, canvas.height, textWidth, fontSize * scale, marginPx);

    const canvasX = visualX;
    const canvasY = canvas.height - visualY;

    if (colorKey === "gray") ctx.fillStyle = "gray";
    else if (colorKey === "black") ctx.fillStyle = "black";
    else if (colorKey === "white") ctx.fillStyle = "white";
    
    ctx.fillText(label, canvasX, canvasY);
  }, [position, format, startNumber, fontSize, colorKey, marginPreset, skipFirstPage, useCustomRange, rangeStart, pageCount, file]);

  const { reset } = worker;
  useEffect(() => {
    reset();
  }, [position, format, startNumber, fontSize, colorKey, marginPreset, skipFirstPage, useCustomRange, rangeStart, rangeEnd, reset]);

  useEffect(() => {
    updatePreview();
  }, [updatePreview]);

  const handleApply = () => {
    if (!file) return;

    if (useCustomRange && rangeStart > rangeEnd) {
      toast.error("Invalid page range: start cannot be greater than end.", { id: "pagenum-val" });
      return;
    }

    const base = file.name.replace(/\.pdf$/i, "") || "document";
    const filename = `numbered-${base}.pdf`;

    worker.process(file, {
      tool: "page-numbers",
      options: {
        position,
        format,
        startNumber,
        fontSize,
        colorKey,
        marginPreset,
        skipFirstPage,
        useCustomRange,
        rangeStart,
        rangeEnd,
      }
    }, filename);
  };

  useEffect(() => {
    if (worker.status === "processing") toast.loading(worker.message || "Adding page numbers...", { id: "pagenum" });
    else if (worker.status === "done" && worker.resultBlob) {
      toast.success("Done! Page numbers added.", { id: "pagenum" });
      addFile({ filename: worker.resultFilename!, size: worker.resultBlob.size, timestamp: Date.now(), tool: "pageNumbers" });
    }
    else if (worker.status === "error") toast.error(worker.error || "Something went wrong.", { id: "pagenum" });
  }, [worker.status, worker.message, worker.error, worker.resultBlob, worker.resultFilename, addFile]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key.toLowerCase() === "u" && !file) {
        e.preventDefault();
        open();
      } else if (e.key.toLowerCase() === "d" && worker.status === "done" && worker.resultBlob) {
        e.preventDefault();
        downloadBlob(worker.resultBlob, worker.resultFilename!);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [file, worker.status, worker.resultBlob, worker.resultFilename, open]);

  const hasFile = file && pageCount > 0;
  const isDone = worker.status === "done" && worker.resultBlob;

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: `${ACCENT}1A`, color: ACCENT }}>
            <Hash className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Add Page Numbers</h1>
            <p className="text-muted">Stamp page numbers anywhere on your PDF.</p>
          </div>
        </div>

        {!hasFile && (
          <div
            {...getRootProps()}
            className={`rounded-2xl border-2 border-dashed py-12 text-center ${isDragActive ? "" : "border-border bg-card"}`}
            style={isDragActive ? { borderColor: ACCENT, backgroundColor: `${ACCENT}0D` } : undefined}
          >
            <input {...getInputProps()} />
            <p className="font-semibold text-foreground">Drag & drop a PDF</p>
            <button type="button" onClick={() => open()} className="mt-4 rounded-xl px-6 py-2 text-sm font-semibold text-white" style={{ backgroundColor: ACCENT }}>
              Browse
            </button>
            <div className="mt-3 flex justify-center">
              <ShortcutHint shortcut="U" />
            </div>
          </div>
        )}

        {hasFile && (
          <>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="truncate font-semibold">{file.name}</p>
              <p className="text-xs text-muted">
                {formatBytes(file.size)} · {pageCount} pages
              </p>
            </div>

            <div className="mt-6 rounded-2xl border border-border bg-card p-5">
              <p className="text-sm font-semibold text-foreground">Position</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {POSITIONS.map((pos) => (
                  <button
                    key={pos.id}
                    type="button"
                    onClick={() => setPosition(pos.id)}
                    className={`rounded-lg border px-2 py-3 text-xs font-semibold transition ${
                      position === pos.id ? "text-white" : "border-border bg-background text-muted"
                    }`}
                    style={position === pos.id ? { backgroundColor: ACCENT, borderColor: ACCENT } : undefined}
                  >
                    {pos.label}
                  </button>
                ))}
              </div>

              <p className="mt-5 text-sm font-semibold">Format</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {FORMATS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFormat(f.id)}
                    className={`rounded-lg border px-3 py-2 text-left text-sm font-medium ${
                      format === f.id ? "border-[#FF4D4D] ring-2 ring-[#FF4D4D]/30" : "border-border"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-semibold">Starting number</label>
                  <input
                    type="number"
                    min={1}
                    value={startNumber}
                    onChange={(e) => setStartNumber(Number(e.target.value))}
                    className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold">Font size</label>
                  <select value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm">
                    {[8, 10, 12, 14].map((s) => (
                      <option key={s} value={s}>
                        {s}px
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <p className="mt-4 text-sm font-semibold">Color</p>
              <div className="mt-2 flex gap-2">
                {(["black", "gray", "white"] as NumberColorKey[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColorKey(c)}
                    className={`rounded-lg border px-4 py-2 text-sm capitalize ${
                      colorKey === c ? "ring-2 ring-[#FF4D4D]/40" : "border-border"
                    }`}
                    style={colorKey === c ? { borderColor: ACCENT } : undefined}
                  >
                    {c}
                  </button>
                ))}
              </div>

              <div className="mt-4">
                <label className="text-sm font-semibold">Margin from edge</label>
                <select
                  value={marginPreset}
                  onChange={(e) => setMarginPreset(e.target.value as "small" | "medium" | "large")}
                  className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                >
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                </select>
              </div>

              <label className="mt-4 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={skipFirstPage} onChange={(e) => setSkipFirstPage(e.target.checked)} />
                Skip first page (cover page)
              </label>

              <label className="mt-3 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={useCustomRange} onChange={(e) => setUseCustomRange(e.target.checked)} />
                Apply only to page range
              </label>

              {useCustomRange && (
                <div className="mt-3 flex gap-3">
                  <input type="number" min={1} max={pageCount} value={rangeStart} onChange={(e) => setRangeStart(Number(e.target.value))} className="w-24 rounded-lg border border-border px-2 py-2 text-center text-sm" />
                  <span className="self-center text-muted">to</span>
                  <input type="number" min={1} max={pageCount} value={rangeEnd} onChange={(e) => setRangeEnd(Number(e.target.value))} className="w-24 rounded-lg border border-border px-2 py-2 text-center text-sm" />
                </div>
              )}
            </div>

            <div className="mt-6 rounded-2xl border border-border bg-card p-4">
              <p className="text-sm font-semibold">Page 1 preview</p>
              <div className="mt-3 flex justify-center overflow-auto rounded-xl border border-border bg-background p-3">
                <canvas ref={canvasRef} className="max-h-[360px] max-w-full" />
              </div>
            </div>
          </>
        )}

        {isDone && file && worker.resultBlob && <SizeComparisonBadge originalSize={file.size} compressedSize={worker.resultBlob.size} />}

        {hasFile && (
          <div className="mt-8 flex flex-col gap-3 pb-20 sm:flex-row sm:justify-end sm:pb-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => (isDone && worker.resultBlob ? downloadBlob(worker.resultBlob, worker.resultFilename!) : void handleApply())}
                disabled={worker.status === "processing"}
                className="rounded-xl px-8 py-3.5 font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: ACCENT }}
              >
                {isDone ? "Download PDF" : "Add page numbers"}
              </button>
              <ShortcutHint shortcut={isDone ? "D" : "U"} />
            </div>
          </div>
        )}
      </main>
    </AppShell>
  );
}
