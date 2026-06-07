import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PDF to Markdown Text Extraction - PDFTools",
  description:
    "Extract selectable PDF text into Markdown with approximate headings, lists, columns, and simple tables. Complex layout reconstruction is limited.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
