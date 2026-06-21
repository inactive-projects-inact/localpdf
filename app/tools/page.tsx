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
    id: "organize",
    label: "Organize",
    tools: [
      { title: "Merge PDF", description: "Combine multiple PDFs into one document", href: "/merge", icon: <GitMerge strokeWidth={1.5} /> },
      { title: "Split PDF", description: "Extract pages or split every page", href: "/split", icon: <Scissors strokeWidth={1.5} /> },
      { title: "Rotate PDF", description: "Rotate any page or the entire document", href: "/rotate", icon: <RotateCw strokeWidth={1.5} /> },
      { title: "Organize PDF", description: "Reorder, delete, and rearrange pages visually", href: "/organize", icon: <LayoutGrid strokeWidth={1.5} /> },
    ],
  },
  {
    id: "convert",
    label: "Convert",
    tools: [
      { title: "PDF to Word", description: "Extract text into an editable .docx", href: "/pdf-to-word", icon: <FileText strokeWidth={1.5} /> },
      { title: "Word to PDF", description: "Convert .docx documents to PDF", href: "/word-to-pdf", icon: <FileType strokeWidth={1.5} /> },
      { title: "PDF to Excel", description: "Extract tables into a spreadsheet", href: "/pdf-to-excel", icon: <Table strokeWidth={1.5} /> },
      { title: "Excel to PDF", description: "Convert spreadsheets to PDF", href: "/excel-to-pdf", icon: <Sheet strokeWidth={1.5} /> },
      { title: "JPG to PDF", description: "Convert images to a PDF document", href: "/jpg-to-pdf", icon: <Image strokeWidth={1.5} /> },
      { title: "PDF to JPG", description: "Export each page as an image", href: "/pdf-to-jpg", icon: <FileImage strokeWidth={1.5} /> },
      { title: "PDF to PowerPoint", description: "Turn each page into a slide", href: "/pdf-to-pptx", icon: <Presentation strokeWidth={1.5} /> },
      { title: "HTML to PDF", description: "Paste or upload HTML and download", href: "/html-to-pdf", icon: <Code strokeWidth={1.5} /> },
      { title: "PDF to Markdown", description: "Extract structured text as Markdown", href: "/pdf-to-markdown", icon: <FileCode strokeWidth={1.5} /> },
    ],
  },
  {
    id: "edit",
    label: "Edit",
    tools: [
      { title: "Compress PDF", description: "Reduce file size in your browser", href: "/compress", icon: <FileDown strokeWidth={1.5} /> },
      { title: "Crop PDF", description: "Trim headers, footers, or margins", href: "/crop", icon: <Crop strokeWidth={1.5} /> },
      { title: "Resize PDF", description: "Change page size for selected pages", href: "/resize", icon: <Maximize2 strokeWidth={1.5} /> },
      { title: "Page Numbers", description: "Add professional page numbers", href: "/page-numbers", icon: <Hash strokeWidth={1.5} /> },
      { title: "Watermark PDF", description: "Stamp text or image watermarks", href: "/watermark", icon: <Stamp strokeWidth={1.5} /> },
      { title: "Sign PDF", description: "Draw, type, or upload a signature", href: "/sign", icon: <PenLine strokeWidth={1.5} /> },
      { title: "Flatten PDF", description: "Remove forms, annotations, and layers", href: "/flatten", icon: <Layers strokeWidth={1.5} /> },
      { title: "OCR PDF", description: "Make scanned PDFs searchable", href: "/ocr", icon: <ScanText strokeWidth={1.5} /> },
    ],
  },
  {
    id: "security",
    label: "Security",
    tools: [
      { title: "Protect PDF", description: "Add password protection and encryption", href: "/protect", icon: <Lock strokeWidth={1.5} /> },
      { title: "Unlock PDF", description: "Remove password protection", href: "/unlock", icon: <Unlock strokeWidth={1.5} /> },
      { title: "Redact PDF", description: "Permanently remove sensitive information", href: "/redact", icon: <Eraser strokeWidth={1.5} /> },
    ],
  },
] as const;

export default function ToolsOverviewPage() {
  const totalTools = SECTIONS.reduce((n, s) => n + s.tools.length, 0);

  return (
    <AppShell>
      <main className="container-content flex-1 py-10 sm:py-14">
        <div className="mb-12 text-center">
          <h1 className="text-display-m text-ink-900">All PDF Tools</h1>
          <p className="mx-auto mt-3 max-w-xl text-body-m text-ink-700">
            {totalTools} free tools — private, browser-based. No uploads, no accounts.
          </p>
        </div>

        <div className="space-y-14">
          {SECTIONS.map((section) => (
            <section key={section.id} id={section.id}>
              <h2 className="text-heading-s text-ink-900">{section.label}</h2>
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4 xl:grid-cols-5">
                {section.tools.map((t) => (
                  <ToolCard key={t.href} title={t.title} description={t.description} href={t.href} icon={t.icon} />
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Link href="/" className="text-body-s font-semibold text-ink-900 underline-offset-3 hover:underline">
            ← Back to home
          </Link>
        </div>
      </main>
    </AppShell>
  );
}
