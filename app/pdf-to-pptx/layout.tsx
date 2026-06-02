import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PDF to PowerPoint — PDFTools",
  description:
    "Convert PDF to PowerPoint presentation free in your browser. Each page becomes a slide. 100% private, no uploads.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
