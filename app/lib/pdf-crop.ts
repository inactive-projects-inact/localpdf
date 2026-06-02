import { PDFDocument } from "pdf-lib";
import { mmToPoints, pageIndexInScope } from "./pdf-utils";

export type CropScopeMode = "all" | "single" | "range";

export interface CropMarginsMm {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface CropPdfOptions {
  pdfBytes: ArrayBuffer;
  mode: CropScopeMode;
  singlePage: number;
  rangeStart: number;
  rangeEnd: number;
  margins: CropMarginsMm;
}

export function validateCropMargins(
  pageWidth: number,
  pageHeight: number,
  margins: CropMarginsMm,
): boolean {
  const top = mmToPoints(margins.top);
  const bottom = mmToPoints(margins.bottom);
  const left = mmToPoints(margins.left);
  const right = mmToPoints(margins.right);

  const cropWidth = pageWidth - left - right;
  const cropHeight = pageHeight - bottom - top;

  return cropWidth > 0 && cropHeight > 0 && left >= 0 && right >= 0 && top >= 0 && bottom >= 0;
}

export async function cropPdf(options: CropPdfOptions): Promise<Uint8Array> {
  const { pdfBytes, mode, singlePage, rangeStart, rangeEnd, margins } = options;

  const pdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pageCount = pdf.getPageCount();

  const top = mmToPoints(margins.top);
  const bottom = mmToPoints(margins.bottom);
  const left = mmToPoints(margins.left);
  const right = mmToPoints(margins.right);

  for (let i = 0; i < pageCount; i++) {
    if (!pageIndexInScope(i, mode, singlePage, rangeStart, rangeEnd)) continue;

    const page = pdf.getPage(i);
    const { width, height } = page.getSize();

    if (!validateCropMargins(width, height, margins)) {
      throw new Error("Invalid crop values");
    }

    const cropWidth = width - left - right;
    const cropHeight = height - bottom - top;
    page.setCropBox(left, bottom, cropWidth, cropHeight);
  }

  return pdf.save();
}

export function applyCropPreset(
  preset: "header" | "footer" | "sides" | "square",
  pageWidth: number,
  pageHeight: number,
): CropMarginsMm {
  const widthMm = (pageWidth * 25.4) / 72;
  const heightMm = (pageHeight * 25.4) / 72;

  switch (preset) {
    case "header":
      return { top: Math.min(35, heightMm * 0.12), bottom: 0, left: 0, right: 0 };
    case "footer":
      return { top: 0, bottom: Math.min(35, heightMm * 0.12), left: 0, right: 0 };
    case "sides":
      return { top: 0, bottom: 0, left: Math.min(20, widthMm * 0.08), right: Math.min(20, widthMm * 0.08) };
    case "square": {
      const trimMm = Math.abs(widthMm - heightMm) / 2;
      if (widthMm > heightMm) {
        return { top: 0, bottom: 0, left: trimMm, right: trimMm };
      }
      return { top: trimMm, bottom: trimMm, left: 0, right: 0 };
    }
    default:
      return { top: 0, bottom: 0, left: 0, right: 0 };
  }
}
