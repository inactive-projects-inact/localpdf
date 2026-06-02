import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Word to PDF — PDFTools",
  description:
    "Convert Word documents to PDF free in your browser. Upload any .docx file and download a clean PDF instantly. 100% private, no uploads.",
};

export default function WordToPdfLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
