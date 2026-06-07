import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Excel to PDF — PDFTools",
  description:
    "Convert .xlsx or .xls data to basic PDF tables in your browser. Complex Excel styling, formulas, and merged-cell fidelity are limited.",
};

export default function ExcelToPdfLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
