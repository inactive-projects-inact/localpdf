"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import Link from "next/link";
import { ChevronRight, Sheet, Upload, Download, Home } from "lucide-react";
import AppShell from "../components/AppShell";
import ShortcutHint from "../components/ShortcutHint";
import SizeComparisonBadge from "../components/SizeComparisonBadge";
import { useFileHistory } from "../components/FileHistoryProvider";

const ACCENT = "#F59E0B";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type Orientation = "landscape" | "portrait";
type PageSize = "A4" | "A3" | "Letter" | "Legal";
type FontSize = "small" | "medium" | "large";
type SheetScope = "active" | "all" | "selected";
type Step = "upload" | "configure" | "result";

interface PageDims {
  width: number;
  height: number;
}

const PAGE_DIMS: Record<PageSize, PageDims> = {
  A4: { width: 595, height: 842 },
  A3: { width: 842, height: 1191 },
  Letter: { width: 612, height: 792 },
  Legal: { width: 612, height: 1008 },
};

const FONT_SIZES: Record<FontSize, number> = {
  small: 8,
  medium: 10,
  large: 12,
};

export default function ExcelToPdfPage() {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState<string>("");
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [sheetScope, setSheetScope] = useState<SheetScope>("active");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [pageSize, setPageSize] = useState<PageSize>("A4");
  const [fontSize, setFontSize] = useState<FontSize>("medium");
  const [includeSheetTitle, setIncludeSheetTitle] = useState(true);
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

  const handleFile = useCallback(async (f: File) => {
    const name = f.name.toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
      toast.error("Please select a valid .xlsx or .xls file.");
      return;
    }
    setFile(f);
    setResult(null);
    setStep("configure");

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const XLSX = await import("xlsx") as any;
      const ab = await f.arrayBuffer();
      const wb = XLSX.read(ab, { type: "array" });
      const names: string[] = wb.SheetNames;
      setSheetNames(names);
      setActiveSheet(names[0] ?? "");
      setSelectedSheets([names[0] ?? ""]);
    } catch {
      setSheetNames([]);
    }

    addFile({ filename: f.name, size: f.size, timestamp: Date.now(), tool: "excelToPdf" });
    toast.success(`"${f.name}" loaded`);
  }, [addFile]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles[0]) handleFile(acceptedFiles[0]);
  }, [handleFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
    },
    multiple: false,
    maxFiles: 1,
    onDropRejected: () => toast.error("Please select a valid .xlsx or .xls file."),
  });

  const handleConvert = useCallback(async () => {
    if (!file) return;
    setProcessing(true);
    setResult(null);

    try {
      toast.loading("Reading spreadsheet...", { id: "excel2pdf" });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const XLSX = await import("xlsx") as any;
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab, { type: "array" });

      // Determine which sheets to convert
      let sheetsToConvert: string[] = [];
      if (sheetScope === "active") sheetsToConvert = [activeSheet];
      else if (sheetScope === "all") sheetsToConvert = sheetNames;
      else sheetsToConvert = selectedSheets;

      if (sheetsToConvert.length === 0) {
        toast.error("Please select at least one sheet.");
        setProcessing(false);
        return;
      }

      toast.loading("Rendering table...", { id: "excel2pdf" });

      const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
      const pdfDoc = await PDFDocument.create();
      const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      const dims = PAGE_DIMS[pageSize];
      const pgW = orientation === "landscape" ? dims.height : dims.width;
      const pgH = orientation === "landscape" ? dims.width : dims.height;
      const fSize = FONT_SIZES[fontSize];
      const margin = 40;
      const rowH = fSize + 8;
      const headerH = rowH + 4;

      for (const sheetName of sheetsToConvert) {
        const ws = wb.Sheets[sheetName];
        if (!ws) continue;

        const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as string[][];
        if (rows.length === 0) continue;

        const colCount = Math.max(...rows.map(r => r.length));
        if (colCount === 0) continue;

        // Calculate column widths
        const colWidths: number[] = Array(colCount).fill(0);
        for (const row of rows) {
          row.forEach((cell, i) => {
            const text = String(cell);
            const w = regularFont.widthOfTextAtSize(text, fSize) + 8;
            colWidths[i] = Math.max(colWidths[i], Math.min(w, 120));
          });
        }

        // Scale columns to fit page width
        const totalColWidth = colWidths.reduce((a, b) => a + b, 0);
        const availW = pgW - margin * 2;
        const scale = totalColWidth > availW ? availW / totalColWidth : 1;
        const scaledWidths = colWidths.map(w => w * scale);

        let page = pdfDoc.addPage([pgW, pgH]);
        let y = pgH - margin;

        // Sheet title
        if (includeSheetTitle) {
          page.drawText(sheetName, {
            x: margin,
            y,
            size: fSize + 4,
            font: boldFont,
            color: rgb(0.05, 0.05, 0.05),
          });
          y -= fSize + 12;
        }

        // Draw rows
        rows.forEach((row, rowIdx) => {
          const isHeader = rowIdx === 0;
          const rowBackground = isHeader ? rgb(0.06, 0.06, 0.06) : rowIdx % 2 === 0 ? rgb(0.97, 0.97, 0.97) : rgb(1, 1, 1);
          const textColor = isHeader ? rgb(1, 1, 1) : rgb(0.1, 0.1, 0.1);
          const currentRowH = isHeader ? headerH : rowH;

          // Check if we need a new page
          if (y - currentRowH < margin) {
            page = pdfDoc.addPage([pgW, pgH]);
            y = pgH - margin;
            // Repeat header row if not currently drawing it
            if (rowIdx > 0 && rows[0]) {
              const hRow = rows[0];
              let hx = margin;
              page.drawRectangle({
                x: margin,
                y: y - headerH,
                width: availW,
                height: headerH,
                color: rgb(0.06, 0.06, 0.06),
              });
              hRow.forEach((cell, i) => {
                const cw = scaledWidths[i] ?? 60;
                page.drawText(String(cell).slice(0, 40), {
                  x: hx + 3,
                  y: y - headerH + 5,
                  size: fSize,
                  font: boldFont,
                  color: rgb(1, 1, 1),
                  maxWidth: cw - 6,
                });
                hx += cw;
              });
              y -= headerH;
            }
          }

          // Draw row background
          let x = margin;
          page.drawRectangle({
            x: margin,
            y: y - currentRowH,
            width: availW,
            height: currentRowH,
            color: rowBackground,
          });

          // Draw cell borders and text
          row.forEach((cell, i) => {
            const cw = scaledWidths[i] ?? 60;
            const text = String(cell ?? "").slice(0, 60);
            // Border
            page.drawRectangle({
              x,
              y: y - currentRowH,
              width: cw,
              height: currentRowH,
              borderColor: rgb(0.9, 0.91, 0.92),
              borderWidth: 0.5,
            });
            // Text
            if (text) {
              page.drawText(text, {
                x: x + 3,
                y: y - currentRowH + 5,
                size: fSize,
                font: isHeader ? boldFont : regularFont,
                color: textColor,
                maxWidth: cw - 6,
              });
            }
            x += cw;
          });

          y -= currentRowH;
        });
      }

      toast.loading("Building PDF...", { id: "excel2pdf" });

      const pdfBytes = await pdfDoc.save();
      const baseName = file.name.replace(/\.(xlsx|xls)$/i, "");
      setResult({ bytes: pdfBytes, name: `converted-${baseName}.pdf` });
      setStep("result");
      toast.success("Done! Your PDF is ready.", { id: "excel2pdf" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Conversion failed.";
      toast.error(msg, { id: "excel2pdf" });
    } finally {
      setProcessing(false);
    }
  }, [file, sheetScope, activeSheet, sheetNames, selectedSheets, orientation, pageSize, fontSize, includeSheetTitle]);

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
    setSheetNames([]);
    setStep("upload");
  }, []);

  const toggleSheet = (name: string) => {
    setSelectedSheets(prev =>
      prev.includes(name) ? prev.filter(s => s !== name) : [...prev, name]
    );
  };

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
          <span className="text-foreground">Excel to PDF</span>
        </nav>

        <Link href="/tools" className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors">
          ← Back to all tools
        </Link>

        {/* Header */}
        <div className="mb-8 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ background: "#2A200F", color: ACCENT }}>
            <Sheet className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Excel to PDF</h1>
            <p className="mt-1 text-sm text-muted">Convert spreadsheets into clean, formatted PDFs with styled tables.</p>
          </div>
        </div>

        {/* Step 1 — Upload */}
        {step === "upload" && (
          <div
            {...getRootProps()}
            className={`group relative flex flex-col items-center justify-center gap-5 rounded-3xl border-2 border-dashed p-12 text-center transition-all cursor-pointer ${
              isDragActive
                ? "border-amber-500 bg-amber-500/10 scale-[1.01]"
                : "border-border bg-card hover:border-amber-500/50 hover:bg-amber-500/5"
            }`}
            style={{ minHeight: 320 }}
          >
            <input {...getInputProps()} ref={uploadRef} />
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl transition-transform group-hover:scale-110"
              style={{ background: "#2A200F", color: ACCENT }}>
              <Upload className="h-9 w-9" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">
                {isDragActive ? "Drop your Excel file here" : "Drag & drop your Excel file"}
              </p>
              <p className="mt-1.5 text-sm text-muted">or click to browse — .xlsx and .xls supported</p>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-background px-5 py-2.5">
              <Upload className="h-4 w-4" style={{ color: ACCENT }} />
              <span className="text-sm font-semibold text-foreground">Choose spreadsheet</span>
              <ShortcutHint shortcut="U" />
            </div>
            <p className="text-xs text-muted">100% private · files never leave your device</p>
          </div>
        )}

        {/* Step 2 — Configure */}
        {step === "configure" && file && (
          <div className="space-y-5">
            <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ background: "#2A200F", color: ACCENT }}>
                <Sheet className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-foreground">{file.name}</p>
                <p className="text-sm text-muted">
                  {formatBytes(file.size)} · {sheetNames.length} sheet{sheetNames.length !== 1 ? "s" : ""}
                </p>
              </div>
              <button onClick={reset} className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground transition-colors border border-border">
                Change
              </button>
            </div>

            {/* Sheet selection */}
            {sheetNames.length > 1 && (
              <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                <p className="text-sm font-semibold text-foreground">Sheet Selection</p>
                <div className="flex flex-wrap gap-2">
                  {(["active", "all", "selected"] as SheetScope[]).map(s => (
                    <button
                      key={s}
                      onClick={() => setSheetScope(s)}
                      className={`rounded-xl px-4 py-2 text-sm font-medium transition border ${
                        sheetScope === s ? "border-transparent text-white" : "border-border text-muted hover:text-foreground"
                      }`}
                      style={sheetScope === s ? { background: ACCENT } : {}}
                    >
                      {s === "active" ? "Active Sheet" : s === "all" ? "All Sheets" : "Selected Sheets"}
                    </button>
                  ))}
                </div>
                {sheetScope === "active" && (
                  <select
                    value={activeSheet}
                    onChange={e => setActiveSheet(e.target.value)}
                    className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground w-full"
                  >
                    {sheetNames.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                )}
                {sheetScope === "selected" && (
                  <div className="flex flex-wrap gap-2">
                    {sheetNames.map(n => (
                      <button
                        key={n}
                        onClick={() => toggleSheet(n)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition border ${
                          selectedSheets.includes(n)
                            ? "border-transparent text-white"
                            : "border-border text-muted hover:text-foreground"
                        }`}
                        style={selectedSheets.includes(n) ? { background: ACCENT } : {}}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* PDF Options */}
            <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
              <p className="text-sm font-semibold text-foreground">PDF Options</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="grid gap-1.5">
                  <span className="text-xs font-medium text-muted uppercase tracking-wide">Orientation</span>
                  <select
                    value={orientation}
                    onChange={e => setOrientation(e.target.value as Orientation)}
                    className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                  >
                    <option value="landscape">Landscape</option>
                    <option value="portrait">Portrait</option>
                  </select>
                </label>
                <label className="grid gap-1.5">
                  <span className="text-xs font-medium text-muted uppercase tracking-wide">Page Size</span>
                  <select
                    value={pageSize}
                    onChange={e => setPageSize(e.target.value as PageSize)}
                    className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                  >
                    <option value="A4">A4</option>
                    <option value="A3">A3</option>
                    <option value="Letter">Letter</option>
                    <option value="Legal">Legal</option>
                  </select>
                </label>
                <label className="grid gap-1.5">
                  <span className="text-xs font-medium text-muted uppercase tracking-wide">Font Size</span>
                  <select
                    value={fontSize}
                    onChange={e => setFontSize(e.target.value as FontSize)}
                    className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                  >
                    <option value="small">Small (8px)</option>
                    <option value="medium">Medium (10px)</option>
                    <option value="large">Large (12px)</option>
                  </select>
                </label>
                <label className="flex items-start gap-2.5 pt-5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeSheetTitle}
                    onChange={e => setIncludeSheetTitle(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded"
                  />
                  <span className="text-sm text-muted">Include sheet name as title</span>
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
                  <Sheet className="h-5 w-5" />
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
                <Sheet className="h-6 w-6" />
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
              Convert another spreadsheet
            </button>
          </div>
        )}
      </main>
    </AppShell>
  );
}
