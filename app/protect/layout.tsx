import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Protect PDF Unsupported - PDFTools",
  description:
    "PDF password encryption is explicitly unsupported in the current browser-only engine. No fake encrypted output is generated.",
};

export default function ProtectLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
