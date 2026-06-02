import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Excel to PDF — PDFTools",
  description:
    "Convert Excel spreadsheets to PDF free in your browser. Upload .xlsx or .xls and download a clean formatted PDF. 100% private, no uploads.",
};

export default function ExcelToPdfLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
