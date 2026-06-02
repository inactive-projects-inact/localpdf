import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Resize PDF Pages — PDFTools",
  description:
    "Resize PDF pages to any size. Resize all pages, a single page, or a range. A4, Letter, custom sizes. 100% private, browser-based.",
  alternates: { canonical: "https://localpdf.dev/resize" },
};

export default function ResizeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
