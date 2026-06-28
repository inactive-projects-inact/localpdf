"use client";

import { AlertTriangle } from "lucide-react";

interface ToolErrorPanelProps {
  title?: string;
  message: string;
  onTryAgain: () => void;
  onChooseAnother?: () => void;
  details?: string;
}

export default function ToolErrorPanel({
  title = "Something went wrong",
  message,
  onTryAgain,
  onChooseAnother,
  details,
}: ToolErrorPanelProps) {
  return (
    <div
      className="mt-8 rounded-lg border border-destructive/30 bg-destructive-tint p-6 sm:p-8 animate-slide-in-up"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start gap-4">
        <AlertTriangle className="h-7 w-7 shrink-0 text-destructive" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-heading-s text-destructive">{title}</h2>
          <p className="mt-2 text-body-s text-text-secondary">{message}</p>
        </div>
      </div>
      {details && (
        <details className="mt-4">
          <summary className="cursor-pointer text-body-s text-text-muted transition hover:text-text-secondary">
            Technical details
          </summary>
          <pre className="mt-2 overflow-x-auto rounded-md bg-bg-surface-muted p-3 font-mono text-xs text-text-muted">
            {details}
          </pre>
        </details>
      )}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button type="button" onClick={onTryAgain} className="btn-primary">
          Try again
        </button>
        {onChooseAnother && (
          <button type="button" onClick={onChooseAnother} className="btn-secondary">
            Choose another file
          </button>
        )}
      </div>
    </div>
  );
}
