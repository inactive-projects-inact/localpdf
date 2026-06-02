"use client";

import { useState } from "react";
import {
  Crop,
  Code,
  FileText,
  FileCode,
  Hash,
  LayoutGrid,
  Lock,
  Maximize2,
  Layers,
  PenLine,
  Presentation,
  RotateCw,
  Unlock,
  FileType,
  Table,
  Sheet,
  ScanText,
} from "lucide-react";
import Link from "next/link";
import AppShell from "./components/AppShell";
import HeroDropzone from "./components/HeroDropzone";
import ToolPills from "./components/ToolPills";
import ToolCard from "./components/ToolCard";
import TrustBar from "./components/TrustBar";
import SocialBar from "./components/SocialBar";
import HomeFeatures from "./components/HomeFeatures";
import Testimonials from "./components/Testimonials";
import Reveal from "./components/Reveal";
import type { HomeToolId } from "./lib/design-system";
import { toolAccents } from "./lib/design-system";

type ExtraToolCardProps = {
  title: string;
  description: string;
  tag: string;
  href: string;
  color: string;
  icon: React.ReactNode;
};

const EXTRA_TOOL_CARDS: ExtraToolCardProps[] = [
  {
    title: "Sign PDF",
    description: "Draw, type, or upload your signature",
    tag: "Draw, Type or Upload",
    href: "/sign",
    color: "#3B3BFF",
    icon: <PenLine className="h-7 w-7" strokeWidth={2} />,
  },
  {
    title: "PDF to PowerPoint",
    description: "Turn each page into a slide deck",
    tag: "Every Page → Slide",
    href: "/pdf-to-pptx",
    color: "#F59E0B",
    icon: <Presentation className="h-7 w-7" strokeWidth={2} />,
  },
  {
    title: "HTML to PDF",
    description: "Paste HTML or upload an HTML file and download instantly",
    tag: "Paste or Upload",
    href: "/html-to-pdf",
    color: "#10B981",
    icon: <Code className="h-7 w-7" strokeWidth={2} />,
  },
  {
    title: "Flatten PDF",
    description: "Remove forms, annotations, and layers",
    tag: "Remove Forms & Annotations",
    href: "/flatten",
    color: "#FF4D4D",
    icon: <Layers className="h-7 w-7" strokeWidth={2} />,
  },
  {
    title: "PDF to Markdown",
    description: "Extract structured text into clean Markdown",
    tag: "Structured & Clean",
    href: "/pdf-to-markdown",
    color: "#3B3BFF",
    icon: <FileCode className="h-7 w-7" strokeWidth={2} />,
  },
];

function ExtraToolCard({ title, description, tag, href, color, icon }: ExtraToolCardProps) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col rounded-3xl border border-border bg-card p-8 transition-all hover:-translate-y-1 hover:shadow-xl dark:hover:shadow-black/40"
      aria-label={title}
    >
      <div className="flex items-start justify-between">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ backgroundColor: "var(--background)", color }}
        >
          {icon}
        </div>
        <span
          className="rounded-full px-3 py-1 text-xs font-semibold"
          style={{ backgroundColor: "var(--background)", color }}
        >
          {tag}
        </span>
      </div>
      <h3 className="mt-6 text-xl font-bold text-foreground">{title}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{description}</p>
      <div className="mt-6 flex items-center gap-2 text-sm font-semibold transition-colors" style={{ color }}>
        Try now
        <svg
          className="h-4 w-4 transition-transform group-hover:translate-x-1"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
        </svg>
      </div>
    </Link>
  );
}

export default function HomePage() {
  const [selectedTool, setSelectedTool] = useState<HomeToolId>("compress");
  const totalTools = Object.keys(toolAccents).length + EXTRA_TOOL_CARDS.length;

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
                  "Free online PDF tools that work entirely in your browser. Compress, merge, and split PDFs instantly.",
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

      <section
        id="top"
        className="flex min-h-[calc(100dvh-64px)] flex-col items-center justify-center px-4 py-8 text-center"
      >
        <h1 className="max-w-[900px] text-[clamp(32px,4.5vw,52px)] font-extrabold leading-[1.15]">
          <span className="text-foreground">Your PDFs.</span>
          <br />
          <span className="text-accent">Done in Seconds.</span>
          <br />
          <span className="text-foreground">Right in Your Browser.</span>
        </h1>
        <p className="mt-4 max-w-[520px] text-lg text-body">
          {totalTools} tools. No install. No account. Nothing leaves your device.
        </p>

        <HeroDropzone selectedTool={selectedTool} id="heroDropzone" />
        <ToolPills selected={selectedTool} onSelect={setSelectedTool} />
        <Reveal delay={560} className="mt-2.5 max-w-[680px] text-center text-[13px] text-muted">
          Click any tool above to get started instantly
        </Reveal>
      </section>

      <section className="px-4 pb-10">
        <div className="container-lp mb-12">
          <Reveal>
            <h2 className="mb-8 text-center text-2xl font-bold text-foreground sm:text-3xl">Popular PDF tools</h2>
          </Reveal>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <Reveal delay={0}>
              <ToolCard
                tool="compress"
                title="Compress PDF"
                description="Reduce file size without leaving your browser"
                tag="Fast & Private"
                href="/compress"
                icon={
                  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5M7 10l5-5 5 5" />
                  </svg>
                }
              />
            </Reveal>
            <Reveal delay={120}>
              <ToolCard
                tool="merge"
                title="Merge PDF"
                description="Combine multiple PDFs into one document"
                tag="Drag & Drop"
                href="/merge"
                icon={
                  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h12M8 12h12M8 18h8" />
                  </svg>
                }
              />
            </Reveal>
            <Reveal delay={240}>
              <ToolCard
                tool="split"
                title="Split PDF"
                description="Extract page ranges or split every page"
                tag="Flexible"
                href="/split"
                icon={
                  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4" />
                  </svg>
                }
              />
            </Reveal>
            <Reveal delay={360}>
              <ToolCard
                tool="rotate"
                title="Rotate PDF"
                description="Rotate any page or the entire document instantly"
                tag="Simple & Precise"
                href="/rotate"
                icon={<RotateCw className="h-7 w-7" strokeWidth={2} />}
              />
            </Reveal>
            <Reveal delay={480}>
              <ToolCard
                tool="textToPdf"
                title="Text to PDF"
                description="Turn plain text into a formatted PDF instantly"
                tag="Quick & Clean"
                href="/text-to-pdf"
                icon={<FileText className="h-7 w-7" strokeWidth={2} />}
              />
            </Reveal>
            <Reveal delay={600}>
              <ToolCard
                tool="resize"
                title="Resize PDF"
                description="Change page size for all or selected pages"
                tag="Flexible & Precise"
                href="/resize"
                icon={<Maximize2 className="h-7 w-7" strokeWidth={2} />}
              />
            </Reveal>
            <Reveal delay={720}>
              <ToolCard
                tool="pageNumbers"
                title="Page Numbers"
                description="Add professional page numbers anywhere"
                tag="Clean & Professional"
                href="/page-numbers"
                icon={<Hash className="h-7 w-7" strokeWidth={2} />}
              />
            </Reveal>
            <Reveal delay={840}>
              <ToolCard
                tool="crop"
                title="Crop PDF"
                description="Trim headers, footers, or custom margins"
                tag="Sharp & Accurate"
                href="/crop"
                icon={<Crop className="h-7 w-7" strokeWidth={2} />}
              />
            </Reveal>
            <Reveal delay={960}>
              <ToolCard
                tool="pdfToWord"
                title="PDF to Word"
                description="Extract text from any PDF into an editable .docx"
                tag="Text Extraction"
                href="/pdf-to-word"
                icon={<FileText className="h-7 w-7" strokeWidth={2} />}
              />
            </Reveal>
            <Reveal delay={1080}>
              <ToolCard
                tool="wordToPdf"
                title="Word to PDF"
                description="Convert any .docx document to a clean PDF"
                tag="Quick Convert"
                href="/word-to-pdf"
                icon={<FileType className="h-7 w-7" strokeWidth={2} />}
              />
            </Reveal>
            <Reveal delay={1200}>
              <ToolCard
                tool="pdfToExcel"
                title="PDF to Excel"
                description="Extract tables and data into a spreadsheet"
                tag="Data Extract"
                href="/pdf-to-excel"
                icon={<Table className="h-7 w-7" strokeWidth={2} />}
              />
            </Reveal>
            <Reveal delay={1320}>
              <ToolCard
                tool="excelToPdf"
                title="Excel to PDF"
                description="Convert spreadsheets to formatted PDFs"
                tag="Table Render"
                href="/excel-to-pdf"
                icon={<Sheet className="h-7 w-7" strokeWidth={2} />}
              />
            </Reveal>
            <Reveal delay={1440}>
              <ToolCard
                tool="protect"
                title="Protect PDF"
                description="Add password protection and encryption"
                tag="Encrypt & Lock"
                href="/protect"
                icon={<Lock className="h-7 w-7" strokeWidth={2} />}
              />
            </Reveal>
            <Reveal delay={1560}>
              <ToolCard
                tool="unlock"
                title="Unlock PDF"
                description="Remove password protection from your PDFs"
                tag="Decrypt"
                href="/unlock"
                icon={<Unlock className="h-7 w-7" strokeWidth={2} />}
              />
            </Reveal>
            <Reveal delay={1680}>
              <ToolCard
                tool="organize"
                title="Organize PDF"
                description="Reorder, delete, rotate, and rearrange pages with a visual drag-and-drop editor"
                tag="Visual & Intuitive"
                href="/organize"
                icon={<LayoutGrid className="h-7 w-7" strokeWidth={2} />}
              />
            </Reveal>
            <Reveal delay={1800}>
              <ToolCard
                tool="ocr"
                title="OCR PDF"
                description="Make scanned PDFs searchable. Extracts text from image-based PDFs with high accuracy"
                tag="AI-Powered"
                href="/ocr"
                icon={<ScanText className="h-7 w-7" strokeWidth={2} />}
              />
            </Reveal>
          </div>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {EXTRA_TOOL_CARDS.map((tool, index) => (
              <Reveal key={tool.href} delay={1200 + index * 120}>
                <ExtraToolCard {...tool} />
              </Reveal>
            ))}
          </div>
          <Reveal delay={960} className="mt-8 text-center">
            <Link
              href="/tools"
              className="inline-flex items-center gap-2 text-sm font-semibold text-accent transition hover:underline"
            >
              View All Tools →
            </Link>
          </Reveal>
        </div>
        <TrustBar />
        <SocialBar />
      </section>

      <HomeFeatures onSelectTool={setSelectedTool} />
      <Testimonials />

      <section className="px-4 py-12 sm:py-16 lg:py-20" id="pricing">
        <div className="text-center">
          <Reveal>
            <HeroDropzone selectedTool={selectedTool} variant="bottom" pulseOnView />
          </Reveal>
        </div>
      </section>
    </AppShell>
  );
}
