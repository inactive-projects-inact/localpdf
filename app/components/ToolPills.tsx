"use client";

import type { HomeToolId } from "../lib/design-system";
import { orderedHomeTools } from "../lib/design-system";

const icons: Record<HomeToolId, React.ReactNode> = {
  compress: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0">
      <path d="M8 13V3M4 7l4-4 4 4" />
    </svg>
  ),
  merge: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0">
      <path d="M3 4h10M3 8h10M3 12h6" />
    </svg>
  ),
  split: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0">
      <path d="M8 2v12M4 6l4-4 4 4M4 10l4 4 4-4" />
    </svg>
  ),
  rotate: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0">
      <path d="M13 3a5 5 0 10-4 8.5M13 3v3M13 3H10" />
    </svg>
  ),
  textToPdf: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0">
      <path d="M3 3h10v10H3zM5 6h6M5 9h4" />
    </svg>
  ),
  resize: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0">
      <path d="M4 12V4h8v8H4zM10 6l2-2M10 10l2 2" />
    </svg>
  ),
  pageNumbers: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0">
      <path d="M4 12h1M7 12h1M10 12h1M4 8h8M4 4h8" />
    </svg>
  ),
  crop: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0">
      <path d="M4 4h8v8H4zM6 2v2M10 2v2M6 12v2M10 12v2" />
    </svg>
  ),
  jpg2pdf: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0">
      <rect x="2" y="3" width="12" height="10" rx="1" />
      <path d="M5 10l2-3 2 2 2-4" />
    </svg>
  ),
  pdf2jpg: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0">
      <rect x="2" y="2" width="12" height="12" rx="1" />
      <circle cx="6" cy="6" r="1.5" fill="currentColor" />
    </svg>
  ),
  watermark: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0">
      <path d="M2 14l4-8 3 4 3-6 4 10" />
    </svg>
  ),
  redact: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0">
      <rect x="3" y="3" width="10" height="10" rx="1" />
      <path d="M4 8h8" />
    </svg>
  ),
  signature: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0">
      <path d="M2 12c4-6 8-6 12 0" />
      <path d="M3 12h10" />
    </svg>
  ),
  pdfToWord: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0">
      <path d="M3 3h10v10H3zM5 6h6M5 9h4M5 12h2" />
    </svg>
  ),
  wordToPdf: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0">
      <path d="M3 2h6l4 4v8H3V2zM9 2v4h4" />
    </svg>
  ),
  pdfToExcel: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0">
      <rect x="2" y="2" width="12" height="12" rx="1" />
      <path d="M2 6h12M2 10h12M7 2v12" />
    </svg>
  ),
  excelToPdf: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0">
      <rect x="2" y="2" width="12" height="12" rx="1" />
      <path d="M5 5l6 6M11 5L5 11" />
    </svg>
  ),
  protect: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0">
      <path d="M8 2L3 4v4c0 3 2.5 5 5 6 2.5-1 5-3 5-6V4L8 2z" />
    </svg>
  ),
  unlock: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0">
      <rect x="4" y="8" width="8" height="6" rx="1" />
      <path d="M6 8V5a2 2 0 014 0" />
    </svg>
  ),
  ocr: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0">
      <path d="M3 4h10v8H3zM5 6h6M5 9h4" />
    </svg>
  ),
  organize: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0">
      <path d="M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3zM9 9h4v4H9z" />
    </svg>
  ),
};

interface ToolPillsProps {
  selected: HomeToolId;
  onSelect: (tool: HomeToolId) => void;
}

export default function ToolPills({ selected, onSelect }: ToolPillsProps) {
  return (
    <div className="pills-lp mx-auto mt-6 flex w-full max-w-[680px] flex-wrap justify-center gap-2.5 px-4">
      {orderedHomeTools.map((tool) => (
        <button
          key={tool.id}
          type="button"
          className={`pill-lp ${selected === tool.id ? "is-active" : ""}`}
          data-short={tool.shortLabel}
          onClick={() => onSelect(tool.id)}
        >
          {icons[tool.id]}
          <span className="pill-label">{tool.label}</span>
        </button>
      ))}
    </div>
  );
}
