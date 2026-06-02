export type PageSizeKey = "A4" | "A3" | "A5" | "Letter" | "Legal" | "Tabloid" | "Custom";
export type Orientation = "portrait" | "landscape";

export const PAGE_SIZE_MM: Record<Exclude<PageSizeKey, "Custom">, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
  A5: { width: 148, height: 210 },
  Letter: { width: 216, height: 279 },
  Legal: { width: 216, height: 356 },
  Tabloid: { width: 279, height: 432 },
};

export function mmToPoints(mm: number): number {
  return (mm * 72) / 25.4;
}

export function getPageSizePoints(
  size: PageSizeKey,
  orientation: Orientation,
  customWidthMm?: number,
  customHeightMm?: number,
): { width: number; height: number } {
  let widthMm: number;
  let heightMm: number;

  if (size === "Custom") {
    widthMm = customWidthMm ?? 210;
    heightMm = customHeightMm ?? 297;
  } else {
    widthMm = PAGE_SIZE_MM[size].width;
    heightMm = PAGE_SIZE_MM[size].height;
  }

  if (orientation === "landscape") {
    [widthMm, heightMm] = [heightMm, widthMm];
  }

  return { width: mmToPoints(widthMm), height: mmToPoints(heightMm) };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function getPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  if (typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }
  return pdfjs;
}

export async function renderPdfPageToCanvas(
  pdfBytes: ArrayBuffer,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  scale = 1.25,
): Promise<void> {
  const { getDocument } = await getPdfjs();
  const pdf = await getDocument({ data: pdfBytes.slice(0) }).promise;
  try {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const context = canvas.getContext("2d");
    if (!context) return;

    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    context.clearRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
  } finally {
    await pdf.destroy();
  }
}

export function pageIndexInScope(
  index: number,
  mode: "all" | "single" | "range",
  singlePage: number,
  rangeStart: number,
  rangeEnd: number,
): boolean {
  if (mode === "all") return true;
  if (mode === "single") return index === singlePage - 1;
  return index >= rangeStart - 1 && index <= rangeEnd - 1;
}
