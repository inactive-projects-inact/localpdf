import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Add Page Numbers to PDF — PDFTools",
  description:
    "Add page numbers to any PDF. Choose position, format, font size, and starting number. 100% private, no uploads, works offline.",
  alternates: { canonical: "https://localpdf.dev/page-numbers" },
};

export default function PageNumbersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
