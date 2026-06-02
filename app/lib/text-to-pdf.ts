import { PDFDocument, StandardFonts, rgb, type PDFFont, type RGB } from "pdf-lib";

export type TextFontFamily = "Helvetica" | "Times Roman" | "Courier";
export type TextPageSize = "A4" | "A3" | "Letter" | "Legal";
export type TextMarginPreset = "small" | "medium" | "large";
export type TextAlignment = "left" | "center" | "right";

const MARGIN_POINTS: Record<TextMarginPreset, number> = {
  small: 36,
  medium: 54,
  large: 72,
};

const PAGE_SIZES: Record<TextPageSize, [number, number]> = {
  A4: [595.28, 841.89],
  A3: [841.89, 1190.55],
  Letter: [612, 792],
  Legal: [612, 1008],
};

const FONT_MAP = {
  Helvetica: StandardFonts.Helvetica,
  "Times Roman": StandardFonts.TimesRoman,
  Courier: StandardFonts.Courier,
} as const;

const COLOR_MAP: Record<string, RGB> = {
  black: rgb(0, 0, 0),
  "dark gray": rgb(0.2, 0.2, 0.2),
  navy: rgb(0, 0, 0.5),
  "dark green": rgb(0, 0.35, 0.15),
  "dark red": rgb(0.55, 0, 0),
};

function wrapLines(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const lines: string[] = [];
  const paragraphs = text.split(/\n/);

  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      lines.push("");
      continue;
    }

    const words = paragraph.split(/\s+/).filter(Boolean);
    let current = "";

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      const width = font.widthOfTextAtSize(candidate, fontSize);

      if (width <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
        if (font.widthOfTextAtSize(word, fontSize) > maxWidth) {
          let chunk = "";
          for (const char of word) {
            const test = chunk + char;
            if (font.widthOfTextAtSize(test, fontSize) <= maxWidth) {
              chunk = test;
            } else {
              if (chunk) lines.push(chunk);
              chunk = char;
            }
          }
          current = chunk;
        }
      }
    }

    if (current) lines.push(current);
  }

  return lines.length > 0 ? lines : [""];
}

export interface TextToPdfOptions {
  text: string;
  fontFamily: TextFontFamily;
  fontSize: number;
  pageSize: TextPageSize;
  margin: TextMarginPreset;
  alignment: TextAlignment;
  colorKey: string;
}

export async function generateTextPdf(options: TextToPdfOptions): Promise<Uint8Array> {
  const { text, fontFamily, fontSize, pageSize, margin, alignment, colorKey } = options;
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(FONT_MAP[fontFamily]);
  const color = COLOR_MAP[colorKey] ?? COLOR_MAP.black;

  const [pageWidth, pageHeight] = PAGE_SIZES[pageSize];
  const marginPt = MARGIN_POINTS[margin];
  const maxWidth = pageWidth - marginPt * 2;
  const lineHeight = fontSize * 1.45;
  const lines = wrapLines(text, font, fontSize, maxWidth);

  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - marginPt - fontSize;

  for (const line of lines) {
    if (y < marginPt) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - marginPt - fontSize;
    }

    const textWidth = font.widthOfTextAtSize(line, fontSize);
    let x = marginPt;
    if (alignment === "center") {
      x = (pageWidth - textWidth) / 2;
    } else if (alignment === "right") {
      x = pageWidth - marginPt - textWidth;
    }

    page.drawText(line, { x, y, size: fontSize, font, color });
    y -= lineHeight;
  }

  return pdf.save();
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}
