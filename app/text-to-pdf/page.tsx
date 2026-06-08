"use client";

import { useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import AppShell from "../components/AppShell";
import ShortcutHint from "../components/ShortcutHint";
import { downloadBlob } from "../lib/pdf-utils";
import {
  countWords,
  type TextAlignment,
  type TextFontFamily,
  type TextMarginPreset,
  type TextPageSize,
} from "../lib/text-to-pdf";
import { useProcessorWorker } from "../hooks/useProcessorWorker";

const ACCENT = "#3B3BFF";
const MAX_TEXT_CHARS = 200000;

const FONT_OPTIONS: TextFontFamily[] = ["Helvetica", "Times Roman", "Courier"];
const SIZE_OPTIONS = [8, 10, 12, 14, 16, 18, 24, 32];
const PAGE_OPTIONS: TextPageSize[] = ["A4", "A3", "Letter", "Legal"];
const COLOR_OPTIONS = [
  { key: "black", label: "Black", swatch: "#000000" },
  { key: "dark gray", label: "Dark gray", swatch: "#333333" },
  { key: "navy", label: "Navy", swatch: "#000080" },
  { key: "dark green", label: "Dark green", swatch: "#005926" },
  { key: "dark red", label: "Dark red", swatch: "#8B0000" },
];

export default function TextToPdfPage() {
  const [text, setText] = useState("");
  const [fontFamily, setFontFamily] = useState<TextFontFamily>("Helvetica");
  const [fontSize, setFontSize] = useState(12);
  const [pageSize, setPageSize] = useState<TextPageSize>("A4");
  const [margin, setMargin] = useState<TextMarginPreset>("medium");
  const [alignment, setAlignment] = useState<TextAlignment>("left");
  const [colorKey, setColorKey] = useState("black");

  const worker = useProcessorWorker();

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const charCount = text.length;
  const wordCount = countWords(text);

  const handleGenerate = () => {
    if (!text.trim()) {
      toast.error("Please enter some text first.", { id: "text2pdf" });
      return;
    }
    if (text.length > MAX_TEXT_CHARS) {
      toast.error("Text is too large. Please limit input to 200,000 characters.", { id: "text2pdf" });
      return;
    }

    worker.process(null, {
      tool: "text-to-pdf",
      options: { text, fontFamily, fontSize, pageSize, margin, alignment, colorKey }
    }, "document.pdf");
  };

  useEffect(() => {
    if (worker.status === "processing") toast.loading(worker.message || "Generating PDF...", { id: "text2pdf" });
    else if (worker.status === "done") toast.success("Done! Your PDF is ready.", { id: "text2pdf" });
    else if (worker.status === "error") toast.error(worker.error || "Something went wrong.", { id: "text2pdf" });
  }, [worker.status, worker.message, worker.error]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
        if (e.key.toLowerCase() !== "u" && e.key.toLowerCase() !== "d") return;
      }
      if (e.key.toLowerCase() === "u") {
        e.preventDefault();
        textareaRef.current?.focus();
      } else if (e.key.toLowerCase() === "d" && worker.status === "done" && worker.resultBlob) {
        e.preventDefault();
        downloadBlob(worker.resultBlob, "document.pdf");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [worker.status, worker.resultBlob]);

  const selectClass =
    "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-medium text-foreground outline-none transition focus:border-[#3B3BFF] focus:ring-2 focus:ring-[#3B3BFF]/20";

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-8">
          <div className="mb-2 flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${ACCENT}1A`, color: ACCENT }}
            >
              <FileText className="h-6 w-6" aria-hidden />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Text to PDF</h1>
          </div>
          <p className="text-muted">Type or paste text and download a formatted PDF — entirely on your device.</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <label htmlFor="text-input" className="text-sm font-semibold text-foreground">
            Your text
          </label>
          <textarea
            id="text-input"
            ref={textareaRef}
            value={text}
            maxLength={MAX_TEXT_CHARS}
            onChange={(e) => {
              setText(e.target.value.slice(0, MAX_TEXT_CHARS));
              worker.reset();
            }}
            rows={12}
            placeholder="Start typing or paste your text here..."
            className="mt-2 w-full resize-y rounded-xl border border-border bg-background px-4 py-3 text-sm leading-relaxed text-foreground outline-none transition focus:border-[#3B3BFF] focus:ring-2 focus:ring-[#3B3BFF]/20"
          />
          <p className="mt-2 text-xs text-muted">
            {charCount.toLocaleString()} / {MAX_TEXT_CHARS.toLocaleString()} characters · {wordCount.toLocaleString()} words
          </p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-foreground" htmlFor="font-family">
              Font family
            </label>
            <select
              id="font-family"
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value as TextFontFamily)}
              className={`mt-2 ${selectClass}`}
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-foreground" htmlFor="font-size">
              Font size
            </label>
            <select
              id="font-size"
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className={`mt-2 ${selectClass}`}
            >
              {SIZE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}px
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-foreground" htmlFor="page-size">
              Page size
            </label>
            <select
              id="page-size"
              value={pageSize}
              onChange={(e) => setPageSize(e.target.value as TextPageSize)}
              className={`mt-2 ${selectClass}`}
            >
              {PAGE_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-foreground" htmlFor="margin">
              Margins
            </label>
            <select
              id="margin"
              value={margin}
              onChange={(e) => setMargin(e.target.value as TextMarginPreset)}
              className={`mt-2 ${selectClass}`}
            >
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="text-sm font-semibold text-foreground">Alignment</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(["left", "center", "right"] as TextAlignment[]).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAlignment(a)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold capitalize transition ${
                  alignment === a ? "text-white" : "border border-border bg-background text-foreground"
                }`}
                style={alignment === a ? { backgroundColor: ACCENT } : undefined}
              >
                {a}
              </button>
            ))}
          </div>

          <p className="mt-5 text-sm font-semibold text-foreground">Text color</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {COLOR_OPTIONS.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setColorKey(c.key)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  colorKey === c.key ? "border-[#3B3BFF] ring-2 ring-[#3B3BFF]/30" : "border-border"
                }`}
              >
                <span className="h-4 w-4 rounded-full border border-border" style={{ backgroundColor: c.swatch }} />
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8 flex w-full flex-col gap-3 pb-20 sm:flex-row sm:justify-end sm:pb-0">
          {worker.status === "done" && worker.resultBlob ? (
            <>
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <button
                  type="button"
                  onClick={() => downloadBlob(worker.resultBlob!, "document.pdf")}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-8 py-3.5 text-base font-semibold text-white shadow-lg transition hover:opacity-90 sm:w-auto"
                  style={{ backgroundColor: ACCENT }}
                >
                  Download PDF
                </button>
                <ShortcutHint shortcut="D" />
              </div>
              <button
                type="button"
                onClick={() => {
                  worker.reset();
                }}
                className="inline-flex w-full items-center justify-center rounded-xl border border-border bg-card px-8 py-3.5 text-base font-semibold text-foreground transition hover:bg-background sm:w-auto"
              >
                Generate again
              </button>
            </>
          ) : (
            <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={worker.status === "processing"}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-8 py-3.5 text-base font-semibold text-white shadow-lg transition enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                style={{ backgroundColor: ACCENT }}
              >
                {worker.status === "processing" ? "Generating…" : "Create PDF"}
              </button>
              <ShortcutHint shortcut="U" label="Focus text" />
            </div>
          )}
        </div>
      </main>
    </AppShell>
  );
}
