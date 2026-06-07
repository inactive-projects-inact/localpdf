import * as XLSX from "xlsx";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

type PageSize = "A4" | "A3" | "Letter" | "Legal";
type FontSize = "small" | "medium" | "large";
type Orientation = "landscape" | "portrait";

type LoadMessage = { type: "LOAD"; jobId: number; fileBytes: ArrayBuffer };
type ConvertMessage = {
  type: "CONVERT";
  jobId: number;
  sheetsToConvert: string[];
  orientation: Orientation;
  pageSize: PageSize;
  fontSize: FontSize;
  includeSheetTitle: boolean;
};
type WorkerMessage = LoadMessage | ConvertMessage | { type: "RESET" };

const PAGE_DIMS: Record<PageSize, { width: number; height: number }> = {
  A4: { width: 595, height: 842 },
  A3: { width: 842, height: 1191 },
  Letter: { width: 612, height: 792 },
  Legal: { width: 612, height: 1008 },
};

const FONT_SIZES: Record<FontSize, number> = {
  small: 8,
  medium: 10,
  large: 12,
};

let workbook: XLSX.WorkBook | null = null;

function postError(jobId: number, error: unknown) {
  self.postMessage({ type: "ERROR", jobId, error: error instanceof Error ? error.message : "Spreadsheet conversion failed." });
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const message = e.data;
  if (message.type === "RESET") {
    workbook = null;
    return;
  }

  try {
    if (message.type === "LOAD") {
      workbook = XLSX.read(message.fileBytes, { type: "array" });
      const sheetNames = workbook.SheetNames.filter((name) => Boolean(workbook?.Sheets[name]));
      if (sheetNames.length === 0) throw new Error("No readable sheets found in this workbook.");
      self.postMessage({ type: "LOADED", jobId: message.jobId, sheetNames });
      return;
    }

    if (!workbook) throw new Error("Spreadsheet is not loaded. Choose the file again.");
    const pdfDoc = await PDFDocument.create();
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const dims = PAGE_DIMS[message.pageSize];
    const pgW = message.orientation === "landscape" ? dims.height : dims.width;
    const pgH = message.orientation === "landscape" ? dims.width : dims.height;
    const fSize = FONT_SIZES[message.fontSize];
    const margin = 40;
    const rowH = fSize + 8;
    const headerH = rowH + 4;
    let writtenSheets = 0;

    for (const sheetName of message.sheetsToConvert) {
      const ws = workbook.Sheets[sheetName];
      if (!ws) continue;

      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" })
        .map((row) => row.map((cell) => String(cell ?? "")));
      if (rows.length === 0) continue;

      const colCount = Math.max(...rows.map((row) => row.length));
      if (colCount === 0) continue;

      const colWidths: number[] = Array(colCount).fill(0);
      for (const row of rows) {
        row.forEach((cell, i) => {
          const w = regularFont.widthOfTextAtSize(cell, fSize) + 8;
          colWidths[i] = Math.max(colWidths[i], Math.min(w, 120));
        });
      }

      const totalColWidth = colWidths.reduce((a, b) => a + b, 0);
      const availW = pgW - margin * 2;
      const scale = totalColWidth > availW ? availW / totalColWidth : 1;
      const scaledWidths = colWidths.map((w) => w * scale);

      let page = pdfDoc.addPage([pgW, pgH]);
      let y = pgH - margin;
      writtenSheets += 1;

      if (message.includeSheetTitle) {
        page.drawText(sheetName, { x: margin, y, size: fSize + 4, font: boldFont, color: rgb(0.05, 0.05, 0.05) });
        y -= fSize + 12;
      }

      rows.forEach((row, rowIdx) => {
        const isHeader = rowIdx === 0;
        const rowBackground = isHeader ? rgb(0.06, 0.06, 0.06) : rowIdx % 2 === 0 ? rgb(0.97, 0.97, 0.97) : rgb(1, 1, 1);
        const textColor = isHeader ? rgb(1, 1, 1) : rgb(0.1, 0.1, 0.1);
        const currentRowH = isHeader ? headerH : rowH;

        if (y - currentRowH < margin) {
          page = pdfDoc.addPage([pgW, pgH]);
          y = pgH - margin;
          if (rowIdx > 0 && rows[0]) {
            let hx = margin;
            page.drawRectangle({ x: margin, y: y - headerH, width: availW, height: headerH, color: rgb(0.06, 0.06, 0.06) });
            rows[0].forEach((cell, i) => {
              const cw = scaledWidths[i] ?? 60;
              page.drawText(cell.slice(0, 40), { x: hx + 3, y: y - headerH + 5, size: fSize, font: boldFont, color: rgb(1, 1, 1), maxWidth: cw - 6 });
              hx += cw;
            });
            y -= headerH;
          }
        }

        let x = margin;
        page.drawRectangle({ x: margin, y: y - currentRowH, width: availW, height: currentRowH, color: rowBackground });

        row.forEach((cell, i) => {
          const cw = scaledWidths[i] ?? 60;
          const text = cell.slice(0, 60);
          page.drawRectangle({ x, y: y - currentRowH, width: cw, height: currentRowH, borderColor: rgb(0.9, 0.91, 0.92), borderWidth: 0.5 });
          if (text) {
            page.drawText(text, { x: x + 3, y: y - currentRowH + 5, size: fSize, font: isHeader ? boldFont : regularFont, color: textColor, maxWidth: cw - 6 });
          }
          x += cw;
        });

        y -= currentRowH;
      });
    }

    if (writtenSheets === 0) throw new Error("Selected sheets contain no extractable cell data.");
    const pdfBytes = await pdfDoc.save();
    self.postMessage({ type: "DONE", jobId: message.jobId, result: pdfBytes }, { transfer: [pdfBytes.buffer] });
  } catch (error) {
    postError("jobId" in message ? message.jobId : 0, error);
  }
};
