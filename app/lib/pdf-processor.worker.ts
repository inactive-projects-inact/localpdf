import { PDFDocument, degrees, StandardFonts } from "pdf-lib";
import JSZip from "jszip";
import { COLOR_MAP as TEXT_COLOR_MAP, FONT_MAP, MARGIN_POINTS, PAGE_SIZES, wrapLines } from "./text-to-pdf";
import { COLOR_MAP as NUM_COLOR_MAP, MARGIN_MM, formatLabel, getCoordinates } from "./pdf-page-numbers";
import type {
  ProcessorInboundMessage,
  ProcessorOutboundMessage,
  ProcessorTaskOptions,
} from "./pdf-processor-protocol";

let currentJobId = -1;

function post(msg: ProcessorOutboundMessage, transfer?: Transferable[]) {
  postMessage(msg, { transfer: transfer || [] });
}

function mmToPoints(mm: number): number {
  return (mm * 72) / 25.4;
}

self.addEventListener("message", (event: MessageEvent<ProcessorInboundMessage>) => {
  const msg = event.data;

  if (msg.type === "CANCEL_PROCESS") {
    currentJobId = -1;
    return;
  }

  if (msg.type === "START_PROCESS") {
    currentJobId = msg.jobId;
    void handleTask(msg.jobId, msg.fileBytes, msg.task);
  }
});

async function handleTask(jobId: number, fileBytes: ArrayBuffer, task: ProcessorTaskOptions) {
  const checkCancel = () => { if (currentJobId !== jobId) throw new Error("Cancelled"); };

  try {
    let resultBytes: Uint8Array;
    let isZip = false;

    let sourceDoc: PDFDocument | undefined;
    if (fileBytes && fileBytes.byteLength > 0 && task.tool !== "text-to-pdf") {
      post({ type: "PROGRESS", jobId, percent: 10, message: "Loading PDF..." });
      sourceDoc = await PDFDocument.load(fileBytes, { ignoreEncryption: true });
      checkCancel();
    }

    switch (task.tool) {
      case "split": {
        if (!sourceDoc) throw new Error("No PDF loaded");
        const { mode, startPage, endPage, filename } = task.options;
        const total = sourceDoc.getPageCount();

        if (mode === "range") {
          const s = Math.max(1, startPage || 1) - 1;
          const e = Math.min(total, endPage || total) - 1;
          const indices: number[] = [];
          for (let i = s; i <= e; i++) indices.push(i);

          post({ type: "PROGRESS", jobId, percent: 30, message: "Extracting pages..." });
          const newPdf = await PDFDocument.create();
          const pages = await newPdf.copyPages(sourceDoc, indices);
          pages.forEach((page) => newPdf.addPage(page));

          checkCancel();
          
          post({ type: "PROGRESS", jobId, percent: 80, message: "Saving PDF..." });
          resultBytes = await newPdf.save();
        } else {
          // split all
          isZip = true;
          const zip = new JSZip();
          const baseName = filename.replace(/\.pdf$/i, "") || "document";

          for (let i = 0; i < total; i++) {
            checkCancel();
            post({ type: "PROGRESS", jobId, percent: Math.round(10 + (i / total) * 70), message: `Processing page ${i + 1} of ${total}...` });
            
            const newPdf = await PDFDocument.create();
            const [page] = await newPdf.copyPages(sourceDoc, [i]);
            newPdf.addPage(page);
            const pageBytes = await newPdf.save();
            zip.file(`${baseName}-page-${i + 1}.pdf`, pageBytes);
          }

          checkCancel();
          post({ type: "PROGRESS", jobId, percent: 85, message: "Generating ZIP archive..." });
          
          const zipBlob = await zip.generateAsync({ type: "uint8array" }, (metadata) => {
            if (currentJobId === jobId) post({ type: "PROGRESS", jobId, percent: Math.round(85 + metadata.percent * 0.15), message: "Compressing..." });
          });
          resultBytes = zipBlob;
        }
        break;
      }
      
      case "rotate": {
        if (!sourceDoc) throw new Error("No PDF loaded");
        const { mode, angle, page } = task.options;
        post({ type: "PROGRESS", jobId, percent: 30, message: "Applying rotation..." });
        
        if (mode === "all") {
          for (const p of sourceDoc.getPages()) {
            const current = p.getRotation().angle;
            p.setRotation(degrees((current + angle + 360) % 360));
          }
        } else if (page !== undefined && page > 0) {
          const p = sourceDoc.getPage(page - 1);
          const current = p.getRotation().angle;
          p.setRotation(degrees((current + angle + 360) % 360));
        }

        checkCancel();
        post({ type: "PROGRESS", jobId, percent: 80, message: "Saving PDF..." });
        resultBytes = await sourceDoc.save();
        break;
      }

      case "crop": {
        if (!sourceDoc) throw new Error("No PDF loaded");
        const { mode, singlePage, rangeStart, rangeEnd, margins } = task.options;
        const total = sourceDoc.getPageCount();
        const top = mmToPoints(margins.top);
        const bottom = mmToPoints(margins.bottom);
        const left = mmToPoints(margins.left);
        const right = mmToPoints(margins.right);

        post({ type: "PROGRESS", jobId, percent: 30, message: "Applying crops..." });
        
        for (let i = 0; i < total; i++) {
          let inScope = false;
          if (mode === "all") inScope = true;
          else if (mode === "single" && i + 1 === singlePage) inScope = true;
          else if (mode === "range" && rangeStart && rangeEnd && i + 1 >= rangeStart && i + 1 <= rangeEnd) inScope = true;

          if (inScope) {
            const p = sourceDoc.getPage(i);
            const { width, height } = p.getSize();
            const cropWidth = width - left - right;
            const cropHeight = height - bottom - top;
            if (cropWidth > 0 && cropHeight > 0) {
               p.setCropBox(left, bottom, cropWidth, cropHeight);
            }
          }
        }

        checkCancel();
        post({ type: "PROGRESS", jobId, percent: 80, message: "Saving PDF..." });
        resultBytes = await sourceDoc.save();
        break;
      }

      case "organize": {
        if (!sourceDoc) throw new Error("No PDF loaded");
        const { pages } = task.options;
        post({ type: "PROGRESS", jobId, percent: 20, message: "Building new PDF structure..." });
        
        const newDoc = await PDFDocument.create();
        
        for (let i = 0; i < pages.length; i++) {
          checkCancel();
          if (i % 10 === 0) {
            post({ type: "PROGRESS", jobId, percent: Math.round(20 + (i / pages.length) * 60), message: `Processing page ${i + 1} of ${pages.length}...` });
          }

          const entry = pages[i];
          if (entry.originalIndex === null) {
            newDoc.addPage([595, 842]);
          } else {
            const [copiedPage] = await newDoc.copyPages(sourceDoc, [entry.originalIndex]);
            if (entry.rotation !== 0) {
               copiedPage.setRotation(degrees(entry.rotation));
            }
            newDoc.addPage(copiedPage);
          }
        }

        checkCancel();
        post({ type: "PROGRESS", jobId, percent: 80, message: "Saving PDF..." });
        resultBytes = await newDoc.save();
        break;
      }
      
      case "text-to-pdf": {
        const { text, fontFamily, fontSize, pageSize, margin, alignment, colorKey } = task.options;
        post({ type: "PROGRESS", jobId, percent: 20, message: "Preparing document..." });
        
        const pdf = await PDFDocument.create();
        const font = await pdf.embedFont(FONT_MAP[fontFamily]);
        const color = TEXT_COLOR_MAP[colorKey] ?? TEXT_COLOR_MAP.black;

        const [pageWidth, pageHeight] = PAGE_SIZES[pageSize];
        const marginPt = MARGIN_POINTS[margin];
        const maxWidth = pageWidth - marginPt * 2;
        const lineHeight = fontSize * 1.45;
        
        post({ type: "PROGRESS", jobId, percent: 30, message: "Validating text encoding..." });
        
        const unsupportedMatch = text.match(/[^\x00-\xFF\u0152\u0153\u0178\u0192\u2013\u2014\u2018-\u201E\u2020-\u2022\u2026\u2030\u2039\u203A\u20AC\r\n\t]/);
        if (unsupportedMatch) {
          throw new Error(`Text contains unsupported character: "${unsupportedMatch[0]}". Please use standard Latin characters.`);
        }

        try {
          font.encodeText(text);
        } catch (e) {
          throw new Error("Text contains unsupported characters. Please use standard Latin characters.");
        }

        post({ type: "PROGRESS", jobId, percent: 40, message: "Processing text..." });
        const lines = wrapLines(text, font, fontSize, maxWidth);

        let page = pdf.addPage([pageWidth, pageHeight]);
        let y = pageHeight - marginPt - fontSize;

        for (let i = 0; i < lines.length; i++) {
          checkCancel();
          if (i % 100 === 0) {
            post({ type: "PROGRESS", jobId, percent: Math.round(40 + (i / lines.length) * 45), message: "Writing pages..." });
          }
          
          const line = lines[i];
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

        checkCancel();
        post({ type: "PROGRESS", jobId, percent: 85, message: "Saving PDF..." });
        resultBytes = await pdf.save();
        break;
      }

      case "page-numbers": {
        if (!sourceDoc) throw new Error("No PDF loaded");
        const {
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
        } = task.options;

        post({ type: "PROGRESS", jobId, percent: 20, message: "Preparing fonts..." });
        const font = await sourceDoc.embedFont(StandardFonts.Helvetica);
        const color = NUM_COLOR_MAP[colorKey];
        const marginPt = mmToPoints(MARGIN_MM[marginPreset]);
        const pageCount = sourceDoc.getPageCount();

        let displayNumber = startNumber;

        for (let i = 0; i < pageCount; i++) {
          checkCancel();
          if (i % 10 === 0) {
             post({ type: "PROGRESS", jobId, percent: Math.round(20 + (i / pageCount) * 60), message: `Numbering page ${i + 1} of ${pageCount}...` });
          }

          const pageIndex = i + 1;
          if (skipFirstPage && i === 0) continue;
          if (useCustomRange && (pageIndex < rangeStart || pageIndex > rangeEnd)) continue;

          const label = formatLabel(displayNumber, pageCount, format);
          const page = sourceDoc.getPage(i);
          const { width, height } = page.getSize();
          const rotationAngle = page.getRotation().angle;
          const normRot = ((rotationAngle % 360) + 360) % 360;

          // Compute visual dimensions
          const visualWidth = normRot === 90 || normRot === 270 ? height : width;
          const visualHeight = normRot === 90 || normRot === 270 ? width : height;

          const textWidth = font.widthOfTextAtSize(label, fontSize);
          
          const { x: visualX, y: visualY } = getCoordinates(position, visualWidth, visualHeight, textWidth, fontSize, marginPt);

          let unrotatedX = visualX;
          let unrotatedY = visualY;
          
          if (normRot === 90) {
            unrotatedX = width - visualY;
            unrotatedY = visualX;
          } else if (normRot === 180) {
            unrotatedX = width - visualX;
            unrotatedY = height - visualY;
          } else if (normRot === 270) {
            unrotatedX = visualY;
            unrotatedY = height - visualX;
          }

          page.drawText(label, { x: unrotatedX, y: unrotatedY, size: fontSize, font, color, rotate: degrees(0) });
          displayNumber += 1;
        }

        checkCancel();
        post({ type: "PROGRESS", jobId, percent: 85, message: "Saving PDF..." });
        resultBytes = await sourceDoc.save();
        break;
      }
      
      default:
        throw new Error("Unknown tool task.");
    }

    checkCancel();

    post({ type: "PROGRESS", jobId, percent: 100, message: "Done" });
    post({ type: "COMPLETE", jobId, result: resultBytes, isZip }, [resultBytes.buffer]);
  } catch (err) {
    if (currentJobId === jobId) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      post({ type: "ERROR", jobId, error: msg });
    }
  }
}
