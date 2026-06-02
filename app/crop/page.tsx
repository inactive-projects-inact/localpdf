"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Crop } from "lucide-react";
import { toast } from "sonner";
import AppShell from "../components/AppShell";
import SizeComparisonBadge from "../components/SizeComparisonBadge";
import ShortcutHint from "../components/ShortcutHint";
import { useFileHistory } from "../components/FileHistoryProvider";
import { formatBytes } from "../lib/format-bytes";
import {
  applyCropPreset,
  cropPdf,
  validateCropMargins,
  type CropMarginsMm,
  type CropScopeMode,
} from "../lib/pdf-crop";
import { downloadBlob, renderPdfPageToCanvas } from "../lib/pdf-utils";
import { getToolDefinition, hasPdfHeader } from "../lib/tool-registry";

const TOOL = getToolDefinition("crop");
const ACCENT = "#F59E0B";

function MarginDiagram({ margins, accent }: { margins: CropMarginsMm; accent: string }) {
  const max = Math.max(margins.top, margins.bottom, margins.left, margins.right, 1);
  const topPct = (margins.top / max) * 28;
  const bottomPct = (margins.bottom / max) * 28;
  const leftPct = (margins.left / max) * 28;
  const rightPct = (margins.right / max) * 28;

  return (
    <svg viewBox="0 0 120 160" className="mx-auto h-40 w-28" aria-hidden>
      <rect x="8" y="8" width="104" height="144" fill="var(--card)" stroke="var(--border)" strokeWidth="2" rx="4" />
      <rect
        x={8 + leftPct}
        y={8 + topPct}
        width={104 - leftPct - rightPct}
        height={144 - topPct - bottomPct}
        fill={`${accent}22`}
        stroke={accent}
        strokeWidth="2"
        strokeDasharray="4 2"
      />
      {margins.top > 0 && (
        <rect x="8" y="8" width="104" height={topPct} fill={accent} opacity="0.35" />
      )}
      {margins.bottom > 0 && (
        <rect x="8" y={152 - bottomPct} width="104" height={bottomPct} fill={accent} opacity="0.35" />
      )}
      {margins.left > 0 && (
        <rect x="8" y="8" width={leftPct} height="144" fill={accent} opacity="0.25" />
      )}
      {margins.right > 0 && (
        <rect x={112 - rightPct} y="8" width={rightPct} height="144" fill={accent} opacity="0.25" />
      )}
    </svg>
  );
}

export default function CropPage() {
  const [file, setFile] = useState<File | null>(null);
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageWidth, setPageWidth] = useState(595);
  const [pageHeight, setPageHeight] = useState(842);
  const [mode, setMode] = useState<CropScopeMode>("all");
  const [singlePage, setSinglePage] = useState(1);
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(1);
  const [margins, setMargins] = useState<CropMarginsMm>({ top: 10, bottom: 10, left: 10, right: 10 });
  const [status, setStatus] = useState<"idle" | "loading" | "processing" | "done" | "error">("idle");
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultFilename, setResultFilename] = useState("cropped.pdf");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewTaskRef = useRef(0);
  const { addFile, pendingFiles, pendingTool, clearPendingFiles } = useFileHistory();

  const validateRange = useCallback((): string | null => {
    if (mode === "single" && (singlePage < 1 || singlePage > pageCount)) return `Page must be 1–${pageCount}.`;
    if (mode === "range") {
      if (rangeStart < 1 || rangeEnd > pageCount || rangeStart > rangeEnd) return "Invalid page range.";
    }
    if (!validateCropMargins(pageWidth, pageHeight, margins)) {
      return "Invalid crop values. Margins cannot exceed page dimensions.";
    }
    return null;
  }, [mode, singlePage, rangeStart, rangeEnd, pageCount, pageWidth, pageHeight, margins]);

  const loadPdf = useCallback(async (uploaded: File) => {
    setStatus("loading");
    const valid = await hasPdfHeader(uploaded);
    if (!valid) {
      setStatus("error");
      return;
    }
    try {
      const { PDFDocument } = await import("pdf-lib");
      const bytes = await uploaded.arrayBuffer();
      const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const count = pdf.getPageCount();
      const size = pdf.getPage(0).getSize();
      setFile(uploaded);
      setPdfBytes(bytes);
      setPageCount(count);
      setPageWidth(size.width);
      setPageHeight(size.height);
      setRangeEnd(count);
      setStatus("idle");
    } catch {
      setStatus("error");
      toast.error("Could not read PDF.");
    }
  }, []);

  useEffect(() => {
    if (pendingFiles.length > 0 && !file && (!pendingTool || pendingTool === "crop")) {
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

  const updatePreview = useCallback(async () => {
    if (!pdfBytes || !canvasRef.current || validateRange()) return;
    const taskId = ++previewTaskRef.current;
    try {
      const result = await cropPdf({ pdfBytes, mode, singlePage, rangeStart, rangeEnd, margins });
      if (taskId !== previewTaskRef.current) return;
      await renderPdfPageToCanvas(new Uint8Array(result).slice().buffer, 1, canvasRef.current);
    } catch {
      if (pdfBytes) await renderPdfPageToCanvas(pdfBytes, 1, canvasRef.current);
    }
  }, [pdfBytes, mode, singlePage, rangeStart, rangeEnd, margins, validateRange]);

  useEffect(() => {
    if (!pdfBytes) return;
    const t = window.setTimeout(() => void updatePreview(), 200);
    return () => window.clearTimeout(t);
  }, [pdfBytes, updatePreview]);

  const applyPreset = (preset: "header" | "footer" | "sides" | "square") => {
    setMargins(applyCropPreset(preset, pageWidth, pageHeight));
  };

  const handleCrop = async () => {
    if (!pdfBytes || !file) return;
    const err = validateRange();
    if (err) {
      toast.error(err.includes("Invalid crop") ? err : "Invalid page range. Please check your inputs.", { id: "crop" });
      return;
    }

    setStatus("processing");
    toast.loading("Cropping PDF...", { id: "crop" });
    try {
      const result = await cropPdf({ pdfBytes, mode, singlePage, rangeStart, rangeEnd, margins });
      const blob = new Blob([new Uint8Array(result)], { type: "application/pdf" });
      const base = file.name.replace(/\.pdf$/i, "") || "document";
      const filename = `cropped-${base}.pdf`;
      setResultBlob(blob);
      setResultFilename(filename);
      setStatus("done");
      toast.success("Done! PDF cropped successfully.", { id: "crop" });
      addFile({ filename, size: blob.size, timestamp: Date.now(), tool: "crop" });
    } catch (e) {
      setStatus("error");
      const msg = e instanceof Error && e.message === "Invalid crop values"
        ? "Invalid crop values. Margins cannot exceed page dimensions."
        : "Something went wrong. Please try again.";
      toast.error(msg, { id: "crop" });
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
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

  const hasFile = file && pageCount > 0;
  const isDone = status === "done" && resultBlob;

  const setMargin = (key: keyof CropMarginsMm, value: number) => {
    setMargins((m) => ({ ...m, [key]: Math.max(0, value) }));
  };

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: `${ACCENT}1A`, color: ACCENT }}>
            <Crop className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Crop PDF</h1>
            <p className="text-muted">Trim margins from all or selected pages.</p>
          </div>
        </div>

        {!hasFile && (
          <div
            {...getRootProps()}
            className={`rounded-2xl border-2 border-dashed py-12 text-center ${!isDragActive && "border-border bg-card"}`}
            style={isDragActive ? { borderColor: ACCENT, backgroundColor: `${ACCENT}0D` } : undefined}
          >
            <input {...getInputProps()} />
            <p className="font-semibold">Drag & drop a PDF</p>
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
            <div className="rounded-xl border border-border bg-card p-4 text-sm">
              <p className="font-semibold truncate">{file.name}</p>
              <p className="text-muted">
                {formatBytes(file.size)} · {pageCount} pages
              </p>
            </div>

            <div className="mt-6 flex rounded-xl border border-border bg-card p-1">
              {(["all", "single", "range"] as CropScopeMode[]).map((m, i) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`flex-1 rounded-lg py-2.5 text-xs font-semibold sm:text-sm ${mode === m ? "bg-background ring-1 ring-border" : "text-muted"}`}
                >
                  {["All pages", "Single page", "Page range"][i]}
                </button>
              ))}
            </div>

            {mode === "single" && (
              <input
                type="number"
                min={1}
                max={pageCount}
                value={singlePage}
                onChange={(e) => setSinglePage(Number(e.target.value))}
                className="mt-4 w-full rounded-xl border border-border px-3 py-2.5 text-center"
                aria-label="Page number"
              />
            )}
            {mode === "range" && (
              <div className="mt-4 flex justify-center gap-3">
                <input type="number" min={1} max={pageCount} value={rangeStart} onChange={(e) => setRangeStart(Number(e.target.value))} className="w-24 rounded-lg border border-border py-2 text-center" />
                <span className="self-center">—</span>
                <input type="number" min={1} max={pageCount} value={rangeEnd} onChange={(e) => setRangeEnd(Number(e.target.value))} className="w-24 rounded-lg border border-border py-2 text-center" />
              </div>
            )}

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card p-5">
                <p className="text-sm font-semibold">Crop margins (mm)</p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {(["top", "bottom", "left", "right"] as const).map((side) => (
                    <div key={side}>
                      <label className="text-xs capitalize text-muted">{side}</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={margins[side]}
                        onChange={(e) => setMargin(side, Number(e.target.value))}
                        className="mt-1 w-full rounded-lg border border-border px-2 py-2 text-sm"
                      />
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-sm font-semibold">Presets</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[
                    { id: "header" as const, label: "Remove Header" },
                    { id: "footer" as const, label: "Remove Footer" },
                    { id: "sides" as const, label: "Remove Side Margins" },
                    { id: "square" as const, label: "Square Crop" },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applyPreset(p.id)}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:border-[#F59E0B]"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-card p-5">
                <p className="text-center text-sm font-semibold">Margin preview</p>
                <MarginDiagram margins={margins} accent={ACCENT} />
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-border bg-card p-4">
              <p className="text-sm font-semibold">Page 1 preview</p>
              <div className="mt-3 flex justify-center overflow-auto rounded-xl border border-border bg-background p-3">
                <canvas ref={canvasRef} className="max-h-[360px] max-w-full" />
              </div>
            </div>
          </>
        )}

        {isDone && file && resultBlob && <SizeComparisonBadge originalSize={file.size} compressedSize={resultBlob.size} />}

        {hasFile && (
          <div className="mt-8 flex items-center gap-2 pb-20 sm:justify-end sm:pb-0">
            <button
              type="button"
              disabled={status === "processing"}
              onClick={() => (isDone && resultBlob ? downloadBlob(resultBlob, resultFilename) : void handleCrop())}
              className="rounded-xl px-8 py-3.5 font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: ACCENT }}
            >
              {isDone ? "Download PDF" : "Crop PDF"}
            </button>
            <ShortcutHint shortcut={isDone ? "D" : "U"} />
          </div>
        )}
      </main>
    </AppShell>
  );
}
