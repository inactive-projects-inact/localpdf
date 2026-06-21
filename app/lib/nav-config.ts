import type { LucideIcon } from "lucide-react";
import {
  Crop,
  FileDown,
  FileText,
  FileType,
  GitMerge,
  Hash,
  LayoutGrid,
  Lock,
  Maximize2,
  PenLine,
  RotateCw,
  Scissors,
  Table,
  Sheet,
  ScanText,
  Unlock,
  Eraser,
  Stamp,
  Image,
  FileImage,
} from "lucide-react";

export type NavCategory = "organize" | "convert" | "edit" | "security";

export interface NavToolItem {
  label: string;
  href: string;
  icon: LucideIcon;
  category: NavCategory;
  mode: "local" | "cloud";
  synonyms?: string[];
}

export const NAV_CATEGORIES: { id: NavCategory; label: string; href: string }[] = [
  { id: "organize", label: "Organize", href: "/tools#organize" },
  { id: "convert", label: "Convert", href: "/tools#convert" },
  { id: "edit", label: "Edit", href: "/tools#edit" },
  { id: "security", label: "Security", href: "/tools#security" },
];

export const NAV_TOOLS: NavToolItem[] = [
  { label: "Compress PDF", href: "/compress", icon: FileDown, category: "edit", mode: "local", synonyms: ["shrink", "make smaller", "reduce size"] },
  { label: "Merge PDF", href: "/merge", icon: GitMerge, category: "organize", mode: "local", synonyms: ["combine", "join"] },
  { label: "Split PDF", href: "/split", icon: Scissors, category: "organize", mode: "local", synonyms: ["extract pages", "separate"] },
  { label: "Rotate PDF", href: "/rotate", icon: RotateCw, category: "organize", mode: "local" },
  { label: "Organize PDF", href: "/organize", icon: LayoutGrid, category: "organize", mode: "local", synonyms: ["reorder", "rearrange"] },
  { label: "Crop PDF", href: "/crop", icon: Crop, category: "edit", mode: "local", synonyms: ["trim"] },
  { label: "Resize PDF", href: "/resize", icon: Maximize2, category: "edit", mode: "local" },
  { label: "Page Numbers", href: "/page-numbers", icon: Hash, category: "edit", mode: "local" },
  { label: "Watermark PDF", href: "/watermark", icon: Stamp, category: "edit", mode: "local" },
  { label: "Sign PDF", href: "/sign", icon: PenLine, category: "edit", mode: "local", synonyms: ["signature"] },
  { label: "JPG to PDF", href: "/jpg-to-pdf", icon: Image, category: "convert", mode: "local" },
  { label: "PDF to JPG", href: "/pdf-to-jpg", icon: FileImage, category: "convert", mode: "local" },
  { label: "PDF to Word", href: "/pdf-to-word", icon: FileText, category: "convert", mode: "local", synonyms: ["docx"] },
  { label: "Word to PDF", href: "/word-to-pdf", icon: FileType, category: "convert", mode: "local" },
  { label: "PDF to Excel", href: "/pdf-to-excel", icon: Table, category: "convert", mode: "local", synonyms: ["spreadsheet"] },
  { label: "Excel to PDF", href: "/excel-to-pdf", icon: Sheet, category: "convert", mode: "local" },
  { label: "Protect PDF", href: "/protect", icon: Lock, category: "security", mode: "local", synonyms: ["password", "encrypt"] },
  { label: "Unlock PDF", href: "/unlock", icon: Unlock, category: "security", mode: "local", synonyms: ["decrypt", "remove password"] },
  { label: "Redact PDF", href: "/redact", icon: Eraser, category: "security", mode: "local" },
  { label: "OCR PDF", href: "/ocr", icon: ScanText, category: "edit", mode: "local", synonyms: ["scan", "searchable"] },
];

export const MOST_USED_TOOLS = [
  "Compress PDF",
  "Merge PDF",
  "Split PDF",
  "Rotate PDF",
  "PDF to Word",
  "Word to PDF",
  "Protect PDF",
  "Organize PDF",
] as const;

export function searchTools(query: string): { item: NavToolItem; isSynonym: boolean }[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const results: { item: NavToolItem; isSynonym: boolean; score: number }[] = [];

  for (const item of NAV_TOOLS) {
    const label = item.label.toLowerCase();
    if (label.includes(q)) {
      results.push({ item, isSynonym: false, score: label.startsWith(q) ? 0 : 1 });
      continue;
    }
    const synonymHit = item.synonyms?.some((s) => s.toLowerCase().includes(q));
    if (synonymHit) {
      results.push({ item, isSynonym: true, score: 2 });
    }
  }

  return results
    .sort((a, b) => a.score - b.score)
    .map(({ item, isSynonym }) => ({ item, isSynonym }));
}
