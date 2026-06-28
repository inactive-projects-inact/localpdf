/** LocalPDF design tokens — spec §0 */

export const colors = {
  /* Semantic surface */
  bgPage: "#F7F8FB",
  bgSurface: "#FFFFFF",
  bgSurfaceMuted: "#F1F3F7",
  /* Semantic text */
  textPrimary: "#061B31",
  textSecondary: "#3C4F69",
  textMuted: "#64748D",
  /* Brand (indigo — CTAs, actions) */
  brandPrimary: "#533AFD",
  brandPrimaryHover: "#6350FE",
  brandPrimaryActive: "#4530D4",
  /* Trust (green — privacy, local processing) */
  trust: "#0E8F6B",
  trustHover: "#0B6B51",
  trustTint: "#E3F6EF",
  /* Semantic accents */
  success: "#3ECF8E",
  successTint: "#E6FAF0",
  warning: "#F5A623",
  warningTint: "#FFF4E0",
  destructive: "#E24A4A",
  destructiveTint: "#FBE7E9",
  /* Borders */
  borderSubtle: "#DFE3EB",
  borderStrong: "#BCC5D3",
  /* Cloud */
  cloud50: "#ECF0FF",
  cloud500: "#4C6FFF",
  cloud700: "#2F49C9",
  /* Legacy aliases */
  ink900: "#061B31",
  ink700: "#3C4F69",
  ink500: "#64748D",
  ink300: "#B4B2AC",
  paper0: "#FFFFFF",
  paper50: "#F7F8FB",
  paper100: "#F1F3F7",
  border: "#DFE3EB",
  local50: "#E3F6EF",
  local500: "#0E8F6B",
  local700: "#0B6B51",
  error50: "#FBE7E9",
  error500: "#E24A4A",
  warning50: "#FFF4E0",
  warning500: "#F5A623",
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
