"use client";

interface ProgressBarProps {
  progress: number;
  label?: string;
  mode?: "local" | "cloud";
  showPercent?: boolean;
}

export default function ProgressBar({ progress, label, mode = "local", showPercent = false }: ProgressBarProps) {
  const clamped = Math.min(Math.max(progress, 0), 100);
  const isActive = clamped > 0 && clamped < 100;

  return (
    <div className="flex w-full flex-col gap-2">
      {(label || showPercent) && (
        <div className="flex items-center justify-between gap-2">
          {label && (
            <p className="min-w-0 truncate font-mono text-[13px] font-medium text-text-muted">{label}</p>
          )}
          {showPercent && (
            <span className="shrink-0 font-mono text-[13px] font-medium text-text-muted">{clamped}%</span>
          )}
        </div>
      )}
      <div className="progress-track">
        <div
          className={`progress-fill ${mode === "cloud" ? "is-cloud" : "is-trust"} ${isActive ? "is-active" : ""}`}
          style={{ width: `${clamped}%` }}
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}
