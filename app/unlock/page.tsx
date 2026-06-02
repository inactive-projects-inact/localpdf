"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import Link from "next/link";
import { ChevronRight, Unlock, Upload, Download, Eye, EyeOff, Home, AlertTriangle, Info } from "lucide-react";
import AppShell from "../components/AppShell";
import ShortcutHint from "../components/ShortcutHint";
import SizeComparisonBadge from "../components/SizeComparisonBadge";
import { useFileHistory } from "../components/FileHistoryProvider";

const ACCENT = "#10B981";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type EncryptionStatus = "unknown" | "encrypted" | "not-encrypted";
type Step = "upload" | "configure" | "result";

export default function UnlockPage() {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [encryptionStatus, setEncryptionStatus] = useState<EncryptionStatus>("unknown");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
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
    if (!f.name.toLowerCase().endsWith(".pdf") && f.type !== "application/pdf") {
      toast.error("Please select a valid PDF file.");
      return;
    }
    setFile(f);
    setResult(null);
    setPassword("");
    setEncryptionStatus("unknown");
    setStep("configure");

    // Detect if encrypted
    try {
      const { PDFDocument } = await import("pdf-lib");
      const ab = await f.arrayBuffer();
      try {
        await PDFDocument.load(ab);
        setEncryptionStatus("not-encrypted");
      } catch (e) {
        const msg = e instanceof Error ? e.message.toLowerCase() : "";
        if (msg.includes("encrypt") || msg.includes("password") || msg.includes("decrypt")) {
          setEncryptionStatus("encrypted");
        } else {
          setEncryptionStatus("encrypted"); // treat parse errors as possibly encrypted
        }
      }
    } catch {
      setEncryptionStatus("unknown");
    }

    addFile({ filename: f.name, size: f.size, timestamp: Date.now(), tool: "unlock" });
    toast.success(`"${f.name}" loaded`);
  }, [addFile]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles[0]) handleFile(acceptedFiles[0]);
  }, [handleFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    multiple: false,
    maxFiles: 1,
    onDropRejected: () => toast.error("Please select a valid PDF file."),
  });

  const handleUnlock = useCallback(async () => {
    if (!file) return;
    setProcessing(true);
    setResult(null);

    try {
      toast.loading("Verifying password...", { id: "unlock" });

      const { PDFDocument } = await import("pdf-lib");
      const ab = await file.arrayBuffer();

      let pdfDoc: Awaited<ReturnType<typeof PDFDocument.load>>;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pdfDoc = await PDFDocument.load(ab, {
          password: password || undefined,
          ignoreEncryption: false,
        } as any);
      } catch (e) {
        const msg = e instanceof Error ? e.message.toLowerCase() : "";
        if (msg.includes("password") || msg.includes("encrypt") || msg.includes("decrypt") || msg.includes("incorrect")) {
          toast.error("Incorrect password. Please try again.", { id: "unlock" });
          setProcessing(false);
          return;
        }
        throw e;
      }

      toast.loading("Removing protection...", { id: "unlock" });

      // Re-save without encryption
      const pdfBytes = await pdfDoc.save();
      const baseName = file.name.replace(/\.pdf$/i, "");
      setResult({ bytes: pdfBytes, name: `unlocked-${baseName}.pdf` });
      setStep("result");
      toast.success("Done! PDF is now unlocked.", { id: "unlock" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Decryption failed.";
      toast.error(msg, { id: "unlock" });
    } finally {
      setProcessing(false);
    }
  }, [file, password]);

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
    setPassword("");
    setEncryptionStatus("unknown");
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
          <span className="text-foreground">Unlock PDF</span>
        </nav>

        <Link href="/tools" className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors">
          ← Back to all tools
        </Link>

        {/* Header */}
        <div className="mb-6 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ background: "#0F2A1A", color: ACCENT }}>
            <Unlock className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Unlock PDF</h1>
            <p className="mt-1 text-sm text-muted">Remove password protection from PDFs you own.</p>
          </div>
        </div>

        {/* Legal disclaimer */}
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
          <p className="text-sm text-amber-300">
            Only remove protection from PDFs you own or have explicit permission to unlock. Unlocking password-protected files you do not own may be illegal in your jurisdiction.
          </p>
        </div>

        {/* Step 1 — Upload */}
        {step === "upload" && (
          <div
            {...getRootProps()}
            className={`group relative flex flex-col items-center justify-center gap-5 rounded-3xl border-2 border-dashed p-12 text-center transition-all cursor-pointer ${
              isDragActive
                ? "border-emerald-500 bg-emerald-500/10 scale-[1.01]"
                : "border-border bg-card hover:border-emerald-500/50 hover:bg-emerald-500/5"
            }`}
            style={{ minHeight: 300 }}
          >
            <input {...getInputProps()} ref={uploadRef} />
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl transition-transform group-hover:scale-110"
              style={{ background: "#0F2A1A", color: ACCENT }}>
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
            <p className="text-xs text-muted">100% private · decryption happens locally</p>
          </div>
        )}

        {/* Step 2 — Configure */}
        {step === "configure" && file && (
          <div className="space-y-5">
            <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ background: "#0F2A1A", color: ACCENT }}>
                <Unlock className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-foreground">{file.name}</p>
                <p className="text-sm text-muted">{formatBytes(file.size)}</p>
              </div>
              <button onClick={reset} className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground transition-colors border border-border">
                Change
              </button>
            </div>

            {/* Not encrypted notice */}
            {encryptionStatus === "not-encrypted" && (
              <div className="flex items-start gap-3 rounded-xl border p-4" style={{ borderColor: `${ACCENT}30`, background: `${ACCENT}08` }}>
                <Info className="h-4 w-4 mt-0.5 shrink-0" style={{ color: ACCENT }} />
                <p className="text-sm text-muted">
                  This PDF does not appear to be password protected. You can still process and re-download it.
                </p>
              </div>
            )}

            {/* Password input — shown when encrypted or unknown */}
            {(encryptionStatus === "encrypted" || encryptionStatus === "unknown") && (
              <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                <p className="text-sm font-semibold text-foreground">Enter PDF Password</p>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter the PDF password"
                    onKeyDown={e => e.key === "Enter" && handleUnlock()}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 pr-12 text-sm text-foreground placeholder:text-muted"
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground">
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={handleUnlock}
              disabled={processing || (encryptionStatus === "encrypted" && !password)}
              className="flex w-full items-center justify-center gap-2.5 rounded-2xl py-4 text-base font-bold text-white shadow-lg transition-all hover:opacity-90 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              style={{ background: ACCENT }}
            >
              {processing ? (
                <>
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Processing…
                </>
              ) : (
                <>
                  <Unlock className="h-5 w-5" />
                  {encryptionStatus === "not-encrypted" ? "Re-download PDF" : "Remove Protection"}
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
                <Unlock className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground">Your PDF is now unlocked!</p>
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
              Download Unlocked PDF
              <ShortcutHint shortcut="D" />
            </button>

            <button
              onClick={reset}
              className="w-full rounded-2xl border border-border bg-card py-3 text-sm font-semibold text-foreground transition hover:bg-background"
            >
              Unlock another PDF
            </button>
          </div>
        )}
      </main>
    </AppShell>
  );
}
