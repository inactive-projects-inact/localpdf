import type { ProcessingMode } from "../lib/design-system";

interface ModeBadgeProps {
  mode?: ProcessingMode;
  className?: string;
  compact?: boolean;
}

export default function ModeBadge({ mode = "local", className = "", compact = false }: ModeBadgeProps) {
  const isLocal = mode === "local";

  return (
    <span
      className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 font-mono text-[13px] font-medium leading-5 ${
        isLocal
          ? "border border-local-500/40 bg-local-50 text-local-700"
          : "border border-cloud-500/40 bg-cloud-50 text-cloud-700"
      } ${className}`}
    >
      {isLocal ? (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-local-500" aria-hidden />
      ) : (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full border border-cloud-500 bg-transparent"
          aria-hidden
        />
      )}
      {compact ? (isLocal ? "On-device" : "Cloud") : isLocal ? "On-device — never uploaded" : "Cloud processing"}
    </span>
  );
}
