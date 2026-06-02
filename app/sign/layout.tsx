import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign PDF Online Free — Add Signature to PDF | LocalPDF",
  description:
    "Sign PDF documents for free in your browser. Draw, type, or upload your signature. 100% private — files never leave your device. No account required.",
  alternates: { canonical: "https://localpdf.dev/sign" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
