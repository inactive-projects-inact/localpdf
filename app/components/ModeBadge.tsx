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
      className={`inline-flex h-6 items-center gap-1.5 rounded-md px-3 font-mono text-[12px] font-medium leading-5 ${
        isLocal
          ? "border border-trust/30 bg-trust-tint text-trust"
          : "border border-cloud-500/30 bg-cloud-50 text-cloud-700"
      } ${className}`}
      title={
        isLocal
          ? "Processing happens in this browser tab. No uploads. No tracking."
          : "This feature requires cloud processing."
      }
    >
      {isLocal ? (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-trust" aria-hidden />
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
