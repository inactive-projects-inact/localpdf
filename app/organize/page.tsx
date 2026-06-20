"use client";

import Link from "next/link";
import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useCanvasRenderer } from "../hooks/useCanvasRenderer";
import {
  ArrowLeftRight,
  Check,
  ChevronRight,
  Copy,
  Download,
  FilePlus,
  GripVertical,
  Home,
  Redo2,
  RotateCcw,
  RotateCw,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import AppShell from "../components/AppShell";
import ShortcutHint from "../components/ShortcutHint";
import SizeComparisonBadge from "../components/SizeComparisonBadge";
import { useFileHistory } from "../components/FileHistoryProvider";
import { useProcessorWorker } from "../hooks/useProcessorWorker";
import { formatBytes } from "../lib/format-bytes";
import { getToolDefinition, hasPdfHeader } from "../lib/tool-registry";

type Rotation = 0 | 90 | 180 | 270;
type Zoom = "small" | "medium" | "large";

type PageEntry = {
  id: string;
  originalIndex: number | null;
  rotation: Rotation;
  isBlank: boolean;
  thumbnailUrl: string | null;
  isDuplicate?: boolean;
};

const TOOL = getToolDefinition("organize");
const ACCENT = "#3B82F6";
const HISTORY_LIMIT = 20;

function clonePages(pages: PageEntry[]) {
  return pages.map((page) => ({ ...page }));
}

function rotationAfter(rotation: Rotation, delta: 90 | -90): Rotation {
  return (((rotation + delta + 360) % 360) as Rotation);
}

function uniqueId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function gridClass(zoom: Zoom) {
  if (zoom === "small") return "grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8";
  if (zoom === "large") return "grid-cols-2 md:grid-cols-3 lg:grid-cols-4";
  return "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6";
}

function pageDownloadName(file: File) {
  return `organized-${file.name.replace(/\.pdf$/i, "")}.pdf`;
}

function bytesToBlob(bytes: Uint8Array) {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Blob([buffer], { type: "application/pdf" });
}

function reorderPages(pages: PageEntry[], activeId: string, overId: string, selectedIds: Set<string>) {
  const movingIds = selectedIds.has(activeId) ? selectedIds : new Set([activeId]);
  const moving = pages.filter((page) => movingIds.has(page.id));
  const remaining = pages.filter((page) => !movingIds.has(page.id));
  const overIndex = remaining.findIndex((page) => page.id === overId);
  if (overIndex === -1) {
    const activeIndex = pages.findIndex((page) => page.id === activeId);
    const targetIndex = pages.findIndex((page) => page.id === overId);
    if (activeIndex === -1 || targetIndex === -1) return pages;
    const next = [...pages];
    const [moved] = next.splice(activeIndex, 1);
    next.splice(targetIndex, 0, moved);
    return next;
  }
  return [...remaining.slice(0, overIndex), ...moving, ...remaining.slice(overIndex)];
}

function ThumbnailSkeleton() {
  return <div className="h-full w-full animate-pulse rounded bg-muted/20" />;
}

function PageCardPreview({ page, position, selectedCount }: { page: PageEntry; position: number; selectedCount?: number }) {
  return (
    <div className="relative rounded-lg border border-indigo-400 bg-card p-2 opacity-90 shadow-2xl">
      <div className="relative aspect-[3/4] overflow-hidden rounded bg-white dark:bg-gray-800">
        {page.isBlank ? (
          <div className="flex h-full items-center justify-center text-sm font-semibold text-gray-400">Blank</div>
        ) : page.thumbnailUrl ? (
          <img src={page.thumbnailUrl} alt="" className="h-full w-full object-contain" style={{ transform: `rotate(${page.rotation}deg)` }} />
        ) : (
          <ThumbnailSkeleton />
        )}
      </div>
      <div className="mt-2 text-center text-xs font-semibold text-foreground">
        {selectedCount && selectedCount > 1 ? `${selectedCount} pages` : `Page ${position}`}
      </div>
    </div>
  );
}

function SortablePageCard({
  page,
  position,
  isSelected,
  onSelect,
  onRenderRequest,
  onDelete,
  onDuplicate,
  onRotate,
}: {
  page: PageEntry;
  position: number;
  isSelected: boolean;
  onSelect: (event: React.MouseEvent) => void;
  onRenderRequest: (page: PageEntry) => (() => void) | undefined;
  onDelete: () => void;
  onDuplicate: () => void;
  onRotate: () => void;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const cancelRenderRef = useRef<(() => void) | undefined>(undefined);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition };

  useEffect(() => {
    const node = cardRef.current;
    if (!node || page.isBlank || page.thumbnailUrl) return () => {};
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          cancelRenderRef.current = onRenderRequest(page);
        } else {
          cancelRenderRef.current?.();
          cancelRenderRef.current = undefined;
        }
      },
      { rootMargin: "240px" },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelRenderRef.current?.();
      cancelRenderRef.current = undefined;
    };
  }, [onRenderRequest, page]);

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? "opacity-30" : ""}>
      <div
        ref={cardRef}
        onClick={onSelect}
        className={`group relative rounded-lg border bg-white p-2 shadow-sm transition dark:bg-gray-800 ${
          isSelected ? "border-indigo-500 ring-2 ring-indigo-500" : "border-border hover:border-indigo-300"
        }`}
      >
        <button
          type="button"
          aria-label="Drag page"
          className="absolute right-2 top-2 z-20 hidden rounded bg-background/90 p-1 text-muted shadow-sm group-hover:block"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {page.isDuplicate && (
          <span className="absolute left-2 top-2 z-10 rounded bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">Copy</span>
        )}
        {page.rotation !== 0 && (
          <span className="absolute right-2 top-9 z-10 rounded bg-background/90 px-2 py-0.5 text-[10px] font-bold text-foreground shadow">
            {page.rotation}°
          </span>
        )}

        <div className="relative aspect-[3/4] overflow-hidden rounded bg-gray-50 dark:bg-gray-900">
          {page.isBlank ? (
            <div className="flex h-full items-center justify-center bg-white text-sm font-semibold text-gray-400">Blank</div>
          ) : page.thumbnailUrl ? (
            <img
              src={page.thumbnailUrl}
              alt={`Page ${position}`}
              className="h-full w-full object-contain transition-transform"
              style={{ transform: `rotate(${page.rotation}deg)` }}
            />
          ) : (
            <ThumbnailSkeleton />
          )}
          {isSelected && (
            <div className="absolute inset-0 flex items-center justify-center bg-indigo-500/35">
              <div className="rounded-full bg-indigo-500 p-2 text-white">
                <Check className="h-5 w-5" />
              </div>
            </div>
          )}
        </div>

        <div className="absolute bottom-10 left-2 right-2 hidden justify-center gap-1 rounded bg-background/90 p-1 shadow group-hover:flex">
          <button type="button" aria-label="Delete page" onClick={(event) => { event.stopPropagation(); onDelete(); }} className="rounded p-1.5 text-red-500 hover:bg-red-500/10">
            <Trash2 className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Duplicate page" onClick={(event) => { event.stopPropagation(); onDuplicate(); }} className="rounded p-1.5 text-blue-500 hover:bg-blue-500/10">
            <Copy className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Rotate page" onClick={(event) => { event.stopPropagation(); onRotate(); }} className="rounded p-1.5 text-foreground hover:bg-muted/10">
            <RotateCw className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-2 flex justify-center">
          <span className="rounded-full bg-background px-3 py-1 text-xs font-bold text-foreground shadow-sm">{position}</span>
        </div>
      </div>
    </div>
  );
}

export default function OrganizePage() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pages, setPages] = useState<PageEntry[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);
  const [historyStack, setHistoryStack] = useState<PageEntry[][]>([]);
  const [redoStack, setRedoStack] = useState<PageEntry[][]>([]);
  const [historyLabels, setHistoryLabels] = useState<string[]>([]);
  const [redoLabels, setRedoLabels] = useState<string[]>([]);
  const [zoom, setZoom] = useState<Zoom>("medium");
  const [hintDismissed, setHintDismissed] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [outputSize, setOutputSize] = useState<number | null>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  
  const worker = useProcessorWorker();
  const lastHandledBlobRef = useRef<Blob | null>(null);

  const pdfBytesRef = useRef<Uint8Array | null>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const thumbnailCacheRef = useRef<Map<number, string>>(new Map());
  const openFileRef = useRef<(() => void) | null>(null);
  const thumbnailJobIdRef = useRef(0);
  // Tracks which requestIds are still wanted; cleared on cancel.
  const pendingRequestsRef = useRef<Set<string>>(new Set());
  const { addFile, pendingFiles, pendingTool, clearPendingFiles } = useFileHistory();

  const canvasRenderer = useCanvasRenderer({
    onResult: useCallback((result) => {
      const { requestId, pageIndex, url } = result;
      // pendingRequestsRef is still used to allow the cancel cleanup fn to remove IDs.
      if (!pendingRequestsRef.current.has(requestId)) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      pendingRequestsRef.current.delete(requestId);

      if (!url) {
        // OffscreenCanvas unavailable — fall back to main-thread render.
        void (async () => {
          const pdf = pdfDocRef.current;
          if (!pdf) return;
          try {
            const pdfPage = await pdf.getPage(pageIndex + 1);
            const viewport1 = pdfPage.getViewport({ scale: 1 });
            const scale = 150 / viewport1.width;
            const viewport = pdfPage.getViewport({ scale });
            const canvas = document.createElement("canvas");
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            ctx.fillStyle = "#FFFFFF";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await pdfPage.render({ canvasContext: ctx, viewport }).promise;
            pdfPage.cleanup();
            const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
            canvas.width = 0;
            canvas.height = 0;
            thumbnailCacheRef.current.set(pageIndex, dataUrl);
            setPages((current) =>
              current.map((page) =>
                page.originalIndex === pageIndex ? { ...page, thumbnailUrl: dataUrl } : page,
              ),
            );
          } catch {
            // Silently skip — not critical.
          }
        })();
        return;
      }

      thumbnailCacheRef.current.set(pageIndex, url);
      setPages((current) =>
        current.map((page) =>
          page.originalIndex === pageIndex ? { ...page, thumbnailUrl: url } : page,
        ),
      );
    }, []),
    onError: useCallback((requestId: string, _pageIndex: number, _reason: string) => {
      pendingRequestsRef.current.delete(requestId);
      // Errors (non-cancellation) are silently degraded — thumbnail stays as skeleton.
    }, []),
  });

  const selectedCount = selectedIds.size;
  const activePage = pages.find((page) => page.id === activeId) ?? null;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const pushHistory = useCallback((snapshot: PageEntry[], label: string) => {
    setHistoryStack((prev) => [...prev.slice(-(HISTORY_LIMIT - 1)), clonePages(snapshot)]);
    setHistoryLabels((prev) => [...prev.slice(-(HISTORY_LIMIT - 1)), label]);
    setRedoStack([]);
    setRedoLabels([]);
  }, []);

  const mutatePages = useCallback((label: string, updater: (current: PageEntry[]) => PageEntry[]) => {
    setPages((current) => {
      pushHistory(current, label);
      return updater(clonePages(current));
    });
  }, [pushHistory]);

  const requestThumbnailRender = useCallback((entry: PageEntry) => {
    if (entry.isBlank || entry.originalIndex === null || entry.thumbnailUrl) return undefined;
    const pageIndex = entry.originalIndex;
    const cached = thumbnailCacheRef.current.get(pageIndex);
    if (cached) {
      setPages((current) =>
        current.map((page) =>
          page.originalIndex === pageIndex ? { ...page, thumbnailUrl: cached } : page,
        ),
      );
      return undefined;
    }

    const bytes = pdfBytesRef.current;
    if (!bytes) return undefined;

    const requestId = `${thumbnailJobIdRef.current}-${pageIndex}-${entry.id}`;
    pendingRequestsRef.current.add(requestId);

    canvasRenderer.request({
      jobId: thumbnailJobIdRef.current,
      requestId,
      fileBytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      pageIndex,
      targetWidth: 150,
      extraRotation: 0,
    });

    return () => {
      pendingRequestsRef.current.delete(requestId);
    };
  }, [canvasRenderer]);

  const loadPdf = useCallback(async (incoming: File) => {
    setIsLoadingPdf(true);
    try {
      if (!(await hasPdfHeader(incoming))) {
        toast.error("Please choose a valid PDF file.");
        return;
      }

      // Cancel in-flight thumbnails from any previous file.
      canvasRenderer.cancel(thumbnailJobIdRef.current);
      // Bump jobId so stale results are discarded.
      thumbnailJobIdRef.current += 1;
      pendingRequestsRef.current.clear();

      const [{ PDFDocument }, { getDocument, GlobalWorkerOptions }] = await Promise.all([import("pdf-lib"), import("pdfjs-dist")]);
      GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const bytes = new Uint8Array(await incoming.arrayBuffer());
      const pdfLibDoc = await PDFDocument.load(bytes.slice(0), { ignoreEncryption: true });
      await pdfDocRef.current?.destroy?.();
      pdfDocRef.current = await getDocument({ data: bytes.slice(0) }).promise;
      pdfBytesRef.current = bytes;
      thumbnailCacheRef.current.clear();
      const nextPages: PageEntry[] = Array.from({ length: pdfLibDoc.getPageCount() }, (_, index) => ({
        id: `page-${index}`,
        originalIndex: index,
        rotation: 0,
        isBlank: false,
        thumbnailUrl: null,
      }));
      setFile(incoming);
      setPageCount(nextPages.length);
      setPages(nextPages);
      setSelectedIds(new Set());
      setHistoryStack([]);
      setRedoStack([]);
      setHistoryLabels([]);
      setRedoLabels([]);
      setOutputSize(null);
      toast.success("PDF loaded.");
      nextPages.slice(0, 10).forEach((page) => requestThumbnailRender(page));
    } catch {
      toast.error("Could not load this PDF.");
    } finally {
      setIsLoadingPdf(false);
    }
  }, [requestThumbnailRender, canvasRenderer]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const incoming = acceptedFiles[0];
    if (incoming) void loadPdf(incoming);
  }, [loadPdf]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: TOOL.input.accept,
    multiple: false,
    maxFiles: 1,
    maxSize: TOOL.input.maxSizeBytes,
    noClick: true,
    noKeyboard: true,
    onDropRejected: () => toast.error("Please choose a valid PDF file."),
  });
  openFileRef.current = open;

  useEffect(() => {
    if (pendingFiles.length > 0 && (!pendingTool || pendingTool === "organize")) {
      const [incoming] = pendingFiles;
      if (incoming) void loadPdf(incoming);
      clearPendingFiles();
    }
    return () => {};
  }, [clearPendingFiles, loadPdf, pendingFiles, pendingTool]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setLastClickedIndex(null);
  }, []);

  const selectPage = useCallback((event: React.MouseEvent, id: string) => {
    const index = pages.findIndex((page) => page.id === id);
    if (index === -1) return;
    if (event.shiftKey && lastClickedIndex !== null) {
      const [start, end] = [Math.min(lastClickedIndex, index), Math.max(lastClickedIndex, index)];
      setSelectedIds(new Set(pages.slice(start, end + 1).map((page) => page.id)));
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      setSelectedIds((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      setLastClickedIndex(index);
      return;
    }
    setSelectedIds(new Set([id]));
    setLastClickedIndex(index);
  }, [lastClickedIndex, pages]);

  const deleteSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    mutatePages("Delete selected", (current) => current.filter((page) => !selectedIds.has(page.id)));
    clearSelection();
    toast.success(`Deleted ${count} page(s).`);
  }, [clearSelection, mutatePages, selectedIds]);

  const duplicateSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    mutatePages("Duplicate selected", (current) => {
      const next: PageEntry[] = [];
      current.forEach((page) => {
        next.push(page);
        if (selectedIds.has(page.id)) {
          next.push({ ...page, id: uniqueId("copy"), isDuplicate: true });
        }
      });
      return next;
    });
    toast.success(`Duplicated ${count} page(s).`);
  }, [mutatePages, selectedIds]);

  const rotateSelected = useCallback((direction: 90 | -90) => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    mutatePages(direction === 90 ? "Rotate right" : "Rotate left", (current) => current.map((page) => {
      if (!selectedIds.has(page.id)) return page;
      return { ...page, rotation: rotationAfter(page.rotation, direction) };
    }));
    toast.success(`Rotated ${count} page(s).`);
  }, [mutatePages, selectedIds]);

  const insertBlankPage = useCallback(() => {
    mutatePages("Insert blank page", (current) => {
      const selectedIndexes = current.map((page, index) => (selectedIds.has(page.id) ? index : -1)).filter((index) => index >= 0);
      const insertIndex = selectedIndexes.length ? Math.max(...selectedIndexes) + 1 : current.length;
      const blank: PageEntry = { id: uniqueId("blank"), originalIndex: null, rotation: 0, isBlank: true, thumbnailUrl: null };
      return [...current.slice(0, insertIndex), blank, ...current.slice(insertIndex)];
    });
    toast.success("Blank page inserted.");
  }, [mutatePages, selectedIds]);

  const reverseAll = useCallback(() => {
    mutatePages("Reverse all", (current) => [...current].reverse());
    toast.success("All pages reversed.");
  }, [mutatePages]);

  const undo = useCallback(() => {
    setHistoryStack((history) => {
      if (history.length === 0) return history;
      const previous = history[history.length - 1];
      setPages((current) => {
        setRedoStack((redo) => [...redo, clonePages(current)]);
        return clonePages(previous);
      });
      setHistoryLabels((labels) => {
        const label = labels[labels.length - 1] ?? "last change";
        setRedoLabels((redo) => [...redo, label]);
        toast(`Undone: ${label}`);
        return labels.slice(0, -1);
      });
      clearSelection();
      return history.slice(0, -1);
    });
  }, [clearSelection]);

  const redo = useCallback(() => {
    setRedoStack((redoItems) => {
      if (redoItems.length === 0) return redoItems;
      const nextState = redoItems[redoItems.length - 1];
      setPages((current) => {
        setHistoryStack((history) => [...history.slice(-(HISTORY_LIMIT - 1)), clonePages(current)]);
        return clonePages(nextState);
      });
      setRedoLabels((labels) => {
        const label = labels[labels.length - 1] ?? "last change";
        setHistoryLabels((history) => [...history.slice(-(HISTORY_LIMIT - 1)), label]);
        toast.success(`Redone: ${label}`);
        return labels.slice(0, -1);
      });
      clearSelection();
      return redoItems.slice(0, -1);
    });
  }, [clearSelection]);

  const downloadPdf = useCallback(() => {
    if (!file) return;
    const filename = pageDownloadName(file);
    worker.process(file, {
      tool: "organize",
      options: { pages: pages.map(p => ({ originalIndex: p.originalIndex, rotation: p.rotation })) }
    }, filename);
  }, [file, pages, worker]);

  useEffect(() => {
    if (worker.status === "done" && worker.resultBlob && worker.resultFilename) {
      if (lastHandledBlobRef.current === worker.resultBlob) return;
      lastHandledBlobRef.current = worker.resultBlob;

      toast.success("Done! Your organized PDF is ready.", { id: "organize" });
      const url = URL.createObjectURL(worker.resultBlob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = worker.resultFilename;
      anchor.click();
      URL.revokeObjectURL(url);
      setOutputSize(worker.resultBlob.size);
      addFile({ filename: worker.resultFilename, size: worker.resultBlob.size, timestamp: Date.now(), tool: "organize" });
    } else if (worker.status === "error") {
      toast.error(worker.error || "Could not build the organized PDF.", { id: "organize" });
    }
  }, [worker.status, worker.resultBlob, worker.resultFilename, worker.error, addFile]);

  const onDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const onDragEnd = useCallback((event: DragEndEvent) => {
    const active = String(event.active.id);
    const over = event.over ? String(event.over.id) : null;
    setActiveId(null);
    if (!over || active === over) return;
    mutatePages("Reorder pages", (current) => reorderPages(current, active, over, selectedIds));
    toast.success("Pages reordered.");
  }, [mutatePages, selectedIds]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      const key = event.key.toLowerCase();
      if (key === "u") {
        event.preventDefault();
        openFileRef.current?.();
      } else if (key === "d") {
        event.preventDefault();
        void downloadPdf();
      } else if ((event.key === "Delete" || event.key === "Backspace") && selectedIds.size > 0) {
        event.preventDefault();
        deleteSelected();
      } else if ((event.ctrlKey || event.metaKey) && key === "a" && pages.length > 0) {
        event.preventDefault();
        setSelectedIds(new Set(pages.map((page) => page.id)));
      } else if ((event.ctrlKey || event.metaKey) && key === "z" && event.shiftKey) {
        event.preventDefault();
        redo();
      } else if ((event.ctrlKey || event.metaKey) && key === "z") {
        event.preventDefault();
        undo();
      } else if ((event.ctrlKey || event.metaKey) && key === "y") {
        event.preventDefault();
        redo();
      } else if (event.key === "Escape") {
        event.preventDefault();
        clearSelection();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clearSelection, deleteSelected, downloadPdf, pages, redo, selectedIds.size, undo]);

  // Worker lifecycle and URL cleanup are fully managed by useCanvasRenderer.
  // pdfDocRef still needs explicit cleanup on unmount.
  useEffect(() => {
    return () => {
      pendingRequestsRef.current.clear();
      void pdfDocRef.current?.cleanup?.();
      void pdfDocRef.current?.destroy?.();
    };
  }, []);

  const selectedOverlayCount = useMemo(() => activeId && selectedIds.has(activeId) ? selectedIds.size : 1, [activeId, selectedIds]);

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-7">
          <nav className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
            <Link href="/" className="inline-flex items-center gap-1 hover:text-foreground">
              <Home className="h-3.5 w-3.5" /> Home
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <Link href="/tools" className="hover:text-foreground">Tools</Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="font-medium text-foreground">Organize PDF</span>
          </nav>
          <Link href="/tools" className="mt-3 inline-flex text-sm font-semibold text-muted hover:text-foreground">
            ← Back to all tools
          </Link>
        </div>

        {!file && (
          <section>
            <div
              {...getRootProps()}
              className={`rounded-lg border-2 border-dashed bg-card px-5 py-10 text-center transition sm:py-14 ${
                isDragActive ? "border-blue-500 bg-blue-500/10" : "border-border hover:border-blue-500/70"
              }`}
            >
              <input {...getInputProps()} aria-label="Upload PDF to organize" />
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg text-white" style={{ backgroundColor: ACCENT }}>
                <Upload className="h-7 w-7" />
              </div>
              <p className="mt-4 text-base font-semibold text-foreground">{isDragActive ? "Drop your PDF here" : "Drag & drop a PDF file"}</p>
              <p className="mt-1 text-sm text-muted">Reorder, rotate, duplicate, and delete pages locally.</p>
              <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <button type="button" onClick={open} className="inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90" style={{ backgroundColor: ACCENT }}>
                  <Upload className="h-4 w-4" /> Browse PDF
                </button>
                <ShortcutHint shortcut="U" label="Press" />
              </div>
            </div>
            {isLoadingPdf && (
              <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
                {Array.from({ length: 10 }).map((_, index) => (
                  <div key={index} className="aspect-[3/4] rounded-lg border border-border bg-card p-2">
                    <ThumbnailSkeleton />
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {file && (
          <section>
            <div className="sticky top-0 z-40 -mx-4 border-y border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
              <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{file.name}</p>
                  <p className="mt-1 text-xs text-muted">{pageCount} pages · {formatBytes(file.size)}</p>
                  <span className="mt-2 inline-flex rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-bold text-blue-500">
                    {selectedCount} selected / {pages.length} total pages
                  </span>
                </div>

                <div className="flex gap-2 overflow-x-auto pb-1">
                  <ToolbarButton icon={<Trash2 className="h-4 w-4" />} label="Delete Selected" disabled={selectedCount === 0} onClick={deleteSelected} className="text-red-500 disabled:text-muted" />
                  <ToolbarButton icon={<Copy className="h-4 w-4" />} label="Duplicate Selected" disabled={selectedCount === 0} onClick={duplicateSelected} className="text-blue-500 disabled:text-muted" />
                  <ToolbarButton icon={<RotateCcw className="h-4 w-4" />} label="Rotate Left" disabled={selectedCount === 0} onClick={() => rotateSelected(-90)} />
                  <ToolbarButton icon={<RotateCw className="h-4 w-4" />} label="Rotate Right" disabled={selectedCount === 0} onClick={() => rotateSelected(90)} />
                  <ToolbarButton icon={<FilePlus className="h-4 w-4" />} label="Insert Blank Page" onClick={insertBlankPage} />
                  <ToolbarButton icon={<ArrowLeftRight className="h-4 w-4" />} label="Reverse All" onClick={reverseAll} />
                </div>

                <div className="flex gap-2 overflow-x-auto pb-1">
                  <ToolbarButton icon={<Undo2 className="h-4 w-4" />} label={`Undo ${historyStack.length}`} disabled={historyStack.length === 0} onClick={undo} />
                  <ToolbarButton icon={<Redo2 className="h-4 w-4" />} label="Redo" disabled={redoStack.length === 0} onClick={redo} />
                  {(["small", "medium", "large"] as Zoom[]).map((item) => (
                    <button key={item} type="button" onClick={() => setZoom(item)} className={`rounded-lg border px-3 py-2 text-xs font-semibold capitalize ${zoom === item ? "border-blue-500 bg-blue-500/10 text-blue-500" : "border-border text-foreground"}`}>
                      {item}
                    </button>
                  ))}
                  <button type="button" onClick={downloadPdf} disabled={worker.status === "processing"} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    <Download className="h-4 w-4" /> <span>{worker.status === "processing" ? `${worker.progress}%` : "Download PDF"}</span>
                  </button>
                  <ShortcutHint shortcut="D" label="Press" />
                </div>
              </div>
            </div>

            {!hintDismissed && (
              <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted">
                <span>Click to select · Shift+Click for range · Ctrl+Click to toggle · Drag to reorder</span>
                <button type="button" aria-label="Dismiss selection hint" onClick={() => setHintDismissed(true)} className="rounded p-1 text-muted hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {pages.length === 0 ? (
              <div className="mt-14 rounded-lg border border-border bg-card p-10 text-center">
                <p className="text-lg font-semibold text-foreground">No pages remaining. Insert a blank page or upload a new file.</p>
                <button type="button" onClick={insertBlankPage} className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-500 px-5 py-2.5 text-sm font-semibold text-white">
                  <FilePlus className="h-4 w-4" /> Insert blank page
                </button>
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
                <SortableContext items={pages.map((page) => page.id)} strategy={rectSortingStrategy}>
                  <div className={`mt-5 grid gap-4 ${gridClass(zoom)}`}>
                    {pages.map((page, index) => (
                      <SortablePageCard
                        key={page.id}
                        page={page}
                        position={index + 1}
                        isSelected={selectedIds.has(page.id)}
                        onSelect={(event) => selectPage(event, page.id)}
                        onRenderRequest={requestThumbnailRender}
                        onDelete={() => {
                          setSelectedIds(new Set([page.id]));
                          mutatePages("Delete page", (current) => current.filter((item) => item.id !== page.id));
                          toast.success("Deleted 1 page(s).");
                        }}
                        onDuplicate={() => {
                          mutatePages("Duplicate page", (current) => {
                            const pageIndex = current.findIndex((item) => item.id === page.id);
                            if (pageIndex === -1) return current;
                            const copy = { ...current[pageIndex], id: uniqueId("copy"), isDuplicate: true };
                            return [...current.slice(0, pageIndex + 1), copy, ...current.slice(pageIndex + 1)];
                          });
                          toast.success("Duplicated 1 page(s).");
                        }}
                        onRotate={() => {
                          mutatePages("Rotate page", (current) => current.map((item) => item.id === page.id ? { ...item, rotation: rotationAfter(item.rotation, 90) } : item));
                          toast.success("Rotated 1 page(s).");
                        }}
                      />
                    ))}
                  </div>
                </SortableContext>
                <DragOverlay>
                  {activePage ? <PageCardPreview page={activePage} position={pages.findIndex((page) => page.id === activePage.id) + 1} selectedCount={selectedOverlayCount} /> : null}
                </DragOverlay>
              </DndContext>
            )}

            {outputSize !== null && <SizeComparisonBadge originalSize={file.size} compressedSize={outputSize} />}
          </section>
        )}
      </main>
    </AppShell>
  );
}

function ToolbarButton({
  icon,
  label,
  disabled,
  onClick,
  className = "",
}: {
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
