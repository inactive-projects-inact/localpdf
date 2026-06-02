import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "HTML to PDF — PDFTools",
  description:
    "Convert HTML to PDF free in your browser. Paste HTML or upload an HTML file and download instantly. 100% private, no uploads.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
