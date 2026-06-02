import { PDFDocument } from "pdf-lib";
import { getPageSizePoints, pageIndexInScope, type Orientation, type PageSizeKey } from "./pdf-utils";

export type ResizeScopeMode = "all" | "single" | "range";

export interface ResizePdfOptions {
  pdfBytes: ArrayBuffer;
  mode: ResizeScopeMode;
  singlePage: number;
  rangeStart: number;
  rangeEnd: number;
  pageSize: PageSizeKey;
  orientation: Orientation;
  customWidthMm?: number;
  customHeightMm?: number;
  scaleContent: boolean;
}

export async function resizePdf(options: ResizePdfOptions): Promise<Uint8Array> {
  const {
    pdfBytes,
    mode,
    singlePage,
    rangeStart,
    rangeEnd,
    pageSize,
    orientation,
    customWidthMm,
    customHeightMm,
    scaleContent,
  } = options;

  const source = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const targetSize = getPageSizePoints(pageSize, orientation, customWidthMm, customHeightMm);
  const pageCount = source.getPageCount();
  const output = await PDFDocument.create();

  for (let i = 0; i < pageCount; i++) {
    const srcPage = source.getPage(i);
    const shouldResize = pageIndexInScope(i, mode, singlePage, rangeStart, rangeEnd);

    if (!shouldResize) {
      const [copied] = await output.copyPages(source, [i]);
      output.addPage(copied);
      continue;
    }

    const { width: srcW, height: srcH } = srcPage.getSize();
    const newPage = output.addPage([targetSize.width, targetSize.height]);
    const embedded = await output.embedPage(srcPage);

    let drawW = srcW;
    let drawH = srcH;
    if (scaleContent) {
      const scale = Math.min(targetSize.width / srcW, targetSize.height / srcH);
      drawW = srcW * scale;
      drawH = srcH * scale;
    }

    const x = (targetSize.width - drawW) / 2;
    const y = (targetSize.height - drawH) / 2;
    newPage.drawPage(embedded, { x, y, width: drawW, height: drawH });
  }

  return output.save();
}
