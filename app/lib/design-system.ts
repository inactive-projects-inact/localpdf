/** LocalPDF design tokens — spec §0 */

export const colors = {
  ink900: "#13151A",
  ink700: "#3A3D46",
  ink500: "#6B6E78",
  ink300: "#B4B2AC",
  paper0: "#FFFFFF",
  paper50: "#FAFAF9",
  paper100: "#F1F0ED",
  border: "#E3E1DC",
  borderStrong: "#C9C7C0",
  local50: "#E3F6EF",
  local500: "#0E8F6B",
  local700: "#0B6B51",
  cloud50: "#ECF0FF",
  cloud500: "#4C6FFF",
  cloud700: "#2F49C9",
  error50: "#FBE7E9",
  error500: "#D7263D",
  warning50: "#FFF4E0",
  warning500: "#B66A00",
} as const;

export type ProcessingMode = "local" | "cloud";

export const toolAccents = {
  compress: { color: colors.ink900, bg: colors.paper100, label: "Compress" },
  merge: { color: colors.ink900, bg: colors.paper100, label: "Merge" },
  split: { color: colors.ink900, bg: colors.paper100, label: "Split" },
  rotate: { color: colors.ink900, bg: colors.paper100, label: "Rotate" },
  textToPdf: { color: colors.ink900, bg: colors.paper100, label: "Text to PDF" },
  resize: { color: colors.ink900, bg: colors.paper100, label: "Resize" },
  pageNumbers: { color: colors.ink900, bg: colors.paper100, label: "Page Numbers" },
  crop: { color: colors.ink900, bg: colors.paper100, label: "Crop" },
  jpg2pdf: { color: colors.ink900, bg: colors.paper100, label: "JPG->PDF" },
  pdf2jpg: { color: colors.ink900, bg: colors.paper100, label: "PDF->JPG" },
  watermark: { color: colors.ink900, bg: colors.paper100, label: "Watermark" },
  redact: { color: colors.ink900, bg: colors.paper100, label: "Redact" },
  signature: { color: colors.ink900, bg: colors.paper100, label: "Signature" },
  pdfToWord: { color: colors.ink900, bg: colors.paper100, label: "PDF to Word" },
  wordToPdf: { color: colors.ink900, bg: colors.paper100, label: "Word to PDF" },
  pdfToExcel: { color: colors.ink900, bg: colors.paper100, label: "PDF to Excel" },
  excelToPdf: { color: colors.ink900, bg: colors.paper100, label: "Excel to PDF" },
  protect: { color: colors.ink900, bg: colors.paper100, label: "Protect PDF" },
  unlock: { color: colors.ink900, bg: colors.paper100, label: "Unlock PDF" },
  ocr: { color: colors.ink900, bg: colors.paper100, label: "OCR PDF" },
  organize: { color: colors.ink900, bg: colors.paper100, label: "Organize PDF" },
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
