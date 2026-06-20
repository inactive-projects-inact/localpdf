"use client";

interface ProgressBarProps {
  progress: number;
  label?: string;
}

export default function ProgressBar({ progress, label }: ProgressBarProps) {
  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex items-center justify-between text-xs font-medium text-zinc-400">
        <span className="truncate text-zinc-400">{label || "Processing..."}</span>
        <span className="tabular-nums font-semibold text-zinc-200">{Math.round(progress)}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full rounded-full bg-[#00E676] transition-all duration-300 ease-out"
          style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
        />
      </div>
    </div>
  );
}
