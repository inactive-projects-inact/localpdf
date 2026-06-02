import Link from "next/link";
import {
  Crop,
  Code,
  Eraser,
  FileDown,
  FileCode,
  FileText,
  FileType,
  GitMerge,
  Hash,
  Lock,
  Maximize2,
  LayoutGrid,
  Layers,
  PenLine,
  RotateCw,
  Scissors,
  Table,
  Sheet,
  ScanText,
  Unlock,
  Image,
  FileImage,
  Stamp,
  Presentation,
} from "lucide-react";
import AppShell from "../components/AppShell";
import ToolCard from "../components/ToolCard";

const SECTIONS = [
  {
    label: "Edit PDF",
    tools: [
      {
        tool: "compress" as const,
        title: "Compress PDF",
        description: "Shrink file size without losing quality",
        tag: "Fast & Private",
        href: "/compress",
        icon: <FileDown className="h-7 w-7" strokeWidth={2} />,
      },
      {
        tool: "merge" as const,
        title: "Merge PDF",
        description: "Combine multiple PDFs into one document",
        tag: "Drag & Drop",
        href: "/merge",
        icon: <GitMerge className="h-7 w-7" strokeWidth={2} />,
      },
      {
        tool: "split" as const,
        title: "Split PDF",
        description: "Extract pages or split every page",
        tag: "Flexible",
        href: "/split",
        icon: <Scissors className="h-7 w-7" strokeWidth={2} />,
      },
      {
        tool: "rotate" as const,
        title: "Rotate PDF",
        description: "Rotate any page or the entire document",
        tag: "Simple & Precise",
        href: "/rotate",
        icon: <RotateCw className="h-7 w-7" strokeWidth={2} />,
      },
      {
        tool: "crop" as const,
        title: "Crop PDF",
        description: "Trim headers, footers, or custom margins",
        tag: "Sharp & Accurate",
        href: "/crop",
        icon: <Crop className="h-7 w-7" strokeWidth={2} />,
      },
      {
        tool: "organize" as const,
        title: "Organize PDF",
        description: "Reorder, delete, rotate, and rearrange pages with a visual drag-and-drop editor",
        tag: "Visual & Intuitive",
        href: "/organize",
        icon: <LayoutGrid className="h-7 w-7" strokeWidth={2} />,
      },
      {
        tool: "resize" as const,
        title: "Resize PDF",
        description: "Change page size for all or selected pages",
        tag: "Flexible & Precise",
        href: "/resize",
        icon: <Maximize2 className="h-7 w-7" strokeWidth={2} />,
      },
      {
        tool: "pageNumbers" as const,
        title: "Page Numbers",
        description: "Add styled page numbers anywhere",
        tag: "Clean & Professional",
        href: "/page-numbers",
        icon: <Hash className="h-7 w-7" strokeWidth={2} />,
      },
      {
        tool: "watermark" as const,
        title: "Watermark PDF",
        description: "Stamp text or image watermarks",
        tag: "Brand & Protect",
        href: "/watermark",
        icon: <Stamp className="h-7 w-7" strokeWidth={2} />,
      },
      {
        tool: "signature" as const,
        title: "Sign PDF",
        description: "Draw, type, or upload your signature",
        tag: "Secure & Legal",
        href: "/signature",
        icon: <PenLine className="h-7 w-7" strokeWidth={2} />,
      },
      {
        tool: "jpg2pdf" as const,
        title: "JPG to PDF",
        description: "Convert images to a PDF document",
        tag: "Quick Convert",
        href: "/jpg-to-pdf",
        icon: <Image className="h-7 w-7" strokeWidth={2} />,
      },
      {
        tool: "pdf2jpg" as const,
        title: "PDF to JPG",
        description: "Export each PDF page as an image",
        tag: "Export Images",
        href: "/pdf-to-jpg",
        icon: <FileImage className="h-7 w-7" strokeWidth={2} />,
      },
    ],
  },
  {
    label: "Convert PDF",
    tools: [
      {
        tool: "pdfToWord" as const,
        title: "PDF to Word",
        description: "Extract text and structure into an editable .docx file",
        tag: "Text Extraction",
        href: "/pdf-to-word",
        icon: <FileText className="h-7 w-7" strokeWidth={2} />,
      },
      {
        tool: "wordToPdf" as const,
        title: "Word to PDF",
        description: "Convert any .docx document into a clean PDF",
        tag: "Quick Convert",
        href: "/word-to-pdf",
        icon: <FileType className="h-7 w-7" strokeWidth={2} />,
      },
      {
        tool: "pdfToExcel" as const,
        title: "PDF to Excel",
        description: "Extract tables and data into a spreadsheet",
        tag: "Data Extract",
        href: "/pdf-to-excel",
        icon: <Table className="h-7 w-7" strokeWidth={2} />,
      },
      {
        tool: "excelToPdf" as const,
        title: "Excel to PDF",
        description: "Convert spreadsheets to formatted PDFs",
        tag: "Table Render",
        href: "/excel-to-pdf",
        icon: <Sheet className="h-7 w-7" strokeWidth={2} />,
      },
    ],
  },
  {
    label: "Secure PDF",
    tools: [
      {
        tool: "redact" as const,
        title: "Redact PDF",
        description: "Permanently remove sensitive information",
        tag: "Permanent Removal",
        href: "/redact",
        icon: <Eraser className="h-7 w-7" strokeWidth={2} />,
      },
      {
        tool: "protect" as const,
        title: "Protect PDF",
        description: "Add password protection and restrict access",
        tag: "Encrypt & Lock",
        href: "/protect",
        icon: <Lock className="h-7 w-7" strokeWidth={2} />,
      },
      {
        tool: "unlock" as const,
        title: "Unlock PDF",
        description: "Remove password protection from your PDFs",
        tag: "Decrypt",
        href: "/unlock",
        icon: <Unlock className="h-7 w-7" strokeWidth={2} />,
      },
    ],
  },
  {
    label: "Advanced Tools",
    tools: [
      {
        tool: "ocr" as const,
        title: "OCR PDF",
        description: "Make scanned PDFs searchable. Extracts text from image-based PDFs with high accuracy",
        tag: "AI-Powered",
        href: "/ocr",
        icon: <ScanText className="h-7 w-7" strokeWidth={2} />,
      },
    ],
  },
];

type ExtraTool = {
  title: string;
  description: string;
  tag: string;
  href: string;
  icon: React.ReactNode;
  color: string;
};

const EXTRA_TOOLS: Record<string, ExtraTool[]> = {
  "Edit PDF": [
    {
      title: "Sign PDF",
      description: "Draw, type, or upload your signature",
      tag: "Draw, Type or Upload",
      href: "/sign",
      icon: <PenLine className="h-7 w-7" strokeWidth={2} />,
      color: "#3B3BFF",
    },
    {
      title: "Flatten PDF",
      description: "Convert interactive PDFs into flat, static documents. Removes all form fields, annotations, and layers.",
      tag: "Remove Forms & Annotations",
      href: "/flatten",
      icon: <Layers className="h-7 w-7" strokeWidth={2} />,
      color: "#FF4D4D",
    },
  ],
  "Convert PDF": [
    {
      title: "PDF to PowerPoint",
      description: "Each page becomes a slide",
      tag: "Every Page → Slide",
      href: "/pdf-to-pptx",
      icon: <Presentation className="h-7 w-7" strokeWidth={2} />,
      color: "#F59E0B",
    },
    {
      title: "HTML to PDF",
      description: "Paste HTML or upload an HTML file and download instantly",
      tag: "Paste or Upload",
      href: "/html-to-pdf",
      icon: <Code className="h-7 w-7" strokeWidth={2} />,
      color: "#10B981",
    },
    {
      title: "PDF to Markdown",
      description: "Extract text from any PDF and convert it to clean, editable Markdown format.",
      tag: "Structured & Clean",
      href: "/pdf-to-markdown",
      icon: <FileCode className="h-7 w-7" strokeWidth={2} />,
      color: "#3B3BFF",
    },
  ],
};

function ExtraToolCard({ tool }: { tool: ExtraTool }) {
  return (
    <Link
      href={tool.href}
      className="group relative flex flex-col rounded-3xl border border-border bg-card p-8 transition-all hover:-translate-y-1 hover:shadow-xl dark:hover:shadow-black/40"
      aria-label={tool.title}
    >
      <div className="flex items-start justify-between">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ backgroundColor: "var(--background)", color: tool.color }}
        >
          {tool.icon}
        </div>
        <span
          className="rounded-full px-3 py-1 text-xs font-semibold"
          style={{ backgroundColor: "var(--background)", color: tool.color }}
        >
          {tool.tag}
        </span>
      </div>
      <h3 className="mt-6 text-xl font-bold text-foreground">{tool.title}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{tool.description}</p>
      <div className="mt-6 flex items-center gap-2 text-sm font-semibold transition-colors" style={{ color: tool.color }}>
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

export default function ToolsOverviewPage() {
  return (
    <AppShell>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <div className="mb-12 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">All PDF Tools</h1>
          <p className="mx-auto mt-3 max-w-xl text-muted">
            Everything you need to work with PDFs — free, private, browser-based. No uploads, no accounts.
          </p>
        </div>

        <div className="space-y-14">
          {SECTIONS.map((section) => (
            <section key={section.label}>
              <h2 className="mb-6 text-lg font-bold text-foreground tracking-tight">{section.label}</h2>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {section.tools.map((t) => (
                  <ToolCard
                    key={t.href}
                    tool={t.tool}
                    title={t.title}
                    description={t.description}
                    tag={t.tag}
                    href={t.href}
                    icon={t.icon}
                  />
                ))}
              </div>
              {EXTRA_TOOLS[section.label] && (
                <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {EXTRA_TOOLS[section.label].map((tool) => (
                    <ExtraToolCard key={tool.href} tool={tool} />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      </main>
    </AppShell>
  );
}
