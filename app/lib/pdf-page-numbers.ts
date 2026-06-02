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

const COLOR_MAP: Record<NumberColorKey, RGB> = {
  black: rgb(0, 0, 0),
  gray: rgb(0.45, 0.45, 0.45),
  white: rgb(1, 1, 1),
};

const MARGIN_MM = {
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

function formatLabel(n: number, total: number, format: NumberFormat): string {
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

function getCoordinates(
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

export async function addPageNumbers(options: PageNumbersOptions): Promise<Uint8Array> {
  const {
    pdfBytes,
    position,
    format,
    startNumber,
    fontSize,
    colorKey,
    marginPreset,
    skipFirstPage,
    useCustomRange,
    rangeStart,
    rangeEnd,
  } = options;

  const pdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const color = COLOR_MAP[colorKey];
  const marginPt = mmToPoints(MARGIN_MM[marginPreset]);
  const pageCount = pdf.getPageCount();

  let displayNumber = startNumber;

  for (let i = 0; i < pageCount; i++) {
    const pageIndex = i + 1;

    if (skipFirstPage && i === 0) continue;

    if (useCustomRange && (pageIndex < rangeStart || pageIndex > rangeEnd)) {
      continue;
    }

    const label = formatLabel(displayNumber, pageCount, format);
    const page = pdf.getPage(i);
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(label, fontSize);
    const { x, y } = getCoordinates(position, width, height, textWidth, fontSize, marginPt);

    page.drawText(label, { x, y, size: fontSize, font, color });
    displayNumber += 1;
  }

  return pdf.save();
}
