"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { CheckCircle, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import AppShell from "../components/AppShell";
import ShortcutHint from "../components/ShortcutHint";
import SizeComparisonBadge from "../components/SizeComparisonBadge";
import { useFileHistory } from "../components/FileHistoryProvider";
import type { FileHistoryItem } from "../components/FileHistoryProvider";

type Step = "upload" | "configure" | "processing" | "result";
const ACCENT_COLOR = "#FF4D4D";

type PdfJs = typeof import("pdfjs-dist");

async function loadPdfJs(): Promise<PdfJs> {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }
  return pdfjs;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function FlattenPdfPage() {
  const { addFile } = useFileHistory();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [hasFormFields, setHasFormFields] = useState(false);
  const [flattenedCount, setFlattenedCount] = useState(0);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [resultName, setResultName] = useState("");

  const handleDrop = useCallback(async (files: File[]) => {
    const selectedFile = files[0];
    if (!selectedFile) return;
    setResultBytes(null);
    setResultName("");
    setFlattenedCount(0);
    let proxy: import("pdfjs-dist").PDFDocumentProxy | null = null;
    try {
      const pdfjs = await loadPdfJs();
      const { PDFDocument } = await import("pdf-lib");
      const arrayBuffer = await selectedFile.arrayBuffer();
      proxy = await pdfjs.getDocument({ data: arrayBuffer.slice(0) }).promise;
      setPageCount(proxy.numPages);

      await new Promise((resolve) => window.setTimeout(resolve, 0));
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      setFile(selectedFile);
      setHasFormFields(pdfDoc.getForm().getFields().length > 0);
    } catch (error) {
      console.error(error);
      toast.error("Something went wrong.");
    } finally {
      if (proxy) {
        await proxy.cleanup();
        await proxy.destroy();
      }
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: handleDrop,
    accept: { "application/pdf": [".pdf"] },
    multiple: false,
    noKeyboard: true,
  });

  const goConfigure = useCallback(() => setStep("configure"), []);
  const resetAll = useCallback(() => {
    setStep("upload");
    setFile(null);
    setPageCount(0);
    setResultBytes(null);
    setResultName("");
    setFlattenedCount(0);
    setHasFormFields(false);
  }, []);

  const flattenPdf = useCallback(async () => {
    if (!file) return;

    setStep("processing");
    toast.info("Flattening PDF...");
    // Yield to the browser to allow painting the processing state
    await new Promise((resolve) => setTimeout(resolve, 50));

    try {
      const { PDFDocument } = await import("pdf-lib");
      const originalBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(originalBuffer);

      const form = pdfDoc.getForm();
      const fieldCount = form.getFields().length;
      if (fieldCount === 0) {
        setFlattenedCount(0);
        setResultBytes(new Uint8Array(originalBuffer));
        setResultName(`unchanged-${file.name}`);
        setStep("result");
        toast.success("No AcroForm fields found. Original PDF prepared unchanged.");
        return;
      }

      form.flatten();
      await new Promise((resolve) => window.setTimeout(resolve, 0));

      setFlattenedCount(fieldCount);

      const bytes = await pdfDoc.save();
      setResultBytes(bytes);
      setResultName(`flattened-${file.name}`);
      setStep("result");
      toast.success("Done! AcroForm fields flattened successfully.");
    } catch (error) {
      console.error(error);
      toast.error("Something went wrong.");
      setStep("configure");
    }
  }, [file]);

  const downloadResult = useCallback(() => {
    if (!resultBytes || !file) return;
    const buffer = resultBytes.buffer.slice(resultBytes.byteOffset, resultBytes.byteOffset + resultBytes.byteLength) as ArrayBuffer;
    const url = URL.createObjectURL(new Blob([buffer], { type: "application/pdf" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = resultName || `flattened-${file.name}`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    addFile({
      filename: anchor.download,
      size: resultBytes.byteLength,
      timestamp: Date.now(),
      tool: "Flatten" as unknown as FileHistoryItem["tool"],
    });
  }, [addFile, file, resultBytes, resultName]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      if (event.key.toLowerCase() === "u" && step === "upload") {
        event.preventDefault();
        open();
      }
      if (event.key.toLowerCase() === "d" && step === "result") {
        event.preventDefault();
        downloadResult();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [downloadResult, open, step]);

  return (
    <AppShell>
      <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <Link href="/tools" aria-label="Back to all tools" className="mb-5 inline-flex text-sm font-semibold text-muted hover:text-foreground">
            &larr; Back to all tools
          </Link>
          <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 text-sm text-muted">
            <Link href="/" aria-label="Go to home page" className="hover:text-foreground">Home</Link>
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
            <Link href="/tools" aria-label="Go to tools page" className="hover:text-foreground">Tools</Link>
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
            <span className="font-semibold text-foreground">Flatten PDF</span>
          </nav>
          <section className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-8">
            <div className="mb-8">
              <p className="text-sm font-bold uppercase tracking-[0.18em]" style={{ color: ACCENT_COLOR }}>Static PDF</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Flatten Form Fields</h1>
              <p className="mt-2 max-w-2xl text-muted">Flatten AcroForm fields into static PDF page content. Other interactive PDF features are not flattened.</p>
            </div>

            {step === "upload" && (
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div {...getRootProps()} aria-label="Upload PDF dropzone" className={`cursor-pointer rounded-lg border-2 border-dashed p-10 text-center transition ${isDragActive ? "border-red-400 bg-red-500/10" : "border-border bg-background hover:border-red-400"}`}>
                  <input {...getInputProps({ "aria-label": "Upload PDF" })} />
                  <p className="text-xl font-bold">{isDragActive ? "Drop your PDF here" : "Drag & drop your PDF here"}</p>
                  <p className="mt-2 text-sm text-muted">PDF only, processed locally.</p>
                  <button type="button" onClick={open} aria-label="Browse for a PDF file" className="mt-6 inline-flex items-center justify-center gap-3 rounded-md bg-red-500 px-5 py-3 text-sm font-bold text-white hover:bg-red-600">
                    Browse PDF <ShortcutHint shortcut="U" />
                  </button>
                </div>
                <aside className="rounded-lg border border-border bg-background p-5">
                  <h2 className="text-lg font-bold">File</h2>
                  {file ? (
                    <div className="mt-4 space-y-3 text-sm">
                      <p className="break-all font-semibold">{file.name}</p>
                      <p className="text-muted">{pageCount} pages</p>
                      <p className="text-muted">{formatBytes(file.size)}</p>
                      <div className={`rounded-md p-3 ${hasFormFields ? "bg-green-500/10 text-green-700 dark:text-green-300" : "bg-muted/10 text-muted"}`}>
                        {hasFormFields ? "AcroForm fields detected - these will be flattened." : "No AcroForm fields detected - output will be unchanged."}
                      </div>
                      <button type="button" onClick={goConfigure} aria-label="Configure flatten settings" className="w-full rounded-md bg-red-500 px-5 py-3 font-bold text-white hover:bg-red-600">
                        Configure &rarr;
                      </button>
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-muted">Choose a PDF to begin.</p>
                  )}
                </aside>
              </div>
            )}

            {step === "configure" && (
              <div className="space-y-7">
                <div>
                  <h2 className="text-2xl font-bold">Configure Flattening</h2>
                  <p className="mt-1 text-sm text-muted">{file?.name}</p>
                </div>
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5">
                  <h3 className="mb-3 flex items-center text-lg font-bold text-red-700 dark:text-red-400">
                    <CheckCircle className="mr-2 h-5 w-5" />
                    Form Field Flattening Only
                  </h3>
                  <p className="text-sm leading-relaxed text-red-700/80 dark:text-red-400/80">
                    This tool uses pdf-lib AcroForm flattening only. It locks supported interactive form fields into static PDF page content.
                    <br/><br/>
                    <strong>Note:</strong> Annotations, highlights, sticky notes, layers, signatures, scripts, and XFA forms are NOT flattened by this tool.
                  </p>
                </div>
                <button type="button" onClick={() => void flattenPdf()} aria-label="Flatten PDF" className="w-full rounded-md bg-red-500 px-5 py-4 text-lg font-bold text-white hover:bg-red-600">Flatten PDF &rarr;</button>
              </div>
            )}

            {step === "processing" && (
              <div className="mx-auto max-w-3xl py-4 text-center">
                <Loader2 aria-hidden="true" className="mx-auto mb-4 h-10 w-10 animate-spin text-red-500" />
                <h2 className="text-xl font-bold">Flattening PDF...</h2>
              </div>
            )}

            {step === "result" && file && resultBytes && (
              <div className="mx-auto max-w-2xl py-8 text-center">
                <CheckCircle aria-hidden="true" className="mx-auto mb-5 h-14 w-14 text-red-500" />
                <h2 className="text-2xl font-black">{flattenedCount > 0 ? "AcroForm fields flattened" : "No AcroForm fields found"}</h2>
                <p className="mt-2 text-muted">
                  {flattenedCount > 0 ? `${flattenedCount} AcroForm fields flattened into static page content` : "Original PDF prepared unchanged"}
                </p>
                <SizeComparisonBadge originalSize={file.size} compressedSize={resultBytes.byteLength} />
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                  <button type="button" onClick={downloadResult} aria-label="Download flattened PDF" className="inline-flex items-center justify-center gap-3 rounded-md bg-red-500 px-5 py-3 font-bold text-white hover:bg-red-600">Download PDF <ShortcutHint shortcut="D" /></button>
                  <button type="button" onClick={resetAll} aria-label="Flatten another PDF" className="rounded-md border border-border px-5 py-3 font-bold">Flatten another</button>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </AppShell>
  );
}
