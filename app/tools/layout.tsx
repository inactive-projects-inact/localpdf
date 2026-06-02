import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "All PDF Tools — PDFTools",
  description:
    "All free PDF tools in one place. Compress, merge, split, rotate, crop, resize, add page numbers, and convert text to PDF. 100% private.",
  alternates: { canonical: "https://localpdf.dev/tools" },
};

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
