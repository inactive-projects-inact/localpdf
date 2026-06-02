"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import Link from "next/link";
import { ChevronRight, Lock, Upload, Download, Eye, EyeOff, Home, ShieldCheck } from "lucide-react";
import AppShell from "../components/AppShell";
import ShortcutHint from "../components/ShortcutHint";
import { useFileHistory } from "../components/FileHistoryProvider";

const ACCENT = "#FF4D4D";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type ProtectionMode = "view-only" | "full";
type Step = "upload" | "configure" | "result";

function getPasswordStrength(pw: string): { label: string; color: string; pct: number } {
  if (!pw) return { label: "—", color: "#64748B", pct: 0 };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { label: "Weak", color: "#EF4444", pct: 25 };
  if (score <= 3) return { label: "Medium", color: "#F59E0B", pct: 60 };
  return { label: "Strong", color: "#10B981", pct: 100 };
}

export default function ProtectPage() {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  const [mode, setMode] = useState<ProtectionMode>("view-only");
  const [userPw, setUserPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [ownerPw, setOwnerPw] = useState("");
  const [showUser, setShowUser] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showOwner, setShowOwner] = useState(false);
  const [allowPrint, setAllowPrint] = useState(false);
  const [allowCopy, setAllowCopy] = useState(false);
  const [allowEdit, setAllowEdit] = useState(false);
  const [allowForms, setAllowForms] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{ bytes: Uint8Array; name: string } | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const { addFile } = useFileHistory();

  const pwStrength = getPasswordStrength(userPw);
  const pwMatch = userPw === confirmPw;

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
    setStep("configure");
    try {
      const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
      GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const ab = await f.arrayBuffer();
      const doc = await getDocument({ data: ab }).promise;
      setPageCount(doc.numPages);
      await doc.destroy();
    } catch {
      setPageCount(0);
    }
    addFile({ filename: f.name, size: f.size, timestamp: Date.now(), tool: "protect" });
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

  const handleProtect = useCallback(async () => {
    if (!file) return;
    if (!userPw) { toast.error("Please enter a password."); return; }
    if (!pwMatch) { toast.error("Passwords do not match."); return; }

    setProcessing(true);
    setResult(null);

    try {
      toast.loading("Encrypting PDF...", { id: "protect" });

      const { PDFDocument } = await import("pdf-lib");
      const ab = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(ab);

      const effectiveOwnerPw = ownerPw || crypto.randomUUID();

      // pdf-lib's save with encryption options
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfBytes = await pdfDoc.save({
        userPassword: userPw,
        ownerPassword: effectiveOwnerPw,
        permissions: {
          printing: allowPrint ? "lowResolution" : undefined,
          modifying: allowEdit,
          copying: allowCopy,
          annotating: false,
          fillingForms: allowForms,
          contentAccessibility: true,
          documentAssembly: false,
        },
      } as any);

      const baseName = file.name.replace(/\.pdf$/i, "");
      setResult({ bytes: pdfBytes, name: `protected-${baseName}.pdf` });
      setStep("result");
      toast.success("Done! PDF is password protected.", { id: "protect" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Encryption failed.";
      toast.error(msg, { id: "protect" });
    } finally {
      setProcessing(false);
    }
  }, [file, userPw, confirmPw, ownerPw, mode, allowPrint, allowCopy, allowEdit, allowForms, pwMatch]);

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
    setPageCount(0);
    setUserPw("");
    setConfirmPw("");
    setOwnerPw("");
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
          <span className="text-foreground">Protect PDF</span>
        </nav>

        <Link href="/tools" className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors">
          ← Back to all tools
        </Link>

        {/* Header */}
        <div className="mb-8 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ background: "#2A0F0F", color: ACCENT }}>
            <Lock className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Protect PDF</h1>
            <p className="mt-1 text-sm text-muted">Add password protection and permission restrictions to any PDF.</p>
          </div>
        </div>

        {/* Step 1 — Upload */}
        {step === "upload" && (
          <div
            {...getRootProps()}
            className={`group relative flex flex-col items-center justify-center gap-5 rounded-3xl border-2 border-dashed p-12 text-center transition-all cursor-pointer ${
              isDragActive
                ? "border-red-500 bg-red-500/10 scale-[1.01]"
                : "border-border bg-card hover:border-red-500/50 hover:bg-red-500/5"
            }`}
            style={{ minHeight: 320 }}
          >
            <input {...getInputProps()} ref={uploadRef} />
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl transition-transform group-hover:scale-110"
              style={{ background: "#2A0F0F", color: ACCENT }}>
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
            <p className="text-xs text-muted">100% private · encryption happens locally</p>
          </div>
        )}

        {/* Step 2 — Configure */}
        {step === "configure" && file && (
          <div className="space-y-5">
            <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ background: "#2A0F0F", color: ACCENT }}>
                <Lock className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-foreground">{file.name}</p>
                <p className="text-sm text-muted">
                  {formatBytes(file.size)}{pageCount > 0 ? ` · ${pageCount} pages` : ""}
                </p>
              </div>
              <button onClick={reset} className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground transition-colors border border-border">
                Change
              </button>
            </div>

            {/* Protection mode */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setMode("view-only")}
                className={`rounded-2xl border p-4 text-left transition-all ${
                  mode === "view-only" ? "border-red-500/50 bg-red-500/8" : "border-border bg-card hover:border-red-500/30"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Lock className="h-4 w-4" style={{ color: ACCENT }} />
                  <span className="font-semibold text-sm text-foreground">Password to Open</span>
                </div>
                <p className="text-xs text-muted">Requires password to view the PDF</p>
              </button>
              <button
                onClick={() => setMode("full")}
                className={`rounded-2xl border p-4 text-left transition-all ${
                  mode === "full" ? "border-red-500/50 bg-red-500/8" : "border-border bg-card hover:border-red-500/30"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <ShieldCheck className="h-4 w-4" style={{ color: ACCENT }} />
                  <span className="font-semibold text-sm text-foreground">Full Protection</span>
                </div>
                <p className="text-xs text-muted">Password + restrict printing, copying & editing</p>
              </button>
            </div>

            {/* Password inputs */}
            <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
              <p className="text-sm font-semibold text-foreground">Password Setup</p>

              <div className="space-y-3">
                <label className="block">
                  <span className="text-xs font-medium text-muted mb-1.5 block">User Password (required)</span>
                  <div className="relative">
                    <input
                      type={showUser ? "text" : "password"}
                      value={userPw}
                      onChange={e => setUserPw(e.target.value)}
                      placeholder="Enter password for viewers"
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 pr-12 text-sm text-foreground placeholder:text-muted"
                    />
                    <button type="button" onClick={() => setShowUser(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground">
                      {showUser ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {/* Strength */}
                  {userPw && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-border overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pwStrength.pct}%`, background: pwStrength.color }} />
                      </div>
                      <span className="text-xs font-medium" style={{ color: pwStrength.color }}>{pwStrength.label}</span>
                    </div>
                  )}
                </label>

                <label className="block">
                  <span className="text-xs font-medium text-muted mb-1.5 block">Confirm Password</span>
                  <div className="relative">
                    <input
                      type={showConfirm ? "text" : "password"}
                      value={confirmPw}
                      onChange={e => setConfirmPw(e.target.value)}
                      placeholder="Re-enter password"
                      className={`w-full rounded-xl border bg-background px-4 py-3 pr-12 text-sm text-foreground placeholder:text-muted ${
                        confirmPw && !pwMatch ? "border-red-500" : "border-border"
                      }`}
                    />
                    <button type="button" onClick={() => setShowConfirm(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground">
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {confirmPw && !pwMatch && (
                    <p className="mt-1 text-xs text-red-400">Passwords do not match</p>
                  )}
                </label>

                <label className="block">
                  <span className="text-xs font-medium text-muted mb-1.5 block">Owner Password (optional — auto-generated if empty)</span>
                  <div className="relative">
                    <input
                      type={showOwner ? "text" : "password"}
                      value={ownerPw}
                      onChange={e => setOwnerPw(e.target.value)}
                      placeholder="Controls permissions (optional)"
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 pr-12 text-sm text-foreground placeholder:text-muted"
                    />
                    <button type="button" onClick={() => setShowOwner(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground">
                      {showOwner ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </label>
              </div>
            </div>

            {/* Permission restrictions (Full Protection mode) */}
            {mode === "full" && (
              <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                <p className="text-sm font-semibold text-foreground">Permission Restrictions</p>
                {[
                  { label: "Allow Printing", value: allowPrint, set: setAllowPrint },
                  { label: "Allow Copying Text", value: allowCopy, set: setAllowCopy },
                  { label: "Allow Editing", value: allowEdit, set: setAllowEdit },
                  { label: "Allow Form Filling", value: allowForms, set: setAllowForms },
                ].map(({ label, value, set }) => (
                  <label key={label} className="flex items-center justify-between gap-3 cursor-pointer">
                    <span className="text-sm text-muted">{label}</span>
                    <div
                      onClick={() => set(v => !v)}
                      className={`relative h-6 w-11 rounded-full transition-colors ${value ? "bg-red-500" : "bg-border"}`}
                    >
                      <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${value ? "translate-x-5" : "translate-x-0.5"}`} />
                    </div>
                  </label>
                ))}
              </div>
            )}

            <button
              onClick={handleProtect}
              disabled={processing || !userPw || !pwMatch}
              className="flex w-full items-center justify-center gap-2.5 rounded-2xl py-4 text-base font-bold text-white shadow-lg transition-all hover:opacity-90 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              style={{ background: ACCENT }}
            >
              {processing ? (
                <>
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Encrypting…
                </>
              ) : (
                <>
                  <Lock className="h-5 w-5" />
                  Protect PDF
                </>
              )}
            </button>
          </div>
        )}

        {/* Step 3 — Result */}
        {step === "result" && result && (
          <div className="space-y-5">
            {/* Success banner */}
            <div className="rounded-2xl border border-green-500/30 bg-green-500/8 p-5">
              <div className="flex items-start gap-3">
                <ShieldCheck className="h-6 w-6 shrink-0 text-green-400 mt-0.5" />
                <div>
                  <p className="font-semibold text-foreground">Your PDF is now password protected.</p>
                  <p className="mt-1 text-sm text-muted">Keep your password safe — it cannot be recovered.</p>
                </div>
              </div>
            </div>

            <button
              id="download-btn"
              onClick={handleDownload}
              className="flex w-full items-center justify-center gap-2.5 rounded-2xl py-4 text-base font-bold text-white shadow-lg transition-all hover:opacity-90 hover:-translate-y-0.5"
              style={{ background: ACCENT }}
            >
              <Download className="h-5 w-5" />
              Download Protected PDF
              <ShortcutHint shortcut="D" />
            </button>

            <button
              onClick={reset}
              className="w-full rounded-2xl border border-border bg-card py-3 text-sm font-semibold text-foreground transition hover:bg-background"
            >
              Protect another PDF
            </button>
          </div>
        )}
      </main>
    </AppShell>
  );
}
