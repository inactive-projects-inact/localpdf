"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import ToolPageShell from "../components/ToolPageShell";
import ToolUploadZone from "../components/ToolUploadZone";
import ToolProcessingPanel from "../components/ToolProcessingPanel";
import ToolSuccessPanel from "../components/ToolSuccessPanel";
import ToolErrorPanel from "../components/ToolErrorPanel";
import ToolSizeResult from "../components/ToolSizeResult";
import { useFileHistory } from "../components/FileHistoryProvider";
import { PRESETS, compressPdf, downloadPdfBytes, isValidPdfFile } from "../lib/pdfCompressor";
import { getToolDefinition } from "../lib/tool-registry";

const TOOL = getToolDefinition("compress");
const MAX_CLIENT_FILE_BYTES = TOOL.input.maxSizeBytes;

export default function CompressMain() {
  const [file, setFile] = useState(null);
  const [presetKey, setPresetKey] = useState("medium");
  const [status, setStatus] = useState("idle");
  const [errorMessage, setErrorMessage] = useState(null);
  const [progress, setProgress] = useState({ stage: "idle", current: 0, total: 0 });
  const [result, setResult] = useState(null);
  const abortRef = useRef(null);
  const runIdRef = useRef(0);

  const { pendingFiles, pendingTool, clearPendingFiles } = useFileHistory();

  const selectedPreset = PRESETS[presetKey] ?? PRESETS.medium;
  const progressPercent = progress.total ? Math.round((progress.current / progress.total) * 100) : 0;

  const resetAll = useCallback(() => {
    abortRef.current?.abort();
    runIdRef.current += 1;
    setFile(null);
    setStatus("idle");
    setErrorMessage(null);
    setProgress({ stage: "idle", current: 0, total: 0 });
    setResult(null);
    setPresetKey("medium");
  }, []);

  const handleFile = useCallback((incomingFile) => {
    if (!incomingFile) return;
    if (!isValidPdfFile(incomingFile)) {
      toast.error("Please select a valid PDF.");
      return;
    }
    if (incomingFile.size > MAX_CLIENT_FILE_BYTES) {
      toast.error("File exceeds the 100 MB client-side processing limit.");
      return;
    }
    setFile(incomingFile);
    setErrorMessage(null);
    setResult(null);
    setStatus("idle");
  }, []);

  useEffect(() => {
    if (pendingFiles.length > 0 && !file && (!pendingTool || pendingTool === "compress")) {
      const nextFile = pendingFiles[0];
      clearPendingFiles();
      Promise.resolve().then(() => handleFile(nextFile));
    }
  }, [pendingFiles, pendingTool, file, handleFile, clearPendingFiles]);

  const onDrop = useCallback((acceptedFiles) => {
    const uploaded = acceptedFiles[0];
    if (uploaded) handleFile(uploaded);
  }, [handleFile]);

  const handleCompress = useCallback(async () => {
    if (!file) return;

    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("compressing");
    setErrorMessage(null);
    setResult(null);
    setProgress({ stage: "Processing in your browser", current: 0, total: 100 });

    toast.loading("Compressing PDF...", { id: "compress" });

    try {
      const compressed = await compressPdf(file, presetKey, (stage, current, total) => {
        if (runIdRef.current !== runId) return;
        const pct = total ? Math.round((current / total) * 100) : 0;
        setProgress({
          stage: stage === "loading" ? "Reading PDF" : stage === "compressing" ? "Compressing pages" : "Finalizing",
          current: pct,
          total: 100,
        });
      }, controller.signal);

      if (runIdRef.current !== runId) return;
      setResult(compressed);
      setStatus("done");
      toast.success("Your compressed PDF is ready.", { id: "compress" });
    } catch (err) {
      if (runIdRef.current !== runId) return;
      const message = err instanceof Error ? err.message : "Compression failed.";
      setErrorMessage(message);
      setStatus(err?.name === "AbortError" ? "idle" : "error");
      if (err?.name !== "AbortError") {
        toast.error(message, { id: "compress" });
      }
    } finally {
      if (runIdRef.current === runId) {
        abortRef.current = null;
      }
    }
  }, [file, presetKey]);

  const handleCancel = useCallback(() => {
    runIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
    setProgress({ stage: "idle", current: 0, total: 0 });
    toast.info("Compression cancelled.", { id: "compress" });
  }, []);

  const handleDownloadAgain = useCallback(() => {
    if (!result?.pdfBytes || !file) return;
    downloadPdfBytes(result.pdfBytes, file.name);
  }, [result, file]);

  const fileName = file?.name ?? "";
  const hasFile = file !== null;
  const isCompressing = status === "compressing";
  const isDone = status === "done" && result !== null;
  const isError = status === "error";
  const outputName = file ? `${file.name.replace(/\.[^.]+$/, "")}_compressed.pdf` : "compressed.pdf";

  return (
    <ToolPageShell
      title="Compress PDF"
      description="Reduce file size locally. Pages with images may be rasterized to shrink size."
      category="Edit"
    >
      <div className="mb-6 flex items-start gap-3 rounded-lg border border-warning-500/30 bg-warning-50 p-4">
        <p className="text-body-s text-ink-700">
          <strong className="text-ink-900">Note:</strong> Pages containing images may be converted to JPEG to reduce size. Pure text pages stay intact.
        </p>
      </div>

      {!hasFile && !isDone && (
        <ToolUploadZone
          accept={TOOL.input.accept}
          multiple={false}
          maxSize={TOOL.input.maxSizeBytes}
          emptyTitle="Drop your PDF here"
          dragTitle="Drop to compress"
          helperText="PDF only · Up to 100 MB · Processed in your browser"
          onDrop={onDrop}
          onDropRejected={(rejections) => {
            const err = rejections[0]?.errors[0];
            if (err?.code === "file-too-large") {
              toast.error("File exceeds the 100 MB limit.");
            } else {
              toast.error("Please select a valid PDF.");
            }
          }}
        />
      )}

      {hasFile && !isDone && !isError && (
        <div className="rounded-xl border border-border bg-paper-0 p-5 shadow-sm sm:p-6">
          <div className="grid gap-5">
            <div className="flex items-center justify-between gap-3 rounded-lg bg-paper-100 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-body-m font-medium text-ink-900">{fileName}</p>
                <p className="text-body-s text-ink-500">Ready to compress</p>
              </div>
              <button
                type="button"
                onClick={() => setFile(null)}
                className="shrink-0 text-body-s font-medium text-ink-500 hover:text-ink-900"
              >
                Change file
              </button>
            </div>

            <label className="grid gap-2">
              <span className="text-body-s font-semibold text-ink-900">Compression preset</span>
              <select
                id="compression-level"
                value={presetKey}
                onChange={(e) => setPresetKey(e.target.value)}
                disabled={isCompressing}
                className="rounded-lg border border-border bg-paper-0 px-4 py-3 text-body-s text-ink-900"
              >
                {Object.entries(PRESETS).map(([key, preset]) => (
                  <option key={key} value={key}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              id="compress-btn"
              type="button"
              onClick={() => void handleCompress()}
              disabled={!hasFile || isCompressing}
              className="btn-primary w-full sm:w-auto disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCompressing ? "Compressing…" : "Compress PDF"}
            </button>
          </div>
        </div>
      )}

      {isCompressing && (
        <ToolProcessingPanel
          fileName={fileName}
          statusLine={`${progress.stage} — ${progressPercent}%`}
          progress={progressPercent}
          onCancel={handleCancel}
        />
      )}

      {isDone && result && file && (
        <ToolSuccessPanel
          title="Compression complete!"
          fileName={outputName}
          message="Your file was compressed on your device. Download again anytime."
          downloadLabel="Download PDF"
          onDownload={handleDownloadAgain}
          onTryAgain={() => {
            setStatus("idle");
            setResult(null);
          }}
          onChooseAnother={resetAll}
          nextActions={[
            { href: "/merge", label: "Merge PDF" },
            { href: "/split", label: "Split PDF" },
            { href: "/protect", label: "Protect PDF" },
          ]}
        >
          <ToolSizeResult
            originalSize={file.size}
            newSize={result.compressedBytes ?? result.pdfBytes?.byteLength ?? file.size}
          />
          {result.warnings?.length > 0 && (
            <ul className="mt-4 list-disc space-y-1 pl-5 text-body-s text-ink-500">
              {result.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </ToolSuccessPanel>
      )}

      {isError && errorMessage && (
        <ToolErrorPanel
          title="Compression failed"
          message={errorMessage}
          onTryAgain={() => {
            setErrorMessage(null);
            setStatus("idle");
            void handleCompress();
          }}
          onChooseAnother={resetAll}
        />
      )}
    </ToolPageShell>
  );
}
