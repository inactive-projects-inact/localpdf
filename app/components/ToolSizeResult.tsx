"use client";

import { formatBytes } from "../lib/format-bytes";

interface ToolSizeResultProps {
  originalSize: number;
  newSize: number;
  originalLabel?: string;
  newLabel?: string;
}

export default function ToolSizeResult({
  originalSize,
  newSize,
  originalLabel = "Original size",
  newLabel = "New size",
}: ToolSizeResultProps) {
  const savedBytes = Math.max(0, originalSize - newSize);
  const percentSaved =
    originalSize > 0 ? Math.round((savedBytes / originalSize) * 100) : 0;
  const grew = newSize > originalSize;

  return (
    <div className="rounded-lg border border-border bg-paper-0 p-5">
      <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <div className="text-center sm:text-left">
          <p className="text-caption text-ink-500">{originalLabel}</p>
          <p className="mt-1 font-mono text-xl font-medium text-ink-500 line-through decoration-ink-300">
            {formatBytes(originalSize)}
          </p>
        </div>
        <div className="hidden text-center text-ink-300 sm:block" aria-hidden>
          →
        </div>
        <div className="text-center sm:text-right">
          <p className="text-caption text-ink-500">{newLabel}</p>
          <div className="mt-1 flex flex-wrap items-baseline justify-center gap-2 sm:justify-end">
            <span className="font-mono text-2xl font-medium text-ink-900">
              {formatBytes(newSize)}
            </span>
            {!grew && percentSaved > 0 && (
              <span className="rounded-full bg-local-500 px-2.5 py-0.5 font-mono text-xs font-medium text-white">
                −{percentSaved}%
              </span>
            )}
            {grew && (
              <span className="rounded-full bg-warning-50 px-2.5 py-0.5 font-mono text-xs font-medium text-warning-500">
                +{formatBytes(newSize - originalSize)}
              </span>
            )}
          </div>
        </div>
      </div>
      {!grew && savedBytes > 0 && (
        <p className="mt-4 text-center text-body-s text-local-700 sm:text-left">
          You saved <strong className="font-mono">{formatBytes(savedBytes)}</strong> ({percentSaved}% smaller)
        </p>
      )}
    </div>
  );
}
