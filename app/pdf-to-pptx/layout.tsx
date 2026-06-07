import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PDF to PowerPoint — PDFTools",
  description:
    "Convert PDF pages into image-based PowerPoint slides in your browser. Text and shapes are not editable. 100% private, no uploads.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
