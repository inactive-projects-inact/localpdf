import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Visual PDF Signature Stamp | LocalPDF",
  description:
    "Add a visual signature image stamp to a PDF in your browser. This is not a cryptographic digital signature or certificate.",
  alternates: { canonical: "https://localpdf.dev/sign" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
