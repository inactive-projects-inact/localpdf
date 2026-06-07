import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Word to PDF — PDFTools",
  description:
    "Convert .docx files to PDF in your browser with limited layout preservation. Simple text, headings, lists, tables, and images are attempted; advanced Word formatting is not guaranteed.",
};

export default function WordToPdfLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
