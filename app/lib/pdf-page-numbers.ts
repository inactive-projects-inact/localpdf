import { PDFDocument, StandardFonts, rgb, type RGB } from "pdf-lib";
import { mmToPoints } from "./pdf-utils";

export type NumberPosition =
  | "bottom-center"
  | "bottom-left"
  | "bottom-right"
  | "top-center"
  | "top-left"
  | "top-right";

export type NumberFormat = "plain" | "page-of-total" | "page-only" | "n-of-total";
export type NumberColorKey = "black" | "gray" | "white";

export const COLOR_MAP: Record<NumberColorKey, RGB> = {
  black: rgb(0, 0, 0),
  gray: rgb(0.45, 0.45, 0.45),
  white: rgb(1, 1, 1),
};

export const MARGIN_MM = {
  small: 8,
  medium: 14,
  large: 22,
} as const;

export interface PageNumbersOptions {
  pdfBytes: ArrayBuffer;
  position: NumberPosition;
  format: NumberFormat;
  startNumber: number;
  fontSize: number;
  colorKey: NumberColorKey;
  marginPreset: keyof typeof MARGIN_MM;
  skipFirstPage: boolean;
  useCustomRange: boolean;
  rangeStart: number;
  rangeEnd: number;
}

export function formatLabel(n: number, total: number, format: NumberFormat): string {
  switch (format) {
    case "plain":
      return String(n);
    case "page-of-total":
      return `Page ${n} of ${total}`;
    case "page-only":
      return `Page ${n}`;
    case "n-of-total":
      return `${n} of ${total}`;
    default:
      return String(n);
  }
}

export function getCoordinates(
  position: NumberPosition,
  pageWidth: number,
  pageHeight: number,
  textWidth: number,
  fontSize: number,
  marginPt: number,
): { x: number; y: number } {
  const isTop = position.startsWith("top");
  const y = isTop ? pageHeight - marginPt - fontSize : marginPt;

  if (position.endsWith("left")) {
    return { x: marginPt, y };
  }
  if (position.endsWith("right")) {
    return { x: pageWidth - marginPt - textWidth, y };
  }
  return { x: (pageWidth - textWidth) / 2, y };
}


