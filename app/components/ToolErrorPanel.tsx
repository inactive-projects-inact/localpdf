"use client";

import { AlertTriangle } from "lucide-react";

interface ToolErrorPanelProps {
  title?: string;
  message: string;
  onTryAgain: () => void;
  onChooseAnother?: () => void;
}

export default function ToolErrorPanel({
  title = "Something went wrong",
  message,
  onTryAgain,
  onChooseAnother,
}: ToolErrorPanelProps) {
  return (
    <div
      className="mt-8 rounded-xl border border-error-500/40 bg-error-50 p-6 sm:p-8"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start gap-4">
        <AlertTriangle className="h-7 w-7 shrink-0 text-error-500" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-heading-s text-error-500">{title}</h2>
          <p className="mt-2 text-body-s text-ink-700">{message}</p>
        </div>
      </div>
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
