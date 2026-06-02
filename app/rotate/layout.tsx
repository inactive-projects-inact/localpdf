import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rotate PDF — PDFTools",
  description:
    "Rotate PDF pages online for free. Rotate single pages or entire documents. 100% private, no uploads, works in your browser.",
  alternates: { canonical: "https://localpdf.dev/rotate" },
};

export default function RotateLayout({ children }: { children: React.ReactNode }) {
  return children;
}
