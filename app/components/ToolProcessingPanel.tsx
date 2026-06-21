"use client";

import { Loader2 } from "lucide-react";
import ProgressBar from "./ProgressBar";
import ModeBadge from "./ModeBadge";

interface ToolProcessingPanelProps {
  fileName?: string;
  statusLine: string;
  progress: number;
  onCancel?: () => void;
}

export default function ToolProcessingPanel({
  fileName,
  statusLine,
  progress,
  onCancel,
}: ToolProcessingPanelProps) {
  return (
    <div
      className="upload-box is-processing mt-8"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2 className="h-8 w-8 animate-spin text-local-500" aria-hidden />
      {fileName && (
        <p className="max-w-[320px] truncate text-body-m font-medium text-ink-900">{fileName}</p>
      )}
      <div className="w-full max-w-md px-6">
        <ModeBadge mode="local" className="mb-3" />
        <ProgressBar progress={progress} label={statusLine} />
      </div>
      {onCancel && (
        <button type="button" onClick={onCancel} className="btn-secondary mt-2">
          Cancel
        </button>
      )}
    </div>
  );
}
