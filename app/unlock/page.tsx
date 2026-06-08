"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import Link from "next/link";
import { ChevronRight, Unlock, Upload, Download, Home, AlertTriangle } from "lucide-react";
import AppShell from "../components/AppShell";
import ShortcutHint from "../components/ShortcutHint";
import SizeComparisonBadge from "../components/SizeComparisonBadge";
import { useFileHistory } from "../components/FileHistoryProvider";
import { usePdfDocProxy } from "../hooks/usePdfDocProxy";
import { downloadBlob } from "../lib/pdf-utils";
import { hasPdfHeader } from "../lib/tool-registry";

const ACCENT = "#10B981";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type EncryptionStatus = "unknown" | "encrypted" | "not-encrypted" | "unsupported-encryption" | "corrupted";
type Step = "upload" | "configure" | "result";

export default function UnlockPage() {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [encryptionStatus, setEncryptionStatus] = useState<EncryptionStatus>("unknown");
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{ bytes: Uint8Array; name: string } | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const fileJobRef = useRef(0);
  const { addFile } = useFileHistory();
  const { isLoading, numPages, loadError, load, destroy } = usePdfDocProxy();

  const handleFile = useCallback(async (f: File) => {
    const jobId = fileJobRef.current + 1;
    fileJobRef.current = jobId;

    if (!(await hasPdfHeader(f))) {
      if (fileJobRef.current === jobId) toast.error("Please select a valid PDF file.");
      return;
    }

    if (fileJobRef.current !== jobId) return;
    setFile(f);
    setResult(null);
    setEncryptionStatus("unknown");
    setStep("configure");
    load(f);

    addFile({ filename: f.name, size: f.size, timestamp: Date.now(), tool: "unlock" });
    toast.success(`"${f.name}" loaded`);
  }, [addFile, load]);

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
      if (encryptionStatus === "encrypted" || encryptionStatus === "unsupported-encryption") {
        toast.error("True PDF decryption is not supported by the current browser engine. No unlocked file was created.", { id: "unlock" });
        return;
      }

      if (encryptionStatus === "corrupted") {
        toast.error("File is corrupted or unsupported. No output was created.", { id: "unlock" });
        return;
      }

      if (encryptionStatus !== "not-encrypted") {
        toast.error("Could not verify that this PDF is unencrypted. No output was created.", { id: "unlock" });
        return;
      }

      toast.loading("Preparing unchanged download...", { id: "unlock" });
      const pdfBytes = new Uint8Array(await file.arrayBuffer());
      const baseName = file.name.replace(/\.pdf$/i, "");
      setResult({ bytes: pdfBytes, name: `unchanged-${baseName}.pdf` });
      setStep("result");
      toast.success("This PDF was not encrypted; original file prepared unchanged.", { id: "unlock" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Operation failed.";
      toast.error(msg, { id: "unlock" });
    } finally {
      setProcessing(false);
    }
  }, [encryptionStatus, file]);

  const handleDownload = useCallback(() => {
    if (!result) return;
    const buffer = result.bytes.buffer.slice(result.bytes.byteOffset, result.bytes.byteOffset + result.bytes.byteLength) as ArrayBuffer;
    const blob = new Blob([buffer], { type: "application/pdf" });
    downloadBlob(blob, result.name);
    toast.success("Download started!");
  }, [result]);

  useEffect(() => {
    if (!file || isLoading) return;
    if (loadError) {
      setEncryptionStatus(loadError.reason === "unknown" ? "unknown" : loadError.reason);
      return;
    }
    if (numPages > 0) {
      setEncryptionStatus("not-encrypted");
    }
  }, [file, isLoading, loadError, numPages]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "u" || e.key === "U") uploadRef.current?.click();
      if ((e.key === "d" || e.key === "D") && result) handleDownload();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleDownload, result]);

  const reset = useCallback(() => {
    fileJobRef.current += 1;
    destroy();
    setFile(null);
    setResult(null);
    setEncryptionStatus("unknown");
    setStep("upload");
  }, [destroy]);

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
            <p className="mt-1 text-sm text-muted">Check whether a PDF can be unlocked by this browser-only engine.</p>
          </div>
        </div>

        {/* Legal disclaimer */}
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
          <p className="text-sm text-amber-300">
            Only attempt to inspect PDFs you own or have explicit permission to process. This browser tool does not bypass encryption or remove owner permissions.
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
            <p className="text-xs text-muted">100% private · files stay local</p>
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
              <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  This PDF does not require an open password. This tool will only offer the original file unchanged; it will not strip owner permissions.
                </p>
              </div>
            )}

            {encryptionStatus === "encrypted" && (
              <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                <p className="text-sm text-red-700 dark:text-red-300">
                  This PDF is encrypted. True password decryption is not supported by the current client-side engine, so no unlocked PDF will be created.
                </p>
              </div>
            )}

            {encryptionStatus === "unsupported-encryption" && (
              <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                <p className="text-sm text-red-700 dark:text-red-300">
                  This PDF uses unsupported encryption, such as an AES/security handler this browser engine cannot decrypt. No unlocked PDF will be created.
                </p>
              </div>
            )}

            {/* Corrupted notice */}
            {encryptionStatus === "corrupted" && (
              <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                <p className="text-sm text-red-700 dark:text-red-300">
                  This PDF appears to be corrupted, malformed, or uses an unsupported format. It cannot be unlocked by the client-side engine.
                </p>
              </div>
            )}

            <button
              onClick={handleUnlock}
              disabled={
                processing ||
                encryptionStatus === "unknown" ||
                encryptionStatus === "corrupted" ||
                encryptionStatus === "encrypted" ||
                encryptionStatus === "unsupported-encryption"
              }
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
                  {encryptionStatus === "not-encrypted" ? "Download Original Unchanged" : "Unlock Unsupported"}
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
                <p className="font-semibold text-foreground">Original PDF ready unchanged</p>
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
              Download Original PDF
              <ShortcutHint shortcut="D" />
            </button>

            <button
              onClick={reset}
              className="w-full rounded-2xl border border-border bg-card py-3 text-sm font-semibold text-foreground transition hover:bg-background"
            >
              Check another PDF
            </button>
          </div>
        )}
      </main>
    </AppShell>
  );
}
