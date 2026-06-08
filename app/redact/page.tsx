"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  Eraser,
  Loader2,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import AppShell from "../components/AppShell";
import ShortcutHint from "../components/ShortcutHint";
import SizeComparisonBadge from "../components/SizeComparisonBadge";
import { useFileHistory } from "../components/FileHistoryProvider";
import { formatBytes } from "../lib/format-bytes";
import { downloadBlob } from "../lib/pdf-utils";
import { getToolDefinition, hasPdfHeader } from "../lib/tool-registry";
import { usePdfDocProxy } from "../hooks/usePdfDocProxy";

type RedactionBox = {
  id: string;
  pageIndex: number;
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  source: "manual" | "search" | "pattern";
  label?: string;
};

type RedactionStyle = "black" | "white";

type PatternType = "email" | "phone" | "ssn" | "creditcard" | "ipaddress" | "date";

type Step = "upload" | "editor" | "review" | "processing" | "done";

type TextItemBox = {
  text: string;
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
};

type PatternConfig = {
  type: PatternType;
  label: string;
  example: string;
  regex: RegExp;
};

type PendingMatches = {
  boxes: RedactionBox[];
  pages: number;
  total: number;
  label: string;
};

type PatternSummary = {
  boxes: RedactionBox[];
  counts: Record<PatternType, number>;
};

type ProcessingStatus = "waiting" | "copying" | "copied" | "redacting" | "redacted" | "failed";

const TOOL = getToolDefinition("redact");
const ACCENT = "#FF4D4D";
const HISTORY_LIMIT = 20;
const MIN_DRAG_PX = 10;

const PATTERNS: PatternConfig[] = [
  {
    type: "email",
    label: "Email addresses",
    example: "name@example.com",
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  {
    type: "phone",
    label: "Phone numbers",
    example: "(555) 123-4567",
    regex: /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
  },
  {
    type: "ssn",
    label: "Social Security Numbers",
    example: "123-45-6789",
    regex: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
  },
  {
    type: "creditcard",
    label: "Credit card numbers",
    example: "4111 1111 1111 1111",
    regex: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
  },
  {
    type: "ipaddress",
    label: "IP addresses",
    example: "192.168.0.1",
    regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  },
  {
    type: "date",
    label: "Dates",
    example: "04/24/2026",
    regex: /\b(?:\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\w+\s\d{1,2},?\s\d{4})\b/g,
  },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
}

function cloneBoxes(boxes: RedactionBox[]) {
  return boxes.map((box) => ({ ...box }));
}

function normalizeSearchTerm(term: string) {
  return term.trim();
}

function buildSearchRegex(term: string, caseSensitive: boolean, wholeWord: boolean) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = wholeWord ? `\\b${escaped}\\b` : escaped;
  return new RegExp(pattern, caseSensitive ? "g" : "gi");
}

function statusLabel(status: ProcessingStatus) {
  if (status === "copying") return "Copied — no redactions";
  if (status === "copied") return "Copied — no redactions";
  if (status === "redacting") return "Redacting...";
  if (status === "redacted") return "Redacted ✓";
  if (status === "failed") return "Skipped — kept original";
  return "Waiting";
}

export default function RedactPdfPage() {
  const { addFile } = useFileHistory();
  const { proxyRef, numPages, loadError, load, destroy } = usePdfDocProxy();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [redactions, setRedactions] = useState<RedactionBox[]>([]);
  const [redactionStyle, setRedactionStyle] = useState<RedactionStyle>("black");
  const [showLabel, setShowLabel] = useState(true);
  const [activeTool, setActiveTool] = useState<"draw" | "search" | "pattern">("draw");
  const [drawOpen, setDrawOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [patternOpen, setPatternOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchCaseSensitive, setSearchCaseSensitive] = useState(false);
  const [searchWholeWord, setSearchWholeWord] = useState(false);
  const [searchScope, setSearchScope] = useState<"all" | "current">("all");
  const [searchSummary, setSearchSummary] = useState<string>("");
  const [pendingSearch, setPendingSearch] = useState<PendingMatches | null>(null);
  const [patternSelections, setPatternSelections] = useState<Record<PatternType, boolean>>({
    email: false,
    phone: false,
    ssn: false,
    creditcard: false,
    ipaddress: false,
    date: false,
  });
  const [patternSummary, setPatternSummary] = useState<PatternSummary | null>(null);
  const [pendingHighlights, setPendingHighlights] = useState<RedactionBox[]>([]);
  const [highlightedBoxId, setHighlightedBoxId] = useState<string | null>(null);
  const [hoveredBoxId, setHoveredBoxId] = useState<string | null>(null);
  const [hoveredBoxRect, setHoveredBoxRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string } | null>(null);
  const [dragRect, setDragRect] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});
  const [toolsOpen, setToolsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [processingStatuses, setProcessingStatuses] = useState<Record<number, ProcessingStatus>>({});
  const [processingPage, setProcessingPage] = useState(0);
  const [progress, setProgress] = useState(0);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [resultName, setResultName] = useState("");

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const renderTaskRef = useRef(0);
  const historyRef = useRef<RedactionBox[][]>([]);
  const textCacheRef = useRef<Map<number, TextItemBox[]>>(new Map());
  const thumbnailsRef = useRef<Record<number, string>>({});

  const totalRedactions = redactions.length;
  const pagesWithRedactions = useMemo(() => {
    const set = new Set(redactions.map((box) => box.pageIndex));
    return set.size;
  }, [redactions]);

  const pageRedactions = useMemo(() => {
    const grouped = new Map<number, RedactionBox[]>();
    redactions.forEach((box) => {
      if (!grouped.has(box.pageIndex)) grouped.set(box.pageIndex, []);
      grouped.get(box.pageIndex)?.push(box);
    });
    return grouped;
  }, [redactions]);

  const currentPageBoxes = pageRedactions.get(currentPage) ?? [];

  const updateThumbnails = useCallback((next: Record<number, string>) => {
    thumbnailsRef.current = next;
    setThumbnails(next);
  }, []);

  const pushHistory = useCallback(
    (snapshot: RedactionBox[]) => {
      const cloned = cloneBoxes(snapshot);
      const updated = [...historyRef.current, cloned].slice(-HISTORY_LIMIT);
      historyRef.current = updated;
    },
    [],
  );

  const setRedactionsWithHistory = useCallback(
    (next: RedactionBox[]) => {
      pushHistory(redactions);
      setRedactions(next);
    },
    [pushHistory, redactions],
  );

  const resetAll = useCallback(() => {
    destroy();
    setStep("upload");
    setFile(null);
    setPageCount(0);
    setCurrentPage(0);
    setRedactions([]);
    setRedactionStyle("black");
    setShowLabel(true);
    setActiveTool("draw");
    setDrawOpen(true);
    setSearchOpen(false);
    setPatternOpen(false);
    setSearchTerm("");
    setSearchSummary("");
    setPendingSearch(null);
    setPatternSelections({ email: false, phone: false, ssn: false, creditcard: false, ipaddress: false, date: false });
    setPatternSummary(null);
    setPendingHighlights([]);
    setHighlightedBoxId(null);
    setHoveredBoxId(null);
    setHoveredBoxRect(null);
    setTooltip(null);
    setDragRect(null);
    setIsRendering(false);
    setThumbnails({});
    setToolsOpen(false);
    setProcessingStatuses({});
    setProcessingPage(0);
    setProgress(0);
    setResultBytes(null);
    setResultName("");
    historyRef.current = [];
    textCacheRef.current.clear();
  }, [destroy]);

  const handleDrop = useCallback(async (files: File[]) => {
    const selectedFile = files[0];
    if (!selectedFile) return;
    if (!(await hasPdfHeader(selectedFile))) {
      toast.error("Please select a valid PDF file.");
      return;
    }
    setFile(selectedFile);
    setCurrentPage(0);
    setRedactions([]);
    setStep("upload");
    setResultBytes(null);
    setResultName("");
    setThumbnails({});
    thumbnailsRef.current = {};
    textCacheRef.current.clear();
    historyRef.current = [];
    load(selectedFile);
  }, [load]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: handleDrop,
    accept: TOOL.input.accept,
    multiple: false,
    maxFiles: 1,
    maxSize: TOOL.input.maxSizeBytes,
    noKeyboard: true,
  });

  const setStyle = useCallback((style: RedactionStyle) => {
    setRedactionStyle(style);
    setShowLabel(style === "black");
  }, []);

  const getTextItemsForPage = useCallback(
    async (pageIndex: number) => {
      const cached = textCacheRef.current.get(pageIndex);
      if (cached) return cached;
      const proxy = proxyRef.current;
      if (!proxy) return [];
      const page = await proxy.getPage(pageIndex + 1);
      const viewport = page.getViewport({ scale: 1 });
      const pageWidth = viewport.width;
      const pageHeight = viewport.height;
      const content = await page.getTextContent();
      const items = (content.items as Array<{ str: string; transform: number[]; width: number; height: number }>) || [];
      const padding = 2;
      const mapped = items
        .filter((item) => item.str && item.str.trim())
        .map((item) => {
          const pdfX = item.transform[4];
          const pdfY = item.transform[5];
          const width = item.width || 0;
          const height = item.height || 0;
          const left = clamp01((pdfX - padding) / pageWidth);
          const top = clamp01((pageHeight - pdfY - height - padding) / pageHeight);
          const wPct = clamp01((width + padding * 2) / pageWidth);
          const hPct = clamp01((height + padding * 2) / pageHeight);
          return {
            text: item.str,
            xPct: left,
            yPct: top,
            wPct,
            hPct,
          } as TextItemBox;
        });
      textCacheRef.current.set(pageIndex, mapped);
      return mapped;
    },
    [proxyRef],
  );

  const runSearch = useCallback(async () => {
    if (!proxyRef.current) return;
    const term = normalizeSearchTerm(searchTerm);
    if (!term) {
      toast.error("Enter text to search.");
      return;
    }
    const regex = buildSearchRegex(term, searchCaseSensitive, searchWholeWord);
    const targetPages = searchScope === "current" ? [currentPage] : Array.from({ length: pageCount }, (_, i) => i);
    const boxes: RedactionBox[] = [];
    const pagesHit = new Set<number>();
    const seen = new Set<string>();

    for (const pageIndex of targetPages) {
      regex.lastIndex = 0;
      const items = await getTextItemsForPage(pageIndex);
      if (items.length === 0) continue;
      const joined = items.map((item) => item.text).join(" ");
      const ranges = items.reduce<{ start: number; end: number }[]>((acc, item, idx) => {
        const start = idx === 0 ? 0 : acc[idx - 1].end + 1;
        acc.push({ start, end: start + item.text.length });
        return acc;
      }, []);

      let match: RegExpExecArray | null;
      while ((match = regex.exec(joined))) {
        const matchStart = match.index;
        const matchEnd = matchStart + match[0].length;
        ranges.forEach((range, idx) => {
          if (range.start < matchEnd && range.end > matchStart) {
            const item = items[idx];
            const key = `${pageIndex}-${item.xPct}-${item.yPct}-${item.wPct}-${item.hPct}`;
            if (seen.has(key)) return;
            seen.add(key);
            boxes.push({
              id: crypto.randomUUID(),
              pageIndex,
              xPct: item.xPct,
              yPct: item.yPct,
              wPct: item.wPct,
              hPct: item.hPct,
              source: "search",
              label: term,
            });
            pagesHit.add(pageIndex);
          }
        });
      }
    }

    const summary = `Found ${boxes.length} instances across ${pagesHit.size} pages`;
    setSearchSummary(summary);
    if (boxes.length === 0) {
      setPendingSearch(null);
      setPendingHighlights([]);
      return;
    }
    const pending: PendingMatches = {
      boxes,
      pages: pagesHit.size,
      total: boxes.length,
      label: term,
    };
    setPendingSearch(pending);
    setPendingHighlights(boxes);
  }, [currentPage, getTextItemsForPage, pageCount, proxyRef, searchCaseSensitive, searchScope, searchTerm, searchWholeWord]);

  const confirmSearch = useCallback(() => {
    if (!pendingSearch) return;
    const next = [...redactions, ...pendingSearch.boxes];
    setRedactionsWithHistory(next);
    setPendingSearch(null);
    setPendingHighlights([]);
  }, [pendingSearch, redactions, setRedactionsWithHistory]);

  const cancelSearch = useCallback(() => {
    setPendingSearch(null);
    setPendingHighlights([]);
  }, []);

  const runPatternDetection = useCallback(async () => {
    if (!proxyRef.current) return;
    const selected = PATTERNS.filter((pattern) => patternSelections[pattern.type]);
    if (selected.length === 0) {
      toast.error("Select at least one pattern.");
      return;
    }
    const boxes: RedactionBox[] = [];
    const counts: Record<PatternType, number> = {
      email: 0,
      phone: 0,
      ssn: 0,
      creditcard: 0,
      ipaddress: 0,
      date: 0,
    };
    const seen = new Set<string>();

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      const items = await getTextItemsForPage(pageIndex);
      if (items.length === 0) continue;
      const joined = items.map((item) => item.text).join(" ");
      const ranges = items.reduce<{ start: number; end: number }[]>((acc, item, idx) => {
        const start = idx === 0 ? 0 : acc[idx - 1].end + 1;
        acc.push({ start, end: start + item.text.length });
        return acc;
      }, []);

      selected.forEach((pattern) => {
        const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
        let match: RegExpExecArray | null;
        while ((match = regex.exec(joined))) {
          const matchStart = match.index;
          const matchEnd = matchStart + match[0].length;
          ranges.forEach((range, idx) => {
            if (range.start < matchEnd && range.end > matchStart) {
              const item = items[idx];
              const key = `${pattern.type}-${pageIndex}-${item.xPct}-${item.yPct}-${item.wPct}-${item.hPct}`;
              if (seen.has(key)) return;
              seen.add(key);
              boxes.push({
                id: crypto.randomUUID(),
                pageIndex,
                xPct: item.xPct,
                yPct: item.yPct,
                wPct: item.wPct,
                hPct: item.hPct,
                source: "pattern",
                label: pattern.type,
              });
              counts[pattern.type] += 1;
            }
          });
        }
      });
    }

    if (boxes.length === 0) {
      setPatternSummary(null);
      setPendingHighlights([]);
      toast.info("No patterns found.");
      return;
    }
    setPatternSummary({ boxes, counts });
    setPendingHighlights(boxes);
  }, [getTextItemsForPage, pageCount, patternSelections, proxyRef]);

  const confirmPatterns = useCallback(() => {
    if (!patternSummary) return;
    const next = [...redactions, ...patternSummary.boxes];
    setRedactionsWithHistory(next);
    setPatternSummary(null);
    setPendingHighlights([]);
  }, [patternSummary, redactions, setRedactionsWithHistory]);

  const cancelPatterns = useCallback(() => {
    setPatternSummary(null);
    setPendingHighlights([]);
  }, []);

  const removeBox = useCallback(
    (id: string) => {
      const next = redactions.filter((box) => box.id !== id);
      setRedactionsWithHistory(next);
    },
    [redactions, setRedactionsWithHistory],
  );

  const clearAll = useCallback(() => {
    if (redactions.length === 0) return;
    if (!window.confirm("Remove all redactions?")) return;
    setRedactionsWithHistory([]);
    toast.info(`${redactions.length} redactions marked for removal.`);
  }, [redactions, setRedactionsWithHistory]);

  const undoLast = useCallback(() => {
    const history = historyRef.current;
    if (history.length === 0) return;
    const previous = history.pop();
    if (!previous) return;
    setRedactions(previous);
    toast.info("Redaction removed");
  }, []);

  const removeLast = useCallback(() => {
    if (redactions.length === 0) return;
    const next = redactions.slice(0, -1);
    setRedactionsWithHistory(next);
    toast.info("Redaction removed");
  }, [redactions, setRedactionsWithHistory]);

  const highlightBox = useCallback((id: string) => {
    setHighlightedBoxId(id);
    setTimeout(() => setHighlightedBoxId(null), 1200);
  }, []);

  const jumpToBox = useCallback(
    (box: RedactionBox) => {
      setCurrentPage(box.pageIndex);
      highlightBox(box.id);
    },
    [highlightBox],
  );

  const getBoxPixels = useCallback(
    (box: RedactionBox, canvas: HTMLCanvasElement) => {
      const x = box.xPct * canvas.width;
      const y = box.yPct * canvas.height;
      const w = box.wPct * canvas.width;
      const h = box.hPct * canvas.height;
      return { x, y, w, h };
    },
    [],
  );

  const drawOverlay = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);

    const drawBox = (box: RedactionBox, isHighlight = false) => {
      const { x, y, w, h } = getBoxPixels(box, canvas);
      if (isHighlight) {
        context.fillStyle = "rgba(250, 204, 21, 0.35)";
        context.fillRect(x, y, w, h);
        context.strokeStyle = "rgba(250, 204, 21, 0.9)";
        context.lineWidth = 1.5;
        context.strokeRect(x, y, w, h);
        return;
      }
      context.fillStyle = redactionStyle === "black" ? "#000000" : "#FFFFFF";
      context.fillRect(x, y, w, h);
      if (redactionStyle === "white") {
        context.strokeStyle = "#9CA3AF";
        context.lineWidth = 1;
        context.strokeRect(x, y, w, h);
      }
      if (showLabel) {
        context.fillStyle = redactionStyle === "black" ? "#FFFFFF" : "#6B7280";
        context.font = `${Math.max(8, h * 0.3)}px sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText("REDACTED", x + w / 2, y + h / 2);
      }
      if (box.id === highlightedBoxId) {
        context.strokeStyle = "rgba(59, 59, 255, 0.9)";
        context.lineWidth = 2;
        context.strokeRect(x - 1, y - 1, w + 2, h + 2);
      }
    };

    currentPageBoxes.forEach((box) => drawBox(box));
    pendingHighlights
      .filter((box) => box.pageIndex === currentPage)
      .forEach((box) => drawBox(box, true));

    if (dragRect) {
      const left = Math.min(dragRect.startX, dragRect.endX);
      const top = Math.min(dragRect.startY, dragRect.endY);
      const width = Math.abs(dragRect.endX - dragRect.startX);
      const height = Math.abs(dragRect.endY - dragRect.startY);
      context.setLineDash([6, 3]);
      context.strokeStyle = "#3B3BFF";
      context.lineWidth = 2;
      context.strokeRect(left, top, width, height);
      context.fillStyle = "rgba(59, 59, 255, 0.1)";
      context.fillRect(left, top, width, height);
      context.setLineDash([]);
    }
  }, [currentPage, currentPageBoxes, dragRect, getBoxPixels, highlightedBoxId, pendingHighlights, redactionStyle, showLabel]);

  const findBoxAtPoint = useCallback(
    (x: number, y: number) => {
      const canvas = overlayCanvasRef.current;
      if (!canvas) return null;
      for (const box of currentPageBoxes) {
        const rect = getBoxPixels(box, canvas);
        if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) {
          return { box, rect };
        }
      }
      return null;
    },
    [currentPageBoxes, getBoxPixels],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = overlayCanvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const hit = findBoxAtPoint(x, y);
      if (hit) {
        setTooltip({ x: hit.rect.x + hit.rect.w, y: hit.rect.y, label: "Click × to remove this redaction" });
        setTimeout(() => setTooltip(null), 1500);
        highlightBox(hit.box.id);
        return;
      }
      setTooltip(null);
      setDragRect({ startX: x, startY: y, endX: x, endY: y });
      canvas.setPointerCapture(event.pointerId);
    },
    [findBoxAtPoint, highlightBox],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = overlayCanvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      if (dragRect) {
        setDragRect((current) => (current ? { ...current, endX: x, endY: y } : null));
        return;
      }
      const hit = findBoxAtPoint(x, y);
      if (hit) {
        setHoveredBoxId(hit.box.id);
        setHoveredBoxRect(hit.rect);
      } else {
        setHoveredBoxId(null);
        setHoveredBoxRect(null);
      }
    },
    [dragRect, findBoxAtPoint],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!dragRect) return;
      const canvas = overlayCanvasRef.current;
      if (!canvas) return;
      const left = Math.min(dragRect.startX, dragRect.endX);
      const top = Math.min(dragRect.startY, dragRect.endY);
      const width = Math.abs(dragRect.endX - dragRect.startX);
      const height = Math.abs(dragRect.endY - dragRect.startY);
      setDragRect(null);
      canvas.releasePointerCapture(event.pointerId);
      if (width < MIN_DRAG_PX || height < MIN_DRAG_PX) return;
      const nextBox: RedactionBox = {
        id: crypto.randomUUID(),
        pageIndex: currentPage,
        xPct: left / canvas.width,
        yPct: top / canvas.height,
        wPct: width / canvas.width,
        hPct: height / canvas.height,
        source: "manual",
      };
      setRedactionsWithHistory([...redactions, nextBox]);
    },
    [currentPage, dragRect, redactions, setRedactionsWithHistory],
  );

  const cancelDrag = useCallback(() => {
    setDragRect(null);
  }, []);

  const renderPreview = useCallback(async () => {
    const proxy = proxyRef.current;
    if (!proxy || !previewCanvasRef.current || !containerRef.current) return;
    const taskId = ++renderTaskRef.current;
    setIsRendering(true);
    const page = await proxy.getPage(currentPage + 1);
    const viewport = page.getViewport({ scale: 1 });
    const containerWidth = Math.max(320, containerRef.current.clientWidth);
    const scale = containerWidth / viewport.width;
    const scaled = page.getViewport({ scale });
    if (taskId !== renderTaskRef.current) return;
    const canvas = previewCanvasRef.current;
    const overlay = overlayCanvasRef.current;
    const context = canvas.getContext("2d");
    if (!context) return;
    canvas.width = Math.ceil(scaled.width);
    canvas.height = Math.ceil(scaled.height);
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport: scaled }).promise;
    if (taskId !== renderTaskRef.current) return;
    if (overlay) {
      overlay.width = canvas.width;
      overlay.height = canvas.height;
    }
    drawOverlay();
    setIsRendering(false);
  }, [currentPage, drawOverlay, proxyRef]);

  const ensureThumbnail = useCallback(
    async (pageIndex: number) => {
      const proxy = proxyRef.current;
      if (!proxy) return;
      if (thumbnailsRef.current[pageIndex]) return;
      const page = await proxy.getPage(pageIndex + 1);
      if (thumbnailsRef.current[pageIndex]) return;
      const viewport = page.getViewport({ scale: 0.2 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) return;
      context.fillStyle = "#FFFFFF";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport }).promise;
      const url = canvas.toDataURL("image/jpeg", 0.8);
      canvas.width = 0;
      canvas.height = 0;
      updateThumbnails({ ...thumbnailsRef.current, [pageIndex]: url });
    },
    [proxyRef, updateThumbnails],
  );

  const downloadResult = useCallback(() => {
    if (!resultBytes || !file) return;
    const buffer = resultBytes.buffer.slice(resultBytes.byteOffset, resultBytes.byteOffset + resultBytes.byteLength) as ArrayBuffer;
    const blob = new Blob([buffer], { type: "application/pdf" });
    const filename = resultName || `redacted-${file.name.replace(/\.pdf$/i, "")}.pdf`;
    downloadBlob(blob, filename);
    addFile({
      filename,
      size: resultBytes.byteLength,
      timestamp: Date.now(),
      tool: "redact",
    });
  }, [addFile, file, resultBytes, resultName]);

  const applyRedactions = useCallback(async () => {
    if (!file || !proxyRef.current) return;
    try {
      setStep("processing");
      toast.info("Applying redactions permanently...");
      setProgress(0);
      setProcessingPage(0);
      const { PDFDocument } = await import("pdf-lib");
      const originalArrayBuffer = await file.arrayBuffer();
      const srcDoc = await PDFDocument.load(originalArrayBuffer.slice(0));
      const newDoc = await PDFDocument.create();
      const statuses: Record<number, ProcessingStatus> = {};
      for (let i = 0; i < pageCount; i += 1) {
        statuses[i] = "waiting";
      }
      setProcessingStatuses(statuses);

      for (let i = 0; i < pageCount; i += 1) {
        setProcessingPage(i + 1);
        const pageRedactionList = pageRedactions.get(i) ?? [];
        if (pageRedactionList.length === 0) {
          setProcessingStatuses((prev) => ({ ...prev, [i]: "copying" }));
          const [copiedPage] = await newDoc.copyPages(srcDoc, [i]);
          newDoc.addPage(copiedPage);
          setProcessingStatuses((prev) => ({ ...prev, [i]: "copied" }));
        } else {
          setProcessingStatuses((prev) => ({ ...prev, [i]: "redacting" }));
          const pdfJsPage = await proxyRef.current!.getPage(i + 1);
          const viewport = pdfJsPage.getViewport({ scale: 2.0 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas unavailable");
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await pdfJsPage.render({ canvasContext: ctx, viewport }).promise;

          for (const box of pageRedactionList) {
            const px = box.xPct * canvas.width;
            const py = box.yPct * canvas.height;
            const pw = box.wPct * canvas.width;
            const ph = box.hPct * canvas.height;
            ctx.fillStyle = redactionStyle === "black" ? "#000000" : "#FFFFFF";
            ctx.fillRect(px, py, pw, ph);
            if (showLabel) {
              ctx.fillStyle = redactionStyle === "black" ? "#FFFFFF" : "#6B7280";
              ctx.font = `bold ${Math.max(10, ph * 0.25)}px sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText("REDACTED", px + pw / 2, py + ph / 2);
            }
          }

          const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.92);
          const jpegBytes = Uint8Array.from(atob(jpegDataUrl.split(",")[1]), (c) => c.charCodeAt(0));
          const jpgImage = await newDoc.embedJpg(jpegBytes);
          const origPage = srcDoc.getPage(i);
          const { width: pdfW, height: pdfH } = origPage.getSize();
          const newPage = newDoc.addPage([pdfW, pdfH]);
          newPage.drawImage(jpgImage, { x: 0, y: 0, width: pdfW, height: pdfH });
          canvas.width = 0;
          canvas.height = 0;
          setProcessingStatuses((prev) => ({ ...prev, [i]: "redacted" }));
        }
        setProgress(Math.round(((i + 1) / pageCount) * 100));
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      const redactedBytes = await newDoc.save();
      setResultBytes(redactedBytes);
      setResultName(`redacted-${file.name.replace(/\.pdf$/i, "")}.pdf`);
      setStep("done");
      toast.success("Done! Redacted PDF ready to download.");
    } catch (error) {
      console.error(error);
      toast.error("Something went wrong. Please try again.");
      setStep("review");
    }
  }, [file, pageCount, pageRedactions, proxyRef, redactionStyle, showLabel]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 1024px)");
    const update = () => setIsMobile(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  // Drive pageCount from the hook's numPages.
  useEffect(() => {
    if (numPages > 0) {
      setPageCount(numPages);
      toast.success("PDF loaded. Start drawing redaction boxes.");
    }
  }, [numPages]);

  // Show error toast from hook.
  useEffect(() => {
    if (!loadError) return;
    toast.error("Something went wrong loading the PDF. Please try again.");
  }, [loadError]);

  useEffect(() => {
    if (numPages === 0 || step !== "editor") return;
    let cancelled = false;
    const run = async () => {
      for (let i = 0; i < pageCount; i += 1) {
        if (cancelled) return;
        if (!thumbnailsRef.current[i]) {
          await ensureThumbnail(i);
          await new Promise((resolve) => setTimeout(resolve, 12));
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [ensureThumbnail, pageCount, numPages, step]);

  useEffect(() => {
    if (numPages === 0 || step !== "editor") return;
    const observer = new ResizeObserver(() => {
      void renderPreview();
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [numPages, renderPreview, step]);

  useEffect(() => {
    if (step === "editor") void renderPreview();
  }, [renderPreview, step, currentPage, numPages]);

  useEffect(() => {
    if (step === "editor") drawOverlay();
  }, [drawOverlay, step, currentPageBoxes, pendingHighlights, redactionStyle, showLabel, dragRect, highlightedBoxId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
      if (event.key.toLowerCase() === "u") {
        event.preventDefault();
        open();
      }
      if (event.key.toLowerCase() === "d" && step === "done") {
        event.preventDefault();
        downloadResult();
      }
      if (event.key === "Escape" && dragRect) {
        event.preventDefault();
        cancelDrag();
      }
      if ((event.key === "Delete" || event.key === "Backspace") && step === "editor") {
        event.preventDefault();
        removeLast();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && step === "editor") {
        event.preventDefault();
        undoLast();
      }
      if (event.key === "ArrowLeft" && step === "editor") {
        event.preventDefault();
        setCurrentPage((prev) => Math.max(0, prev - 1));
      }
      if (event.key === "ArrowRight" && step === "editor") {
        event.preventDefault();
        setCurrentPage((prev) => Math.min(pageCount - 1, prev + 1));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cancelDrag, downloadResult, dragRect, open, pageCount, removeLast, step, undoLast]);

  const reviewPages = useMemo(() => {
    const pages = Array.from(pageRedactions.keys()).sort((a, b) => a - b);
    return pages;
  }, [pageRedactions]);

  const patternTotal = useMemo(() => {
    if (!patternSummary) return 0;
    return Object.values(patternSummary.counts).reduce((sum, count) => sum + count, 0);
  }, [patternSummary]);

  const pageStrip = useMemo(() => {
    return Array.from({ length: pageCount }, (_, index) => ({
      pageIndex: index,
      url: thumbnails[index],
      hasRedactions: pageRedactions.has(index),
    }));
  }, [pageCount, pageRedactions, thumbnails]);

  const renderProcessingRow = (pageIndex: number, status: ProcessingStatus) => {
    const isRedacted = status === "redacting" || status === "redacted";
    return (
      <div key={pageIndex} className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-2 text-sm">
        <span className="font-semibold">Page {pageIndex + 1}</span>
        <span className="flex items-center gap-2 text-muted">
          {status === "copying" && <Copy className="h-4 w-4 text-muted" aria-hidden />}
          {status === "copied" && <Copy className="h-4 w-4 text-muted" aria-hidden />}
          {status === "redacting" && <Loader2 className="h-4 w-4 animate-spin text-red-500" aria-hidden />}
          {status === "redacted" && <CheckCircle className="h-4 w-4 text-green-500" aria-hidden />}
          {status === "failed" && <X className="h-4 w-4 text-red-500" aria-hidden />}
          <span className={isRedacted ? "text-foreground" : "text-muted"}>{statusLabel(status)}</span>
        </span>
      </div>
    );
  };

  const toolsPanel = (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Tools</h2>
        <button type="button" onClick={resetAll} aria-label="Upload a new file" className="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-foreground">
          <Upload className="h-4 w-4" /> Upload new
        </button>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <button type="button" onClick={() => { setDrawOpen((prev) => !prev); setActiveTool("draw"); }} aria-label="Toggle draw redaction section" className="flex w-full items-center justify-between px-4 py-3 text-left font-semibold">
          Draw redactions
          {drawOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {drawOpen && (
          <div className="space-y-4 border-t border-border px-4 py-4">
            <p className="text-sm text-muted">Click and drag on the page to draw a redaction box.</p>
            {activeTool === "draw" && <p className="text-sm font-semibold text-indigo-400">Draw mode active</p>}
            <div className="space-y-3">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted">Style</label>
              <div className="flex gap-3">
                <button type="button" onClick={() => setStyle("black")} aria-label="Use black redaction" className={`flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${redactionStyle === "black" ? "border-red-500 bg-red-500/10" : "border-border"}`}>
                  <span className="h-4 w-4 rounded bg-black" /> Black
                </button>
                <button type="button" onClick={() => setStyle("white")} aria-label="Use white redaction" className={`flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${redactionStyle === "white" ? "border-red-500 bg-red-500/10" : "border-border"}`}>
                  <span className="h-4 w-4 rounded border border-gray-400 bg-white" /> White
                </button>
              </div>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={showLabel} onChange={(e) => setShowLabel(e.target.checked)} aria-label="Toggle redacted label" className="accent-red-500" />
                Show REDACTED label
              </label>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card">
        <button type="button" onClick={() => { setSearchOpen((prev) => !prev); setActiveTool("search"); }} aria-label="Toggle search text section" className="flex w-full items-center justify-between px-4 py-3 text-left font-semibold">
          Search text
          {searchOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {searchOpen && (
          <div className="space-y-4 border-t border-border px-4 py-4">
            <label className="grid gap-2 text-sm font-semibold">
              Search for text to redact
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void runSearch();
                  }
                }}
                aria-label="Search for text to redact"
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={searchCaseSensitive} onChange={(e) => setSearchCaseSensitive(e.target.checked)} aria-label="Case sensitive search" className="accent-red-500" />
              Case sensitive
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={searchWholeWord} onChange={(e) => setSearchWholeWord(e.target.checked)} aria-label="Whole word search" className="accent-red-500" />
              Whole word only
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={searchScope === "all"} onChange={() => setSearchScope("all")} aria-label="Search all pages" className="accent-red-500" />
              Search all pages
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={searchScope === "current"} onChange={() => setSearchScope("current")} aria-label="Search current page" className="accent-red-500" />
              Search current page
            </label>
            <button type="button" onClick={() => void runSearch()} aria-label="Search and mark text" className="inline-flex items-center justify-center gap-2 rounded-md bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600">
              <Search className="h-4 w-4" /> Search &amp; Mark
            </button>
            {searchSummary && <p className="text-xs text-muted">{searchSummary}</p>}
            {pendingSearch && (
              <div className="rounded-lg border border-border bg-background p-3 text-sm">
                <p className="font-semibold">Mark {pendingSearch.total} instances for redaction?</p>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={confirmSearch} aria-label="Confirm search redactions" className="flex-1 rounded-md bg-red-500 px-3 py-2 text-sm font-semibold text-white">Confirm</button>
                  <button type="button" onClick={cancelSearch} aria-label="Cancel search redactions" className="flex-1 rounded-md border border-border px-3 py-2 text-sm font-semibold">Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card">
        <button type="button" onClick={() => { setPatternOpen((prev) => !prev); setActiveTool("pattern"); }} aria-label="Toggle pattern detection section" className="flex w-full items-center justify-between px-4 py-3 text-left font-semibold">
          Auto-detect patterns
          {patternOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {patternOpen && (
          <div className="space-y-4 border-t border-border px-4 py-4">
            <div className="space-y-3">
              {PATTERNS.map((pattern) => (
                <label key={pattern.type} className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={patternSelections[pattern.type]}
                    onChange={(e) => setPatternSelections((prev) => ({ ...prev, [pattern.type]: e.target.checked }))}
                    aria-label={`Detect ${pattern.label}`}
                    className="mt-1 accent-red-500"
                  />
                  <span className="flex-1">
                    <span className="flex items-center gap-2 font-semibold">
                      <Eraser className="h-4 w-4 text-red-500" aria-hidden /> {pattern.label}
                    </span>
                    <span className="text-xs text-muted">{pattern.example}</span>
                  </span>
                </label>
              ))}
            </div>
            <button type="button" onClick={() => void runPatternDetection()} aria-label="Detect selected patterns" className="inline-flex items-center justify-center gap-2 rounded-md bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600">
              Detect Selected Patterns
            </button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted">Redactions</h3>
          <span className="rounded-full bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-500">{totalRedactions}</span>
        </div>
        <p className="mt-1 text-xs text-muted">{totalRedactions} redactions across {pagesWithRedactions} pages</p>
        <div className="mt-4 max-h-[220px] space-y-4 overflow-y-auto pr-2">
          {Array.from(pageRedactions.entries()).map(([pageIndex, boxes]) => (
            <div key={pageIndex}>
              <p className="text-xs font-semibold text-muted">Page {pageIndex + 1} ({boxes.length} redactions)</p>
              <div className="mt-2 space-y-2">
                {boxes.map((box) => (
                  <button
                    key={box.id}
                    type="button"
                    onClick={() => jumpToBox(box)}
                    aria-label="Jump to redaction"
                    className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-left text-xs"
                  >
                    <span className="flex items-center gap-2">
                      <span className={`h-3 w-3 rounded ${redactionStyle === "black" ? "bg-black" : "border border-gray-300 bg-white"}`} />
                      <span className="text-muted">
                        {box.source === "manual" ? "Manual redaction" : box.source === "search" ? `Search: ${box.label}` : `Pattern: ${box.label}`}
                      </span>
                    </span>
                    <span
                      role="button"
                      aria-label="Remove redaction"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeBox(box.id);
                      }}
                      className="text-red-500"
                    >
                      ×
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {redactions.length === 0 && <p className="text-xs text-muted">No redactions yet.</p>}
        </div>
        <button type="button" onClick={clearAll} aria-label="Clear all redactions" className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-red-500 hover:text-red-600">
          <Trash2 className="h-3 w-3" /> Clear all
        </button>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted">Page navigation</h3>
        <div className="mt-3 flex items-center justify-between">
          <button type="button" onClick={() => setCurrentPage((prev) => Math.max(0, prev - 1))} aria-label="Previous page" className="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Prev Page
          </button>
          <span className="text-sm font-semibold">Page {currentPage + 1} of {pageCount}</span>
          <button type="button" onClick={() => setCurrentPage((prev) => Math.min(pageCount - 1, prev + 1))} aria-label="Next page" className="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-foreground">
            Next Page <ArrowRight className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 overflow-x-auto pb-2">
          <div className="flex gap-3">
            {pageStrip.map((page) => (
              <button
                key={page.pageIndex}
                type="button"
                onClick={() => setCurrentPage(page.pageIndex)}
                aria-label={`Go to page ${page.pageIndex + 1}`}
                className={`relative h-20 w-16 rounded-md border ${currentPage === page.pageIndex ? "border-red-500" : "border-border"}`}
              >
                {page.url ? (
                  <img src={page.url} alt={`Page ${page.pageIndex + 1}`} className="h-full w-full rounded-md object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-muted">{page.pageIndex + 1}</div>
                )}
                {page.hasRedactions && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted">Shortcuts</h3>
        <div className="mt-3 space-y-2 text-xs text-muted">
          <div className="flex items-center justify-between"><span>Upload new file</span><ShortcutHint shortcut="U" /></div>
          <div className="flex items-center justify-between"><span>Undo last redaction</span><ShortcutHint shortcut="Ctrl+Z" /></div>
          <div className="flex items-center justify-between"><span>Remove last redaction</span><ShortcutHint shortcut="Del" /></div>
          <div className="flex items-center justify-between"><span>Cancel drag</span><ShortcutHint shortcut="Esc" /></div>
          <div className="flex items-center justify-between"><span>Prev/Next page</span><ShortcutHint shortcut="←/→" /></div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          if (isMobile) setToolsOpen(false);
          setStep("review");
        }}
        aria-label="Review redactions"
        disabled={redactions.length === 0}
        className="w-full rounded-md bg-red-500 px-5 py-3 text-sm font-bold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Review Redactions →
      </button>
    </>
  );

  return (
    <AppShell>
      <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <Link href="/tools" aria-label="Back to all tools" className="mb-5 inline-flex text-sm font-semibold text-muted hover:text-foreground">
            &larr; Back to all tools
          </Link>
          <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 text-sm text-muted">
            <Link href="/" aria-label="Go to home page" className="hover:text-foreground">Home</Link>
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
            <Link href="/tools" aria-label="Go to tools page" className="hover:text-foreground">Tools</Link>
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
            <span className="font-semibold text-foreground">Redact PDF</span>
          </nav>

          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <div className="mb-6">
              <p className="text-sm font-bold uppercase tracking-[0.18em]" style={{ color: ACCENT }}>Privacy First</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Redact PDF</h1>
              <p className="mt-2 max-w-2xl text-muted">Permanently remove sensitive information. Pages with redactions are rebuilt as images so the original text cannot be recovered.</p>
            </div>

            {step === "upload" && (
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div {...getRootProps()} aria-label="Upload PDF dropzone" className={`cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition ${isDragActive ? "border-red-400 bg-red-500/10" : "border-border bg-background hover:border-red-400"}`}>
                  <input {...getInputProps({ "aria-label": "Upload PDF" })} />
                  <p className="text-xl font-bold">{isDragActive ? "Drop your PDF here" : "Drag & drop your PDF here"}</p>
                  <p className="mt-2 text-sm text-muted">PDF only, processed locally in your browser.</p>
                  <button type="button" onClick={open} aria-label="Browse for a PDF file" className="mt-6 inline-flex items-center justify-center gap-3 rounded-md bg-red-500 px-5 py-3 text-sm font-bold text-white hover:bg-red-600">
                    Browse PDF <ShortcutHint shortcut="U" />
                  </button>
                </div>
                <aside className="rounded-xl border border-border bg-background p-5">
                  <h2 className="text-lg font-bold">File</h2>
                  {file ? (
                    <div className="mt-4 space-y-3 text-sm">
                      <p className="break-all font-semibold">{file.name}</p>
                      <p className="text-muted">{pageCount} pages</p>
                      <p className="text-muted">{formatBytes(file.size)}</p>
                      <div className="rounded-lg border-l-4 border-red-500 bg-amber-500/10 p-3 text-sm font-semibold text-amber-700 dark:text-amber-300">
                        Redaction is permanent and cannot be undone after download. Review all redactions carefully before applying.
                      </div>
                      <button type="button" onClick={() => setStep("editor")} aria-label="Start redacting" className="w-full rounded-md bg-red-500 px-5 py-3 font-bold text-white hover:bg-red-600">
                        Start Redacting →
                      </button>
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-muted">Choose a PDF to begin.</p>
                  )}
                </aside>
              </div>
            )}

            {step === "editor" && file && (
              <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
                <aside className={`space-y-5 rounded-2xl border border-border bg-background p-5 ${isMobile ? "hidden" : "block"}`} aria-label="Redaction tools">
                  {toolsPanel}
                </aside>

                {isMobile && (
                  <button type="button" onClick={() => setToolsOpen(true)} aria-label="Open tools drawer" className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold">
                    Tools
                  </button>
                )}

                <div className="space-y-4">
                  <div ref={containerRef} className="relative mx-auto w-full max-w-4xl overflow-hidden rounded-2xl border border-border bg-white">
                    {isRendering && <div className="absolute inset-0 animate-pulse bg-muted/20" />}
                    <canvas ref={previewCanvasRef} className="block h-auto w-full" aria-label="PDF page preview" />
                    <canvas
                      ref={overlayCanvasRef}
                      className="absolute left-0 top-0 h-full w-full"
                      style={{ cursor: activeTool === "draw" ? "crosshair" : "default", touchAction: "none" }}
                      aria-label="Redaction overlay"
                      onPointerDown={handlePointerDown}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerLeave={() => setHoveredBoxId(null)}
                    />
                    {hoveredBoxId && hoveredBoxRect && (
                      <button
                        type="button"
                        aria-label="Remove this redaction"
                        onClick={() => removeBox(hoveredBoxId)}
                        className="absolute z-10 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white"
                        style={{ left: hoveredBoxRect.x + hoveredBoxRect.w - 12, top: hoveredBoxRect.y - 12 }}
                      >
                        ×
                      </button>
                    )}
                    {tooltip && (
                      <div
                        className="absolute z-10 rounded bg-black/80 px-2 py-1 text-xs text-white"
                        style={{ left: tooltip.x + 6, top: tooltip.y + 6 }}
                      >
                        {tooltip.label}
                      </div>
                    )}
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted">
                    <p className="font-semibold text-foreground">Page {currentPage + 1} preview</p>
                    <p className="mt-1">Draw boxes over sensitive text. Hover a box to remove it.</p>
                  </div>
                </div>

                {isMobile && toolsOpen && (
                  <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50">
                    <div className="max-h-[85vh] w-full rounded-t-3xl border border-border bg-background p-5">
                      <div className="mb-4 flex items-center justify-between">
                        <h2 className="text-lg font-bold">Tools</h2>
                        <button type="button" onClick={() => setToolsOpen(false)} aria-label="Close tools drawer" className="rounded-full border border-border p-2">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="space-y-4 overflow-y-auto pb-4">
                        {toolsPanel}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === "review" && file && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold">Review redactions</h2>
                    <p className="mt-1 text-sm text-muted">{totalRedactions} redactions across {pagesWithRedactions} pages</p>
                  </div>
                  <button type="button" onClick={() => setStep("editor")} aria-label="Back to editor" className="text-sm font-semibold text-muted hover:text-foreground">← Back to Editor</button>
                </div>
                <div className="space-y-4">
                  {reviewPages.map((pageIndex) => {
                    const boxes = pageRedactions.get(pageIndex) ?? [];
                    const sources = Array.from(new Set(boxes.map((box) => box.source)));
                    return (
                      <div key={pageIndex} className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4">
                        <div className="w-20">
                          {thumbnails[pageIndex] ? (
                            <img src={thumbnails[pageIndex]} alt={`Page ${pageIndex + 1}`} className="h-24 w-20 rounded-md object-cover" />
                          ) : (
                            <div className="flex h-24 w-20 items-center justify-center rounded-md bg-muted/20 text-xs text-muted">Page {pageIndex + 1}</div>
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold">Page {pageIndex + 1}</p>
                          <p className="text-xs text-muted">{boxes.length} redactions</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {sources.map((source) => (
                              <span key={source} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${source === "manual" ? "bg-blue-500/10 text-blue-400" : source === "search" ? "bg-green-500/10 text-green-400" : "bg-amber-500/10 text-amber-400"}`}>
                                {source}
                              </span>
                            ))}
                          </div>
                        </div>
                        <button type="button" onClick={() => { setCurrentPage(pageIndex); setStep("editor"); }} aria-label="Edit page" className="text-sm font-semibold text-muted hover:text-foreground">Edit page</button>
                      </div>
                    );
                  })}
                  {reviewPages.length === 0 && (
                    <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted">
                      No redactions yet. Go back and mark text first.
                    </div>
                  )}
                </div>
                <div className="rounded-xl border-l-4 border-red-500 bg-red-500/10 p-4 text-sm font-semibold text-red-200">
                  You are about to permanently apply {totalRedactions} redactions across {pagesWithRedactions} pages. This cannot be undone. The original file will not be modified — you will download a new redacted copy.
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button type="button" onClick={() => setStep("editor")} aria-label="Back to editor" className="rounded-md border border-border px-5 py-3 font-semibold">← Back to Editor</button>
                  <button type="button" onClick={() => void applyRedactions()} aria-label="Apply redactions permanently" className="rounded-md bg-red-500 px-5 py-3 font-bold text-white hover:bg-red-600">
                    Apply Redactions Permanently →
                  </button>
                </div>
              </div>
            )}

            {step === "processing" && (
              <div className="space-y-6">
                <div className="text-center">
                  <h2 className="text-xl font-bold">Processing page {processingPage} of {pageCount}...</h2>
                  <p className="mt-1 text-sm text-muted">This may take a moment for redacted pages.</p>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-muted/20">
                  <div className="h-full rounded-full bg-red-500 transition-all" style={{ width: `${progress}%` }} />
                </div>
                <div className="max-h-[260px] space-y-2 overflow-y-auto rounded-xl border border-border bg-background p-3">
                  {Object.entries(processingStatuses).map(([index, status]) => renderProcessingRow(Number(index), status))}
                </div>
              </div>
            )}

            {step === "done" && file && resultBytes && (
              <div className="mx-auto max-w-2xl py-8 text-center">
                <CheckCircle aria-hidden="true" className="mx-auto mb-5 h-14 w-14 text-red-500" />
                <h2 className="text-2xl font-black">{totalRedactions} redactions permanently applied</h2>
                <p className="mt-2 text-muted">Pages with redactions are stored as images. This may increase file size.</p>
                <SizeComparisonBadge originalSize={file.size} compressedSize={resultBytes.byteLength} />
                <p className="mt-4 rounded-lg bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-200">
                  Your original file was not modified. Only the downloaded file contains redactions.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                  <button type="button" onClick={downloadResult} aria-label="Download redacted PDF" className="inline-flex items-center justify-center gap-3 rounded-md bg-red-500 px-5 py-3 font-bold text-white hover:bg-red-600">
                    Download PDF <ShortcutHint shortcut="D" />
                  </button>
                  <button type="button" onClick={resetAll} aria-label="Redact another PDF" className="rounded-md border border-border px-5 py-3 font-bold">
                    Redact another PDF
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      {patternSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6">
            <h3 className="text-lg font-bold">Add detected patterns?</h3>
            <p className="mt-2 text-sm text-muted">Found {patternTotal} matches across selected patterns. Add all as redactions?</p>
            <div className="mt-4 space-y-2 text-sm text-muted">
              {PATTERNS.map((pattern) => (
                <div key={pattern.type} className="flex items-center justify-between">
                  <span>{pattern.label}</span>
                  <span className="font-semibold text-foreground">{patternSummary.counts[pattern.type]}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 flex gap-2">
              <button type="button" onClick={confirmPatterns} aria-label="Confirm pattern redactions" className="flex-1 rounded-md bg-red-500 px-4 py-2 text-sm font-semibold text-white">Add all</button>
              <button type="button" onClick={cancelPatterns} aria-label="Cancel pattern redactions" className="flex-1 rounded-md border border-border px-4 py-2 text-sm font-semibold">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
