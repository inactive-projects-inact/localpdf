import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Crop PDF Pages — PDFTools",
  description:
    "Crop PDF pages with precision. Crop all pages, single pages, or a range. Remove headers, footers, or margins. 100% browser-based.",
  alternates: { canonical: "https://localpdf.dev/crop" },
};

export default function CropLayout({ children }: { children: React.ReactNode }) {
  return children;
}
