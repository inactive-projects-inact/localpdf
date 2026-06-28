"use client";

import { useState } from "react";
import {
  FileDown,
  GitMerge,
  Scissors,
  RotateCw,
  FileText,
  FileType,
  Lock,
  LayoutGrid,
} from "lucide-react";
import Link from "next/link";
import AppShell from "./components/AppShell";
import HeroDropzone from "./components/HeroDropzone";
import ToolCard from "./components/ToolCard";
import TrustBar from "./components/TrustBar";
import HowItWorks from "./components/HowItWorks";
import CloudExplainer from "./components/CloudExplainer";
import EducationalSection from "./components/EducationalSection";
import type { HomeToolId } from "./lib/design-system";
import { NAV_TOOLS } from "./lib/nav-config";

const MOST_USED = [
  { label: "Compress PDF", href: "/compress", description: "Reduce file size without uploading", icon: <FileDown strokeWidth={1.5} /> },
  { label: "Merge PDF", href: "/merge", description: "Combine multiple PDFs into one", icon: <GitMerge strokeWidth={1.5} /> },
  { label: "Split PDF", href: "/split", description: "Extract pages or split every page", icon: <Scissors strokeWidth={1.5} /> },
  { label: "Rotate PDF", href: "/rotate", description: "Rotate any page or the whole document", icon: <RotateCw strokeWidth={1.5} /> },
  { label: "PDF to Word", href: "/pdf-to-word", description: "Extract text into an editable document", icon: <FileText strokeWidth={1.5} /> },
  { label: "Word to PDF", href: "/word-to-pdf", description: "Convert .docx files to clean PDFs", icon: <FileType strokeWidth={1.5} /> },
  { label: "Protect PDF", href: "/protect", description: "Add password protection and encryption", icon: <Lock strokeWidth={1.5} /> },
  { label: "Organize PDF", href: "/organize", description: "Reorder, delete, and rotate pages", icon: <LayoutGrid strokeWidth={1.5} /> },
] as const;

export default function HomePage() {
  const [selectedTool] = useState<HomeToolId>("compress");
  const totalTools = NAV_TOOLS.length;

  return (
    <AppShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "WebSite",
                "@id": "https://localpdf.dev/#website",
                url: "https://localpdf.dev",
                name: "Localpdf",
                description:
                  "Free PDF tools that work entirely in your browser. Compress, merge, and split PDFs instantly.",
              },
              {
                "@type": "WebApplication",
                "@id": "https://localpdf.dev/#webapp",
                name: "Localpdf",
                url: "https://localpdf.dev",
                applicationCategory: "UtilitiesApplication",
                operatingSystem: "Web",
                offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
              },
            ],
          }),
        }}
      />

      {/* Hero + upload dropzone */}
      <section id="top" className="container-content flex flex-col items-center py-12 text-center sm:min-h-[640px] sm:justify-center sm:py-16">
        <p className="text-caption text-trust">Free · Private · No sign-up</p>
        <h1 className="mt-3 max-w-[640px] text-display-xl">
          PDF tools that run entirely in your browser
        </h1>
        <p className="mt-4 max-w-[540px] text-body-l text-text-secondary">
          {totalTools} tools — drop a file, done in seconds. Everything stays on your device.
        </p>
        <div className="mt-10 w-full">
          <HeroDropzone selectedTool={selectedTool} id="heroDropzone" />
        </div>
      </section>

      {/* Most-used tools */}
      <section aria-labelledby="most-used-heading" className="container-content py-12 sm:py-24">
        <h2 id="most-used-heading" className="text-center text-display-l">
          Most-used tools
        </h2>
        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4">
          {MOST_USED.map((tool) => (
            <ToolCard
              key={tool.href}
              title={tool.label}
              description={tool.description}
              href={tool.href}
              icon={tool.icon}
            />
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link href="/tools" className="btn-secondary inline-flex">
            View all {totalTools} tools →
          </Link>
        </div>
      </section>

      <HowItWorks />

      <TrustBar />

      <CloudExplainer />

      <EducationalSection />
    </AppShell>
  );
}
