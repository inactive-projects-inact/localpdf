import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PDF to Markdown — PDFTools",
  description:
    "Convert PDF documents to clean Markdown format free in your browser. Extract structured text, headings, and lists. 100% private, no uploads.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
