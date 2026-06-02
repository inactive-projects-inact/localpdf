import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Text to PDF — PDFTools",
  description:
    "Convert text to PDF instantly in your browser. Choose font, size, margins, and page layout. 100% private, no uploads required.",
  alternates: { canonical: "https://localpdf.dev/text-to-pdf" },
};

export default function TextToPdfLayout({ children }: { children: React.ReactNode }) {
  return children;
}
