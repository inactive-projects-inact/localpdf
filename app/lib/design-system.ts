/** Localpdf design tokens */

export const colors = {
  bg: "#080D14",
  surface: "#111827",
  surface2: "#1F2D3D",
  green: "#00E676",
  greenDark: "#00C853",
  greenDim: "#00A854",
  greenTint: "#0F1A0F",
  white: "#FFFFFF",
  body: "#CBD5E1",
  muted: "#64748B",
} as const;

export const toolAccents = {
  compress: {
    color: "#00E676",
    bg: "#001A0D",
    label: "Compress",
  },
  merge: { color: "#9B59B6", bg: "#1A0F2A", label: "Merge" },
  split: { color: "#3498DB", bg: "#0F1A2A", label: "Split" },
  rotate: { color: "#10B981", bg: "#0F2A1A", label: "Rotate" },
  textToPdf: { color: "#3B3BFF", bg: "#0F0F2A", label: "Text to PDF" },
  resize: { color: "#3B82F6", bg: "#0F1A2A", label: "Resize" },
  pageNumbers: { color: "#FF4D4D", bg: "#2A0F0F", label: "Page Numbers" },
  crop: { color: "#F59E0B", bg: "#2A200F", label: "Crop" },
  jpg2pdf: { color: "#F97316", bg: "#2A1608", label: "JPG->PDF" },
  pdf2jpg: { color: "#0EA5E9", bg: "#071D2A", label: "PDF->JPG" },
  watermark: { color: "#38BDF8", bg: "#08202A", label: "Watermark" },
  redact: { color: "#FF4D4D", bg: "#2A0F0F", label: "Redact" },
  signature: { color: "#6366F1", bg: "#11112A", label: "Signature" },
  pdfToWord: { color: "#3B82F6", bg: "#0F1A2A", label: "PDF to Word" },
  wordToPdf: { color: "#3B3BFF", bg: "#0F0F2A", label: "Word to PDF" },
  pdfToExcel: { color: "#10B981", bg: "#0F2A1A", label: "PDF to Excel" },
  excelToPdf: { color: "#F59E0B", bg: "#2A200F", label: "Excel to PDF" },
  protect: { color: "#FF4D4D", bg: "#2A0F0F", label: "Protect PDF" },
  unlock: { color: "#10B981", bg: "#0F2A1A", label: "Unlock PDF" },
  ocr: { color: "#3B3BFF", bg: "#0F0F2A", label: "OCR PDF" },
  organize: { color: "#3B82F6", bg: "#0F1A2A", label: "Organize PDF" },
} as const;

export type ToolName = keyof typeof toolAccents;

export {
  getToolDefinition,
  homeToolRoutes,
  isFileAcceptedByTool,
  orderedHomeTools,
  toolRegistry,
  validateFilesForTool,
} from "./tool-registry";
export type { ToolId as HomeToolId, ToolId } from "./tool-registry";
