import * as XLSX from "xlsx";

type PageRows = { pageNumber: number; rows: string[][] };
type WorkerMessage = { type: "BUILD"; jobId: number; pages: PageRows[] };

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  try {
    const { jobId, pages } = event.data;
    const validPages = pages.filter((page) => page.rows.length > 0);
    if (validPages.length === 0) throw new Error("No extractable text rows were found in the selected pages.");

    const workbook = XLSX.utils.book_new();
    for (const page of validPages) {
      const ws = XLSX.utils.aoa_to_sheet(page.rows);
      const colWidths: number[] = [];
      for (const row of page.rows) {
        row.forEach((cell, index) => {
          colWidths[index] = Math.max(colWidths[index] ?? 8, cell.length + 2);
        });
      }
      ws["!cols"] = colWidths.map((width) => ({ wch: Math.min(width, 40) }));
      XLSX.utils.book_append_sheet(workbook, ws, `Page ${page.pageNumber}`);
    }

    const xlsxBytes: Uint8Array = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    self.postMessage({ type: "DONE", jobId, result: xlsxBytes }, { transfer: [xlsxBytes.buffer] });
  } catch (error) {
    self.postMessage({ type: "ERROR", jobId: event.data.jobId, error: error instanceof Error ? error.message : "Excel export failed." });
  }
};
