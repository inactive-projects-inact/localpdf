"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, Check, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useFileHistory } from "./FileHistoryProvider";
import ModeBadge from "./ModeBadge";
import ProgressBar from "./ProgressBar";
import type { HomeToolId } from "../lib/design-system";
import type { ProcessingMode } from "../lib/design-system";
import { getToolDefinition, validateFilesForTool } from "../lib/design-system";

export type UploadBoxState = "empty" | "processing" | "success" | "error";

interface UploadBoxProps {
  selectedTool: HomeToolId;
  mode?: ProcessingMode;
  id?: string;
  className?: string;
  /** When set, renders as a controlled display-only box (tool pages). */
  state?: UploadBoxState;
  fileName?: string;
  progress?: number;
  statusLine?: string;
  resultStat?: string;
  errorMessage?: string;
  onDownload?: () => void;
  onBrowse?: () => void;
}

export default function UploadBox({
  selectedTool,
  mode = "local",
  id,
  className = "",
  state: controlledState,
  fileName,
  progress = 0,
  statusLine,
  resultStat,
  errorMessage,
  onDownload,
  onBrowse,
}: UploadBoxProps) {
  const router = useRouter();
  const { setPendingUpload } = useFileHistory();
  const tool = getToolDefinition(selectedTool);
  const [internalState, setInternalState] = useState<UploadBoxState>("empty");
  const state = controlledState ?? internalState;
  const isCloud = mode === "cloud";

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;

      void (async () => {
        const validFiles = await validateFilesForTool(acceptedFiles, selectedTool);
        if (validFiles.length === 0) {
          toast.error(tool.input.invalidMessage);
          return;
        }

        setPendingUpload(selectedTool, validFiles);
        setInternalState("processing");
        router.push(tool.route);
      })();
    },
    [router, selectedTool, setPendingUpload, tool],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: tool.input.accept,
    multiple: tool.input.multiple,
    maxFiles: tool.input.maxFiles,
    noClick: state !== "empty",
    maxSize: tool.input.maxSizeBytes,
    disabled: state !== "empty",
    onDropRejected: (rejections) => {
      const err = rejections[0]?.errors[0];
      if (err?.code === "file-too-large") {
        const limitMb = Math.round(tool.input.maxSizeBytes / 1024 / 1024);
        toast.error(`This file is too large — files over ${limitMb}MB are not supported locally.`);
      } else {
        toast.error(tool.input.invalidMessage);
      }
    },
  });

  const handleBrowse = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onBrowse) {
      onBrowse();
    } else {
      open();
    }
  };

  const boxClass = [
    "upload-box",
    isCloud ? "is-cloud" : "",
    isDragActive ? "is-dragover" : "",
    state === "processing" ? "is-processing" : "",
    state === "success" ? "is-success" : "",
    state === "error" ? "is-error" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (state === "processing") {
    return (
      <div id={id} className={boxClass}>
        <p className="max-w-[320px] truncate text-body-m text-text-primary">{fileName}</p>
        <div className="w-full max-w-md px-6">
          <ModeBadge mode={mode} className="mb-3" />
          <ProgressBar progress={progress} label={statusLine} mode={mode} />
        </div>
      </div>
    );
  }

  if (state === "success") {
    return (
      <div id={id} className={boxClass} role="status" aria-live="polite">
        <Check className="h-8 w-8 text-trust" aria-hidden />
        {fileName && (
          <p className="max-w-[320px] truncate text-body-m font-medium text-text-primary">{fileName}</p>
        )}
        {resultStat && (
          <p className="font-mono text-[13px] font-medium text-text-primary">{resultStat}</p>
        )}
        {onDownload && (
          <button type="button" onClick={onDownload} className="btn-primary is-trust">
            Download
          </button>
        )}
        <ModeBadge mode={mode} />
      </div>
    );
  }

  if (state === "error") {
    return (
      <div id={id} className={boxClass} role="alert" aria-live="assertive">
        <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden />
        <p className="max-w-md text-body-s text-destructive">{errorMessage}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {onBrowse && (
            <button type="button" onClick={onBrowse} className="btn-primary">
              Choose another file
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div {...getRootProps()} id={id} className={boxClass}>
      <input {...getInputProps()} aria-label={`Upload ${tool.input.label}`} />
      <Upload className="h-10 w-10 text-text-muted" strokeWidth={1.5} aria-hidden />
      <p className="text-heading-s text-text-primary">
        {isDragActive ? tool.input.dragActiveTitle : "Drop your PDF here"}
      </p>
      <button
        type="button"
        onClick={handleBrowse}
        className="text-body-s text-text-muted underline-offset-2 transition hover:text-brand-primary hover:underline"
      >
        or click to browse
      </button>
      <ModeBadge mode={mode} />
    </div>
  );
}
