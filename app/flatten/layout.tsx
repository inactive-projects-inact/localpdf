import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Flatten PDF — Remove Forms & Annotations — PDFTools",
  description:
    "Flatten PDF forms, annotations, and layers into a static document. Free, browser-based, 100% private. No uploads required.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
