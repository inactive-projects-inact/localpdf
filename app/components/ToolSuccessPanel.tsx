"use client";

import Link from "next/link";
import { CheckCircle2, Download } from "lucide-react";
import ModeBadge from "./ModeBadge";

interface ToolSuccessPanelProps {
  title: string;
  fileName: string;
  message?: string;
  downloadLabel?: string;
  onDownload: () => void;
  onTryAgain: () => void;
  onChooseAnother?: () => void;
  children?: React.ReactNode;
  nextActions?: { href: string; label: string }[];
  processingTimeMs?: number;
}

export default function ToolSuccessPanel({
  title,
  fileName,
  message,
  downloadLabel = "Download",
  onDownload,
  onTryAgain,
  onChooseAnother,
  children,
  nextActions,
  processingTimeMs,
}: ToolSuccessPanelProps) {
  return (
    <div
      className="mt-8 rounded-lg border border-trust/30 bg-trust-tint p-6 sm:p-8 animate-slide-in-up"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-trust/15 animate-success-glow">
          <CheckCircle2 className="h-7 w-7 text-trust" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-heading-s">{title}</h2>
          <p className="mt-1 truncate text-body-m text-text-secondary" title={fileName}>
            {fileName}
          </p>
          {message && <p className="mt-2 text-body-s text-text-muted">{message}</p>}
          <div className="mt-3">
            <ModeBadge mode="local" compact />
          </div>
          {processingTimeMs !== undefined && (
            <p className="mt-2 font-mono text-xs text-trust animate-fade-in">
              Done in your browser in {processingTimeMs}ms · No upload
            </p>
          )}
        </div>
      </div>

      {children && <div className="mt-6">{children}</div>}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button type="button" onClick={onDownload} className="btn-primary is-trust inline-flex gap-2">
          <Download className="h-4 w-4" aria-hidden />
          {downloadLabel}
        </button>
        <button type="button" onClick={onTryAgain} className="btn-secondary">
          Try again
        </button>
        {onChooseAnother && (
          <button type="button" onClick={onChooseAnother} className="btn-secondary">
            Choose another file
          </button>
        )}
      </div>

      {nextActions && nextActions.length > 0 && (
        <div className="mt-6 border-t border-trust/20 pt-5">
          <p className="text-caption text-text-muted">Often used next</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {nextActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="rounded-md border border-border-subtle bg-bg-surface px-3 py-1.5 text-body-s font-medium text-text-primary shadow-xs transition hover:border-border-strong hover:shadow-sm"
              >
                {action.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
