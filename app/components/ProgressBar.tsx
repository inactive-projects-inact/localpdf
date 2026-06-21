"use client";

interface ProgressBarProps {
  progress: number;
  label?: string;
  mode?: "local" | "cloud";
}

export default function ProgressBar({ progress, label, mode = "local" }: ProgressBarProps) {
  const clamped = Math.min(Math.max(progress, 0), 100);

  return (
    <div className="flex w-full flex-col gap-2">
      {label && (
        <p className="truncate font-mono text-[13px] font-medium text-ink-500">{label}</p>
      )}
      <div className="progress-track">
        <div
          className={`progress-fill ${mode === "cloud" ? "is-cloud" : ""}`}
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
