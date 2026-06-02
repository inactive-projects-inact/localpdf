import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Unlock PDF — Remove Password — PDFTools",
  description:
    "Remove password protection from PDF files you own. Unlock and decrypt PDFs instantly in your browser. 100% private, no uploads.",
};

export default function UnlockLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
