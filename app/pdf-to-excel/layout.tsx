import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PDF to Excel — PDFTools",
  description:
    "Extract tables and data from PDF to Excel spreadsheet free in your browser. Convert PDF tables to .xlsx instantly. 100% private, no uploads.",
};

export default function PdfToExcelLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
