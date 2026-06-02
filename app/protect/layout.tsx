import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Protect PDF with Password — PDFTools",
  description:
    "Add password protection to any PDF free in your browser. Encrypt and restrict access instantly. 100% private, no uploads, works offline.",
};

export default function ProtectLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
