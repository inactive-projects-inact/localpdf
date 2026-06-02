import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PDF to Word — PDFTools",
  description:
    "Convert PDF to Word document free in your browser. Extract text and structure from any PDF into an editable .docx file. 100% private, no uploads.",
};

export default function PdfToWordLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
