"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Crop,
  Code,
  Eraser,
  LayoutGrid,
  FileDown,
  FileCode,
  FileText,
  FileType,
  GitMerge,
  Hash,
  Lock,
  Maximize2,
  Layers,
  PenLine,
  Presentation,
  RotateCw,
  Scissors,
  Table,
  Sheet,
  ScanText,
  Unlock,
  ChevronRight,
} from "lucide-react";
import Logo from "./Logo";

const homeSections = [
  { href: "/#features", label: "Features", id: "features" },
  { href: "/#blog", label: "Blog", id: "blog" },
  { href: "/#pricing", label: "Pricing", id: "pricing" },
];

const pageLinks = [
  { href: "/blog", label: "Blog" },
  { href: "/about", label: "About" },
];

interface ToolGroup {
  label: string;
  items: { label: string; href: string; icon: React.ElementType; color: string }[];
}

const toolGroups: ToolGroup[] = [
  {
    label: "Edit PDF",
    items: [
      { label: "Compress", href: "/compress", icon: FileDown, color: "#00E676" },
      { label: "Merge", href: "/merge", icon: GitMerge, color: "#9B59B6" },
      { label: "Split", href: "/split", icon: Scissors, color: "#3498DB" },
      { label: "Rotate", href: "/rotate", icon: RotateCw, color: "#10B981" },
      { label: "Crop", href: "/crop", icon: Crop, color: "#F59E0B" },
      { label: "Organize PDF", href: "/organize", icon: LayoutGrid, color: "#3B82F6" },
      { label: "Resize", href: "/resize", icon: Maximize2, color: "#3B82F6" },
      { label: "Page Numbers", href: "/page-numbers", icon: Hash, color: "#FF4D4D" },
      { label: "Sign PDF", href: "/sign", icon: PenLine, color: "#3B3BFF" },
      { label: "Flatten PDF", href: "/flatten", icon: Layers, color: "#FF4D4D" },
    ],
  },
  {
    label: "Convert PDF",
    items: [
      { label: "PDF to Word", href: "/pdf-to-word", icon: FileText, color: "#3B82F6" },
      { label: "Word to PDF", href: "/word-to-pdf", icon: FileType, color: "#3B3BFF" },
      { label: "PDF to Excel", href: "/pdf-to-excel", icon: Table, color: "#10B981" },
      { label: "Excel to PDF", href: "/excel-to-pdf", icon: Sheet, color: "#F59E0B" },
      { label: "PDF to PowerPoint", href: "/pdf-to-pptx", icon: Presentation, color: "#F59E0B" },
      { label: "HTML to PDF", href: "/html-to-pdf", icon: Code, color: "#10B981" },
      { label: "PDF to Markdown", href: "/pdf-to-markdown", icon: FileCode, color: "#3B3BFF" },
    ],
  },
  {
    label: "Secure PDF",
    items: [
      { label: "Redact PDF", href: "/redact", icon: Eraser, color: "#FF4D4D" },
      { label: "Protect PDF", href: "/protect", icon: Lock, color: "#FF4D4D" },
      { label: "Unlock PDF", href: "/unlock", icon: Unlock, color: "#10B981" },
    ],
  },
  {
    label: "Advanced Tools",
    items: [{ label: "OCR PDF", href: "/ocr", icon: ScanText, color: "#3B3BFF" }],
  },
];

// Flat list for active detection
const allToolItems = toolGroups.flatMap(g => g.items);

export default function Navbar() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("features");
  const toolsRef = useRef<HTMLDivElement>(null);

  const isToolActive = allToolItems.some((item) => pathname === item.href);

  useEffect(() => {
    if (!isHome) return;

    const sections = ["features", "blog", "pricing"];
    const onScroll = () => {
      const scrollY = window.scrollY + 120;
      let current = "features";
      sections.forEach((id) => {
        const el = document.getElementById(id);
        if (el && el.offsetTop <= scrollY) current = id;
      });
      setActiveSection(current);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [isHome]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!toolsRef.current?.contains(event.target as Node)) {
        setToolsOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const navLinks = isHome
    ? homeSections.map((s) => ({ href: s.href, label: s.label, active: activeSection === s.id }))
    : pageLinks.map((l) => ({ ...l, active: pathname === l.href }));

  return (
    <header className="sticky top-0 z-[1000] h-16 border-b border-border bg-[rgba(8,13,20,0.88)] backdrop-blur-xl light:bg-background/90">
      <div className="mx-auto flex h-full max-w-[1280px] items-center justify-between px-4 sm:px-8">
        <Logo />

        <nav className="hidden items-center gap-8 md:flex" aria-label="Main navigation">
          {!isHome && (
            <div className="relative" ref={toolsRef}>
              <button
                type="button"
                onClick={() => setToolsOpen((open) => !open)}
                className={`flex items-center gap-1.5 text-[15px] font-medium transition-colors ${
                  isToolActive || toolsOpen ? "text-accent" : "text-body hover:text-accent"
                }`}
                aria-expanded={toolsOpen}
                aria-haspopup="true"
              >
                Tools
                <svg
                  className={`h-4 w-4 transition-transform ${toolsOpen ? "rotate-180" : ""}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                </svg>
              </button>

              {toolsOpen && (
                <div className="absolute left-0 top-full z-50 mt-2 w-[680px] rounded-2xl border border-border bg-card p-4 shadow-2xl">
                  <div className="grid grid-cols-2 gap-5">
                    {toolGroups.map((group) => (
                      <div key={group.label}>
                        <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-widest text-muted">
                          {group.label}
                        </p>
                        <div className="space-y-0.5">
                          {group.items.map((item) => {
                            const Icon = item.icon;
                            const active = pathname === item.href;
                            return (
                              <Link
                                key={item.href}
                                href={item.href}
                                onClick={() => setToolsOpen(false)}
                                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                                  active
                                    ? "bg-accent-tint text-accent"
                                    : "text-body hover:bg-accent-tint hover:text-accent"
                                }`}
                              >
                                <Icon className="h-4 w-4 shrink-0" style={{ color: item.color }} aria-hidden />
                                {item.label}
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 border-t border-border pt-3">
                    <Link
                      href="/tools"
                      onClick={() => setToolsOpen(false)}
                      className="flex items-center gap-1.5 px-1 text-sm font-semibold text-accent hover:underline"
                    >
                      View all tools <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}

          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-[15px] font-medium transition-colors ${
                link.active ? "text-accent" : "text-body hover:text-accent"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <button
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-body transition hover:bg-card hover:text-accent md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Open menu"
          aria-expanded={mobileOpen}
        >
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <div
          className="flex flex-col gap-1 border-b border-border bg-card/98 px-4 py-4 backdrop-blur-xl md:hidden"
          role="navigation"
          aria-label="Mobile navigation"
        >
          {!isHome && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                {toolGroups.map((group) => (
                  <div key={group.label}>
                    <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-muted">
                      {group.label}
                    </p>
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const active = pathname === item.href;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileOpen(false)}
                          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium transition ${
                            active ? "bg-accent-tint text-accent" : "text-body hover:bg-accent-tint hover:text-accent"
                          }`}
                        >
                          <Icon className="h-5 w-5 shrink-0" style={{ color: item.color }} aria-hidden />
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                ))}
              </div>
              <Link
                href="/tools"
                onClick={() => setMobileOpen(false)}
                className="mx-3 mt-2 flex items-center gap-1.5 rounded-lg border border-border px-3 py-2.5 text-sm font-semibold text-accent"
              >
                View all tools <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </>
          )}

          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className={`rounded-lg px-3 py-3 text-[15px] font-medium transition ${
                link.active ? "bg-accent-tint text-accent" : "text-body hover:bg-accent-tint hover:text-accent"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
