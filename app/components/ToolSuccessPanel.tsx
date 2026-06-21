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
}: ToolSuccessPanelProps) {
  return (
    <div
      className="mt-8 rounded-xl border border-local-500/30 bg-local-50 p-6 sm:p-8"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-local-500/15">
          <CheckCircle2 className="h-7 w-7 text-local-500" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-heading-s text-ink-900">{title}</h2>
          <p className="mt-1 truncate text-body-m text-ink-700" title={fileName}>
            {fileName}
          </p>
          {message && <p className="mt-2 text-body-s text-ink-500">{message}</p>}
          <div className="mt-3">
            <ModeBadge mode="local" compact />
          </div>
        </div>
      </div>

      {children && <div className="mt-6">{children}</div>}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button type="button" onClick={onDownload} className="btn-primary inline-flex gap-2">
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
        <div className="mt-6 border-t border-local-500/20 pt-5">
          <p className="text-caption text-ink-500">Often used next</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {nextActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="rounded-full border border-border bg-paper-0 px-3 py-1.5 text-body-s font-medium text-ink-900 transition hover:border-ink-300 hover:bg-paper-100"
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
