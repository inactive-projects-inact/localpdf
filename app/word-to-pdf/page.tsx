"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import Link from "next/link";
import { ChevronRight, FileType, Upload, Download, Home } from "lucide-react";
import AppShell from "../components/AppShell";
import ShortcutHint from "../components/ShortcutHint";
import SizeComparisonBadge from "../components/SizeComparisonBadge";
import { useFileHistory } from "../components/FileHistoryProvider";

const ACCENT = "#3B3BFF";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type PageSize = "A4" | "Letter" | "Legal";
type FontScale = "small" | "medium" | "large";
type MarginSize = "narrow" | "normal" | "wide";
type Step = "upload" | "configure" | "result";

const PAGE_SIZES: Record<PageSize, { width: number; height: number }> = {
  A4: { width: 595, height: 842 },
  Letter: { width: 612, height: 792 },
  Legal: { width: 612, height: 1008 },
};

const FONT_SCALES: Record<FontScale, number> = {
  small: 10,
  medium: 12,
  large: 14,
};

const MARGINS: Record<MarginSize, number> = {
  narrow: 30,
  normal: 50,
  wide: 72,
};

export default function WordToPdfPage() {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [pageSize, setPageSize] = useState<PageSize>("A4");
  const [fontScale, setFontScale] = useState<FontScale>("medium");
  const [marginSize, setMarginSize] = useState<MarginSize>("normal");
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{ bytes: Uint8Array; name: string } | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const { addFile } = useFileHistory();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "u" || e.key === "U") uploadRef.current?.click();
      if ((e.key === "d" || e.key === "D") && result) handleDownload();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const handleFile = useCallback((f: File) => {
    if (!f.name.toLowerCase().endsWith(".docx")) {
      toast.error("Please select a valid .docx file.");
      return;
    }
    setFile(f);
    setResult(null);
    setStep("configure");
    addFile({ filename: f.name, size: f.size, timestamp: Date.now(), tool: "wordToPdf" });
    toast.success(`"${f.name}" loaded`);
  }, [addFile]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles[0]) handleFile(acceptedFiles[0]);
  }, [handleFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    },
    multiple: false,
    maxFiles: 1,
    onDropRejected: () => toast.error("Please select a valid .docx file."),
  });

  const handleConvert = useCallback(async () => {
    if (!file) return;
    setProcessing(true);
    setResult(null);

    try {
      toast.loading("Reading Word document...", { id: "word2pdf" });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mammoth = await import("mammoth") as any;
      const ab = await file.arrayBuffer();
      const { value: html } = await mammoth.convertToHtml({ arrayBuffer: ab });

      toast.loading("Building PDF...", { id: "word2pdf" });

      const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
      const pdfDoc = await PDFDocument.create();

      const { width, height } = PAGE_SIZES[pageSize];
      const margin = MARGINS[marginSize];
      const baseSize = FONT_SCALES[fontScale];
      const contentWidth = width - margin * 2;

      const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      let page = pdfDoc.addPage([width, height]);
      let y = height - margin;

      function ensureSpace(needed: number) {
        if (y - needed < margin) {
          page = pdfDoc.addPage([width, height]);
          y = height - margin;
        }
      }

      function drawText(text: string, font: typeof regularFont, size: number, color = rgb(0, 0, 0)) {
        if (!text.trim()) return;

        // Word-wrap
        const words = text.split(" ");
        let line = "";
        const lines: string[] = [];
        for (const word of words) {
          const testLine = line ? `${line} ${word}` : word;
          const w = font.widthOfTextAtSize(testLine, size);
          if (w > contentWidth && line) {
            lines.push(line);
            line = word;
          } else {
            line = testLine;
          }
        }
        if (line) lines.push(line);

        for (const l of lines) {
          ensureSpace(size + 4);
          page.drawText(l, { x: margin, y, size, font, color });
          y -= size + 4;
        }
      }

      // Parse HTML into blocks
      const parser = new DOMParser();
      const dom = parser.parseFromString(html, "text/html");
      const body = dom.body;

      for (const node of Array.from(body.childNodes)) {
        if (!(node instanceof Element)) continue;
        const tag = node.tagName.toLowerCase();
        const text = node.textContent ?? "";

        if (tag === "h1") {
          ensureSpace(baseSize * 2 + 8);
          y -= 6;
          drawText(text, boldFont, baseSize * 1.7, rgb(0.05, 0.05, 0.05));
          y -= 4;
        } else if (tag === "h2") {
          ensureSpace(baseSize * 1.5 + 8);
          y -= 4;
          drawText(text, boldFont, baseSize * 1.4, rgb(0.1, 0.1, 0.1));
          y -= 3;
        } else if (tag === "h3") {
          drawText(text, boldFont, baseSize * 1.2);
          y -= 2;
        } else if (tag === "p") {
          drawText(text, regularFont, baseSize);
          y -= 3;
        } else if (tag === "ul" || tag === "ol") {
          for (const li of Array.from(node.querySelectorAll("li"))) {
            drawText(`• ${li.textContent ?? ""}`, regularFont, baseSize);
            y -= 1;
          }
          y -= 2;
        } else if (text.trim()) {
          drawText(text, regularFont, baseSize);
        }
      }

      const pdfBytes = await pdfDoc.save();
      const baseName = file.name.replace(/\.docx$/i, "");
      setResult({ bytes: pdfBytes, name: `converted-${baseName}.pdf` });
      setStep("result");
      toast.success("Done! Your PDF is ready.", { id: "word2pdf" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Conversion failed.";
      toast.error(msg, { id: "word2pdf" });
    } finally {
      setProcessing(false);
    }
  }, [file, pageSize, fontScale, marginSize]);

  const handleDownload = useCallback(() => {
    if (!result) return;
    const blob = new Blob([result.bytes.buffer as ArrayBuffer], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.name;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Download started!");
  }, [result]);

  const reset = useCallback(() => {
    setFile(null);
    setResult(null);
    setStep("upload");
  }, []);

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
          <span className="text-foreground">Word to PDF</span>
        </nav>

        <Link href="/tools" className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors">
          ← Back to all tools
        </Link>

        {/* Header */}
        <div className="mb-8 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ background: "#0F0F2A", color: ACCENT }}>
            <FileType className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Word to PDF</h1>
            <p className="mt-1 text-sm text-muted">Upload a .docx file and download a clean, formatted PDF instantly.</p>
          </div>
        </div>

        {/* Step 1 — Upload */}
        {step === "upload" && (
          <div
            {...getRootProps()}
            className={`group relative flex flex-col items-center justify-center gap-5 rounded-3xl border-2 border-dashed p-12 text-center transition-all cursor-pointer ${
              isDragActive
                ? "border-indigo-500 bg-indigo-500/10 scale-[1.01]"
                : "border-border bg-card hover:border-indigo-500/50 hover:bg-indigo-500/5"
            }`}
            style={{ minHeight: 320 }}
          >
            <input {...getInputProps()} ref={uploadRef} />
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl transition-transform group-hover:scale-110"
              style={{ background: "#0F0F2A", color: ACCENT }}>
              <Upload className="h-9 w-9" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">
                {isDragActive ? "Drop your Word file here" : "Drag & drop your .docx file"}
              </p>
              <p className="mt-1.5 text-sm text-muted">or click to browse — .docx files only</p>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-background px-5 py-2.5">
              <Upload className="h-4 w-4" style={{ color: ACCENT }} />
              <span className="text-sm font-semibold text-foreground">Choose .docx</span>
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
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ background: "#0F0F2A", color: ACCENT }}>
                <FileType className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-foreground">{file.name}</p>
                <p className="text-sm text-muted">{formatBytes(file.size)}</p>
              </div>
              <button onClick={reset} className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground transition-colors border border-border hover:border-foreground/20">
                Change
              </button>
            </div>

            {/* Options */}
            <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
              <p className="text-sm font-semibold text-foreground">PDF Options</p>

              <div className="grid gap-4 sm:grid-cols-3">
                <label className="grid gap-1.5">
                  <span className="text-xs font-medium text-muted uppercase tracking-wide">Page Size</span>
                  <select
                    value={pageSize}
                    onChange={e => setPageSize(e.target.value as PageSize)}
                    className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                  >
                    <option value="A4">A4</option>
                    <option value="Letter">Letter</option>
                    <option value="Legal">Legal</option>
                  </select>
                </label>
                <label className="grid gap-1.5">
                  <span className="text-xs font-medium text-muted uppercase tracking-wide">Font Size</span>
                  <select
                    value={fontScale}
                    onChange={e => setFontScale(e.target.value as FontScale)}
                    className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                  >
                    <option value="small">Small (10px)</option>
                    <option value="medium">Medium (12px)</option>
                    <option value="large">Large (14px)</option>
                  </select>
                </label>
                <label className="grid gap-1.5">
                  <span className="text-xs font-medium text-muted uppercase tracking-wide">Margin</span>
                  <select
                    value={marginSize}
                    onChange={e => setMarginSize(e.target.value as MarginSize)}
                    className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                  >
                    <option value="narrow">Narrow</option>
                    <option value="normal">Normal</option>
                    <option value="wide">Wide</option>
                  </select>
                </label>
              </div>
            </div>

            <button
              onClick={handleConvert}
              disabled={processing}
              className="flex w-full items-center justify-center gap-2.5 rounded-2xl py-4 text-base font-bold text-white shadow-lg transition-all hover:opacity-90 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              style={{ background: ACCENT }}
            >
              {processing ? (
                <>
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Converting…
                </>
              ) : (
                <>
                  <FileType className="h-5 w-5" />
                  Convert to PDF
                </>
              )}
            </button>
          </div>
        )}

        {/* Step 3 — Result */}
        {step === "result" && result && file && (
          <div className="space-y-5">
            <div className="flex items-center gap-4 rounded-2xl border p-5" style={{ borderColor: `${ACCENT}30`, background: `${ACCENT}08` }}>
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ background: `${ACCENT}20`, color: ACCENT }}>
                <FileType className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground">Your PDF is ready!</p>
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
              Download PDF
              <ShortcutHint shortcut="D" />
            </button>

            <button
              onClick={reset}
              className="w-full rounded-2xl border border-border bg-card py-3 text-sm font-semibold text-foreground transition hover:bg-background"
            >
              Convert another document
            </button>
          </div>
        )}
      </main>
    </AppShell>
  );
}
