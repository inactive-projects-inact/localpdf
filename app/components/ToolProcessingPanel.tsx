"use client";

import ProgressBar from "./ProgressBar";
import ModeBadge from "./ModeBadge";

const STAGES = [
  "Reading files",
  "Analyzing pages",
  "Applying operation",
  "Preparing download",
] as const;

interface ToolProcessingPanelProps {
  fileName?: string;
  statusLine: string;
  progress: number;
  onCancel?: () => void;
  stage?: number;
}

function deriveStage(progress: number): number {
  if (progress < 25) return 0;
  if (progress < 50) return 1;
  if (progress < 80) return 2;
  return 3;
}

export default function ToolProcessingPanel({
  fileName,
  statusLine,
  progress,
  onCancel,
  stage,
}: ToolProcessingPanelProps) {
  const currentStage = stage ?? deriveStage(progress);

  return (
    <div
      className="upload-box is-processing mt-8"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      {/* Multi-stage narrative */}
      <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 mb-4">
        {STAGES.map((label, i) => {
          const stageState = i < currentStage ? "is-complete" : i === currentStage ? "is-active" : "";
          return (
            <span key={label} className={`stage-label ${stageState}`}>
              <span className={`stage-dot ${stageState}`} />
              <span className="hidden sm:inline">{label}</span>
            </span>
          );
        })}
      </div>

      {fileName && (
        <p className="max-w-[320px] truncate text-body-m font-medium text-text-primary">{fileName}</p>
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
