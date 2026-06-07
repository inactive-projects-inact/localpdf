import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PDF to Excel — PDFTools",
  description:
    "Extract selectable PDF text into spreadsheet rows in your browser. This is limited reconstruction, not full table or Excel fidelity.",
};

export default function PdfToExcelLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
