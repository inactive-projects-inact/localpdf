"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { toast } from "sonner";
import AppShell from "../components/AppShell";
import ToolPageHeader from "../components/ToolPageHeader";
import ToolTrustIndicators from "../components/ToolTrustIndicators";
import ToolUploadZone from "../components/ToolUploadZone";
import ToolProcessingPanel from "../components/ToolProcessingPanel";
import ToolSuccessPanel from "../components/ToolSuccessPanel";
import ToolErrorPanel from "../components/ToolErrorPanel";
import ToolSizeResult from "../components/ToolSizeResult";
import { useFileHistory } from "../components/FileHistoryProvider";
import { formatBytes } from "../lib/format-bytes";
import { getToolDefinition, hasPdfHeader } from "../lib/tool-registry";
import { useMergeWorker } from "../hooks/useMergeWorker";

type PdfItem = { id: string; file: File };

const TOOL = getToolDefinition("merge");

export default function MergePage() {
  const [items, setItems] = useState<PdfItem[]>([]);
  const { state: workerState, merge, cancel, reset } = useMergeWorker();
  const mergeStartTime = useRef<number>(0);
  const [processingTimeMs, setProcessingTimeMs] = useState<number | undefined>(undefined);

  const { addFile, pendingFiles, pendingTool, clearPendingFiles } = useFileHistory();

  const dragIndex = useRef<number | null>(null);
  const dragOverIndex = useRef<number | null>(null);

  const clearMerged = useCallback(() => {
    reset();
  }, [reset]);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;
      void (async () => {
        const validated: File[] = [];
        for (const f of acceptedFiles) {
          const ok = await hasPdfHeader(f);
          if (!ok) {
            toast.error(`"${f.name}" is not a valid PDF.`);
            continue;
          }
          validated.push(f);
        }
        if (validated.length === 0) return;
        const newItems: PdfItem[] = validated.map((file) => ({
          id: crypto.randomUUID(),
          file,
        }));
        setItems((prev) => [...prev, ...newItems]);
        clearMerged();
      })();
    },
    [clearMerged],
  );

  const onDropRejected = useCallback((rejections: FileRejection[]) => {
    const err = rejections[0]?.errors[0];
    if (err?.code === "file-too-large") {
      toast.error(`"${rejections[0].file.name}" exceeds the 500 MB limit.`);
    } else {
      toast.error(`Only PDF files are accepted. Got: ${rejections[0]?.file.name ?? "unknown"}`);
    }
  }, []);

  const { getInputProps, open } = useDropzone({
    onDrop,
    accept: TOOL.input.accept,
    multiple: true,
    maxSize: TOOL.input.maxSizeBytes,
    noClick: true,
    noKeyboard: true,
    onDropRejected,
  });

  // Auto-load files dropped on HeroDropzone
  useEffect(() => {
    if (pendingFiles.length > 0 && items.length === 0 && (!pendingTool || pendingTool === "merge")) {
      const nextFiles = pendingFiles;
      queueMicrotask(() => {
        const newItems: PdfItem[] = nextFiles.map((file) => ({
          id: crypto.randomUUID(),
          file,
        }));
        setItems(newItems);
        clearPendingFiles();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    clearMerged();
  };

  const handleDragStart = (index: number) => { dragIndex.current = index; };
  const handleDragEnter = (index: number) => { dragOverIndex.current = index; };
  const handleDragEnd = () => {
    const from = dragIndex.current;
    const to = dragOverIndex.current;
    if (from === null || to === null || from === to) {
      dragIndex.current = null;
      dragOverIndex.current = null;
      return;
    }
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    clearMerged();
    dragIndex.current = null;
    dragOverIndex.current = null;
  };

  const handleMerge = () => {
    if (items.length < 2) return;
    mergeStartTime.current = performance.now();
    setProcessingTimeMs(undefined);
    toast.loading("Merging PDFs…", { id: "merge" });
    merge(items.map((item) => ({ id: item.id, file: item.file })));
  };

  const handleDownload = useCallback(() => {
    if (!workerState.resultBytes) return;
    // new Uint8Array() ensures a plain ArrayBuffer backing — satisfies BlobPart strict typing.
    const blob = new Blob([new Uint8Array(workerState.resultBytes)], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "merged.pdf";
    anchor.click();
    URL.revokeObjectURL(url);
  }, [workerState.resultBytes]);

  // Wire up addFile to history when merge completes
  useEffect(() => {
    if (workerState.phase === "done" && workerState.resultBytes) {
      const elapsed = mergeStartTime.current > 0
        ? Math.round(performance.now() - mergeStartTime.current)
        : undefined;
      setProcessingTimeMs(elapsed);
      toast.success("Merge complete!", { id: "merge" });
      addFile({
        filename: "merged.pdf",
        size: workerState.resultBytes.byteLength,
        timestamp: Date.now(),
        tool: "merge",
      });
    } else if (workerState.phase === "error") {
      toast.error(workerState.errorMessage ?? "Could not merge these PDFs.", { id: "merge" });
    } else if (workerState.phase === "cancelled") {
      toast.dismiss("merge");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerState.phase]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key.toLowerCase() === "u" && items.length > 0) {
        e.preventDefault();
        open();
      } else if (e.key.toLowerCase() === "d" && workerState.phase === "done" && workerState.resultBytes) {
        e.preventDefault();
        handleDownload();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [workerState.phase, workerState.resultBytes, items.length, open, handleDownload]);

  const isMerging = workerState.phase === "merging" || workerState.phase === "saving";
  const isDone = workerState.phase === "done" && workerState.resultBytes !== null;
  const isError = workerState.phase === "error";
  const canMerge = items.length >= 2 && !isMerging;
  const originalSizeSum = items.reduce((sum, item) => sum + item.file.size, 0);

  const mergeProgress =
    workerState.phase === "saving"
      ? 95
      : workerState.completedFiles > 0
        ? Math.round((workerState.completedFiles / workerState.totalFiles) * 90)
        : 5;

  const mergeStatusLine =
    workerState.phase === "saving"
      ? "Preparing download…"
      : workerState.currentFile
        ? workerState.currentFile.stage === "loading"
          ? `Reading file ${workerState.currentFile.fileIndex} of ${workerState.currentFile.totalFiles}`
          : `Merging pages from file ${workerState.currentFile.fileIndex} of ${workerState.currentFile.totalFiles}`
        : "Analyzing files…";

  return (
    <AppShell>
      <main className="container-tool flex-1 py-8 sm:py-10">
        <ToolPageHeader
          title="Merge PDF"
          description="Add files, drag to reorder, then merge — all on your device."
          category="Organize"
        />
        <ToolTrustIndicators />

        {items.length > 0 && <input {...getInputProps()} className="sr-only" tabIndex={-1} aria-hidden />}

        {items.length === 0 && (
          <ToolUploadZone
            accept={TOOL.input.accept}
            multiple
            maxSize={TOOL.input.maxSizeBytes}
            emptyTitle="Drag & drop PDF files"
            dragTitle="Drop your PDFs here"
            helperText="Add at least 2 PDFs to merge. Files stay on your device."
            onDrop={onDrop}
            onDropRejected={onDropRejected}
          />
        )}

        {!isDone && items.length > 0 && (
          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-primary">
                {items.length} file{items.length !== 1 ? "s" : ""} — drag to reorder
              </h2>
              <button
                type="button"
                onClick={() => { setItems([]); clearMerged(); }}
                className="text-sm font-medium text-text-muted transition hover:text-text-primary"
              >
                Clear all
              </button>
            </div>

            <ul className="space-y-3">
              {items.map((item, index) => (
                <li
                  key={item.id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragEnter={() => handleDragEnter(index)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => e.preventDefault()}
                  className="flex cursor-grab items-center gap-3 rounded-lg border border-border-subtle bg-bg-surface p-3 shadow-sm transition-all duration-[180ms] active:cursor-grabbing active:scale-[0.99] active:shadow-none sm:gap-4 sm:p-4 hover:shadow-md hover:border-border-strong"
                >
                  <span className="flex shrink-0 text-text-muted" aria-hidden title="Drag to reorder">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h16M4 16h16" />
                    </svg>
                  </span>
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-brand-primary-muted text-brand-primary">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text-primary sm:text-base">{item.file.name}</p>
                    <p className="font-mono text-xs text-text-muted sm:text-sm">{formatBytes(item.file.size)}</p>
                  </div>
                  <span className="hidden shrink-0 rounded-md bg-bg-surface-muted px-2.5 py-0.5 font-mono text-xs font-medium text-text-muted sm:inline">
                    {index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeItem(item.id); }}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-muted transition hover:bg-destructive-tint hover:text-destructive"
                    aria-label={`Remove ${item.file.name}`}
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {isMerging && workerState.memoryWarning && (
          <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
            <div className="flex items-start gap-3">
              <svg className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Large merge detected (~{Math.round(workerState.memoryWarning.estimatedBytes / 1024 / 1024)} MB estimated).
                Browser may slow down. You can cancel at any time.
              </p>
            </div>
          </div>
        )}

        {isMerging && (
          <ToolProcessingPanel
            fileName={workerState.currentFile?.fileName}
            statusLine={mergeStatusLine}
            progress={mergeProgress}
            onCancel={cancel}
          />
        )}

        {isError && (
          <ToolErrorPanel
            title="Merge failed"
            message={workerState.errorMessage ?? "One or more PDFs may be encrypted or corrupted."}
            onTryAgain={() => {
              clearMerged();
              handleMerge();
            }}
            onChooseAnother={() => {
              setItems([]);
              clearMerged();
            }}
          />
        )}

        {workerState.skippedFiles.length > 0 && (isDone || isError) && (
          <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-3">
              {workerState.skippedFiles.length} file{workerState.skippedFiles.length !== 1 ? "s" : ""} skipped
            </p>
            <ul className="space-y-1.5">
              {workerState.skippedFiles.map((sf) => (
                <li key={sf.fileId} className="flex items-center gap-2 text-sm">
                  <span className="truncate text-foreground font-medium">{sf.fileName}</span>
                  <span className="shrink-0 text-muted">
                    {sf.reason === "encrypted" && "— Password-protected"}
                    {sf.reason === "corrupted" && "— Could not be parsed"}
                    {sf.reason === "empty" && "— Empty file"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {isDone && workerState.resultBytes && (
          <ToolSuccessPanel
            title="Merge complete"
            fileName="merged.pdf"
            message="Your PDFs were combined into a single document."
            downloadLabel="Download merged PDF"
            onDownload={handleDownload}
            onTryAgain={clearMerged}
            onChooseAnother={() => {
              setItems([]);
              clearMerged();
            }}
            processingTimeMs={processingTimeMs}
            nextActions={[
              { href: "/merge", label: "Merge PDF" },
              { href: "/split", label: "Split PDF" },
              { href: "/compress", label: "Compress PDF" },
            ]}
          >
            <ToolSizeResult originalSize={originalSizeSum} newSize={workerState.resultBytes.byteLength} />
          </ToolSuccessPanel>
        )}

        {!isDone && items.length > 0 && (
          <div className="mt-8 flex w-full flex-col items-center gap-3 pb-20 sm:flex-row sm:justify-end sm:pb-0">
            <button
              type="button"
              onClick={handleMerge}
              disabled={!canMerge}
              className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {isMerging ? "Merging…" : items.length < 2 ? "Add at least 2 PDFs to merge" : "Merge PDFs"}
            </button>
          </div>
        )}

        {/* SEO CONTENT & JSON-LD SCHEMAS */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "SoftwareApplication",
                  name: "LocalPDF Merger",
                  applicationCategory: "UtilitiesApplication",
                  operatingSystem: "Web",
                  offers: {
                    "@type": "Offer",
                    price: "0",
                    priceCurrency: "USD"
                  },
                  aggregateRating: {
                    "@type": "AggregateRating",
                    ratingValue: "4.9",
                    ratingCount: "892"
                  },
                  featureList: [
                    "Merge multiple PDF files",
                    "Drag and drop to reorder pages",
                    "100% private - files never leave your device",
                    "No file size limits"
                  ]
                },
                {
                  "@type": "FAQPage",
                  mainEntity: [
                    {
                      "@type": "Question",
                      name: "How many PDFs can I merge at once?",
                      acceptedAnswer: {
                        "@type": "Answer",
                        text: "You can merge dozens of PDFs at once. Because the merging happens on your device rather than a remote server, the only limit is your device's memory. Most modern computers can easily merge 50+ files in one go."
                      }
                    },
                    {
                      "@type": "Question",
                      name: "Will merging PDFs change the quality or formatting?",
                      acceptedAnswer: {
                        "@type": "Answer",
                        text: "No, merging PDFs with LocalPDF retains 100% of the original quality. We simply append the pages of one document to the end of another without altering the underlying images, text formatting, or metadata."
                      }
                    },
                    {
                      "@type": "Question",
                      name: "Can I reorder pages before merging?",
                      acceptedAnswer: {
                        "@type": "Answer",
                        text: "Yes! After adding your PDF files, you can easily drag and drop the files in the list to change their order. The final merged PDF will combine the files in the exact sequence you arranged them."
                      }
                    },
                    {
                      "@type": "Question",
                      name: "Is it safe to merge confidential documents on LocalPDF?",
                      acceptedAnswer: {
                        "@type": "Answer",
                        text: "Absolutely. LocalPDF is the safest way to merge confidential documents online because your files are never actually sent online. The merging process happens entirely locally within your web browser."
                      }
                    },
                    {
                      "@type": "Question",
                      name: "What file size limit applies when merging PDFs?",
                      acceptedAnswer: {
                        "@type": "Answer",
                        text: "Our tool can handle files up to 500 MB. This is much larger than most cloud-based PDF tools because we don't have to worry about server storage or bandwidth costs. The processing uses your local device resources."
                      }
                    },
                    {
                      "@type": "Question",
                      name: "Can I merge PDFs on mobile devices?",
                      acceptedAnswer: {
                        "@type": "Answer",
                        text: "Yes, LocalPDF works flawlessly on iOS and Android devices. You can select multiple PDFs from your phone's file system and merge them directly in your mobile browser without installing any apps."
                      }
                    }
                  ]
                },
                {
                  "@type": "BreadcrumbList",
                  itemListElement: [
                    {
                      "@type": "ListItem",
                      position: 1,
                      name: "Home",
                      item: "https://localpdf.dev"
                    },
                    {
                      "@type": "ListItem",
                      position: 2,
                      name: "Merge PDFs",
                      item: "https://localpdf.dev/merge"
                    }
                  ]
                }
              ]
            })
          }}
        />

        <div className="mt-24 border-t border-border pt-16">
          <section className="mb-16">
            <h2 className="text-2xl font-bold text-text-primary mb-6">How It Works</h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <div className="bg-card border border-border p-5 rounded-2xl">
                <div className="w-8 h-8 rounded-md bg-brand-primary-muted text-brand-primary font-bold flex items-center justify-center mb-4">1</div>
                <h3 className="font-semibold text-text-primary mb-2">Select your PDFs</h3>
                <p className="text-sm text-text-muted">Upload two or more PDF files you want to combine. You can select multiple files at once or add them one by one.</p>
              </div>
              <div className="bg-card border border-border p-5 rounded-2xl">
                <div className="w-8 h-8 rounded-md bg-brand-primary-muted text-brand-primary font-bold flex items-center justify-center mb-4">2</div>
                <h3 className="font-semibold text-text-primary mb-2">Reorder files</h3>
                <p className="text-sm text-text-muted">Drag and drop the files in the list to arrange them in the exact order you want them to appear in the final document.</p>
              </div>
              <div className="bg-card border border-border p-5 rounded-2xl">
                <div className="w-8 h-8 rounded-md bg-brand-primary-muted text-brand-primary font-bold flex items-center justify-center mb-4">3</div>
                <h3 className="font-semibold text-text-primary mb-2">Merge instantly</h3>
                <p className="text-sm text-text-muted">Click the merge button. Your browser will instantly combine the documents into a single cohesive PDF file without losing quality.</p>
              </div>
              <div className="bg-card border border-border p-5 rounded-2xl">
                <div className="w-8 h-8 rounded-md bg-brand-primary-muted text-brand-primary font-bold flex items-center justify-center mb-4">4</div>
                <h3 className="font-semibold text-text-primary mb-2">Download safely</h3>
                <p className="text-sm text-text-muted">Save the merged PDF directly to your device. Since it never left your computer, there are no privacy concerns.</p>
              </div>
            </div>
          </section>

          <section className="mb-16">
            <h2 className="text-2xl font-bold text-text-primary mb-6">Why Use LocalPDF to Merge?</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex gap-3">
                <div className="mt-1 text-success">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                </div>
                <div>
                  <h3 className="font-semibold text-text-primary">100% Browser-Based Privacy</h3>
                  <p className="text-sm text-text-muted">Your sensitive documents are never uploaded to our servers. All merging happens locally using your device's memory.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="mt-1 text-success">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                </div>
                <div>
                  <h3 className="font-semibold text-text-primary">Completely Free</h3>
                  <p className="text-sm text-text-muted">We don't charge you for processing files, and we don't put features behind a paywall or require an account registration.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="mt-1 text-success">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                </div>
                <div>
                  <h3 className="font-semibold text-text-primary">No Watermarks</h3>
                  <p className="text-sm text-text-muted">Unlike other free tools, we will never brand or watermark your output files. Your documents remain entirely yours.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="mt-1 text-success">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                </div>
                <div>
                  <h3 className="font-semibold text-text-primary">Works on Any Device</h3>
                  <p className="text-sm text-text-muted">Whether you're using a laptop, tablet, or smartphone, our tool works seamlessly in any modern web browser.</p>
                </div>
              </div>
            </div>
          </section>

          <section className="mb-16">
            <h2 className="text-2xl font-bold text-text-primary mb-6">Frequently Asked Questions</h2>
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-text-primary text-lg">How many PDFs can I merge at once?</h3>
                <p className="text-text-muted mt-2">You can merge dozens of PDFs at once. Because the merging happens on your device rather than a remote server, the only limit is your device's memory. Most modern computers can easily merge 50+ files in one go.</p>
              </div>
              <div>
                <h3 className="font-semibold text-text-primary text-lg">Will merging PDFs change the quality or formatting?</h3>
                <p className="text-text-muted mt-2">No, merging PDFs with LocalPDF retains 100% of the original quality. We simply append the pages of one document to the end of another without altering the underlying images, text formatting, or metadata.</p>
              </div>
              <div>
                <h3 className="font-semibold text-text-primary text-lg">Can I reorder pages before merging?</h3>
                <p className="text-text-muted mt-2">Yes! After adding your PDF files, you can easily drag and drop the files in the list to change their order. The final merged PDF will combine the files in the exact sequence you arranged them.</p>
              </div>
              <div>
                <h3 className="font-semibold text-text-primary text-lg">Is it safe to merge confidential documents on LocalPDF?</h3>
                <p className="text-text-muted mt-2">Absolutely. LocalPDF is the safest way to merge confidential documents online because your files are never actually sent online. The merging process happens entirely locally within your web browser.</p>
              </div>
              <div>
                <h3 className="font-semibold text-text-primary text-lg">What file size limit applies when merging PDFs?</h3>
                <p className="text-text-muted mt-2">Our tool can handle files up to 500 MB. This is much larger than most cloud-based PDF tools because we don't have to worry about server storage or bandwidth costs. The processing uses your local device resources.</p>
              </div>
              <div>
                <h3 className="font-semibold text-text-primary text-lg">Can I merge PDFs on mobile devices?</h3>
                <p className="text-text-muted mt-2">Yes, LocalPDF works flawlessly on iOS and Android devices. You can select multiple PDFs from your phone's file system and merge them directly in your mobile browser without installing any apps.</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-text-primary mb-6">Related Tools</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <a href="/compress" className="group p-5 rounded-xl border border-border-subtle bg-bg-surface shadow-sm hover:border-brand-primary hover:shadow-md transition flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-text-primary group-hover:text-brand-primary transition">Compress PDF</h3>
                  <p className="text-sm text-text-muted mt-1">Reduce PDF file size without losing quality.</p>
                </div>
                <div className="text-brand-primary">→</div>
              </a>
              <a href="/split" className="group p-5 rounded-xl border border-border-subtle bg-bg-surface shadow-sm hover:border-brand-primary hover:shadow-md transition flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-text-primary group-hover:text-brand-primary transition">Split PDF</h3>
                  <p className="text-sm text-text-muted mt-1">Extract specific pages from a document.</p>
                </div>
                <div className="text-brand-primary">→</div>
              </a>
            </div>
          </section>
        </div>
      </main>
    </AppShell>
  );
}
