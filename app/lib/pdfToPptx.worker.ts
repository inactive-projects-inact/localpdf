import * as pdfjsLib from "pdfjs-dist";

type RenderMessage = {
  type: "RENDER";
  jobId: number;
  fileBytes: ArrayBuffer;
  startPage: number;
  endPage: number;
  scale: number;
  quality: number;
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

self.onmessage = async (event: MessageEvent<RenderMessage>) => {
  const message = event.data;
  let pdf: pdfjsLib.PDFDocumentProxy | null = null;
  try {
    if (typeof OffscreenCanvas === "undefined") {
      throw new Error("This browser cannot render PDF pages off the main thread.");
    }

    const source = { data: new Uint8Array(message.fileBytes), disableWorker: true } as unknown as Parameters<typeof pdfjsLib.getDocument>[0];
    const task = pdfjsLib.getDocument(source);
    pdf = await task.promise;
    if (pdf.numPages < 1) throw new Error("Could not read any pages from this PDF.");

    const start = Math.max(1, Math.min(message.startPage, pdf.numPages));
    const end = Math.max(start, Math.min(message.endPage, pdf.numPages));
    for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
      self.postMessage({ type: "START", jobId: message.jobId, pageNumber });
      const page = await pdf.getPage(pageNumber);
      let canvas: OffscreenCanvas | null = null;
      try {
        const viewport = page.getViewport({ scale: message.scale });
        canvas = new OffscreenCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not create offscreen canvas context.");
        await page.render({ canvasContext: context as unknown as CanvasRenderingContext2D, viewport }).promise;
        const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: message.quality });
        const bytes = new Uint8Array(await blob.arrayBuffer());
        self.postMessage({
          type: "PAGE",
          jobId: message.jobId,
          pageNumber,
          dataUrl: `data:image/jpeg;base64,${bytesToBase64(bytes)}`,
          size: bytes.byteLength,
        });
      } finally {
        page.cleanup();
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
      }
    }

    self.postMessage({ type: "DONE", jobId: message.jobId });
  } catch (error) {
    self.postMessage({ type: "ERROR", jobId: message.jobId, error: error instanceof Error ? error.message : "PowerPoint conversion failed." });
  } finally {
    await pdf?.cleanup?.();
    await pdf?.destroy?.();
  }
};
