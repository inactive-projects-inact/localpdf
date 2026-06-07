import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Unlock PDF Support Check - PDFTools",
  description:
    "Check PDF encryption status locally. True browser-side password decryption is unsupported, and encrypted PDFs are not falsely unlocked.",
};

export default function UnlockLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
