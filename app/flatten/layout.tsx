import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Flatten AcroForm Fields - PDFTools",
  description:
    "Flatten supported AcroForm fields in your browser. Annotations, layers, signatures, scripts, and XFA forms are not flattened.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
