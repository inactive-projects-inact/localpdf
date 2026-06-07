import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Compress PDF - Destructive Image-Page Compression | LocalPDF",
  description: "Compress PDFs locally in the browser. Image-containing pages may be rasterized into flat JPEG pages; text-only pages are preserved when possible.",
  alternates: { canonical: "https://localpdf.dev/compress" },
};

export default function CompressLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
