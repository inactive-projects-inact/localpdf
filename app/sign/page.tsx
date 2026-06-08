"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { ChevronLeft, ChevronRight, RotateCw } from "lucide-react";
import { toast } from "sonner";
import AppShell from "../components/AppShell";
import ShortcutHint from "../components/ShortcutHint";
import SizeComparisonBadge from "../components/SizeComparisonBadge";
import { useFileHistory } from "../components/FileHistoryProvider";
import { usePdfDocProxy } from "../hooks/usePdfDocProxy";
import { downloadBlob } from "../lib/pdf-utils";
import { hasPdfHeader } from "../lib/tool-registry";

type SignatureMode = "draw" | "type" | "upload";
type Step = "upload" | "create" | "place" | "done";

type Placement = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  pageIndex: number;
  applyAll: boolean;
};

type Point = {
  x: number;
  y: number;
};

const ACCENT_COLOR = "#3B3BFF";
const SIGNATURE_WIDTH = 560;
const SIGNATURE_HEIGHT = 180;
const PAGE_SCALE = 1.5;
const COLORS = [
  { label: "Black", value: "#0F0F0F" },
  { label: "Navy", value: "#1e3a8a" },
  { label: "Dark Red", value: "#991b1b" },
] as const;
const THICKNESSES = [
  { label: "Thin", value: 1.5 },
  { label: "Medium", value: 2.5 },
  { label: "Thick", value: 4 },
] as const;
const FONTS = ["Dancing Script", "Pacifico", "Great Vibes", "Satisfy"] as const;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeRotation(angle: number): 0 | 90 | 180 | 270 {
  const normalized = ((angle % 360) + 360) % 360;
  if (normalized === 90 || normalized === 180 || normalized === 270) return normalized;
  return 0;
}

function getVisualPageSize(width: number, height: number, rotation: number): { width: number; height: number } {
  return rotation === 90 || rotation === 270 ? { width: height, height: width } : { width, height };
}

function mapVisualPointToPdf(x: number, y: number, pageWidth: number, pageHeight: number, rotation: number): Point {
  if (rotation === 90) return { x: pageWidth - y, y: x };
  if (rotation === 180) return { x: pageWidth - x, y: pageHeight - y };
  if (rotation === 270) return { x: y, y: pageHeight - x };
  return { x, y };
}

export default function SignPdfPage() {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [previewCanvasUrl, setPreviewCanvasUrl] = useState("");
  const [previewDims, setPreviewDims] = useState({ w: 0, h: 0 });
  const [signatureMode, setSignatureMode] = useState<SignatureMode>("draw");
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [placement, setPlacement] = useState<Placement>({
    x: 50,
    y: 50,
    width: 200,
    height: 58,
    rotation: 0,
    opacity: 1,
    pageIndex: 0,
    applyAll: false,
  });
  const [strokeColor, setStrokeColor] = useState("#0F0F0F");
  const [strokeWidth, setStrokeWidth] = useState(2.5);
  const [isDrawing, setIsDrawing] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [fontFamily, setFontFamily] = useState<(typeof FONTS)[number]>("Dancing Script");
  const [fontSize, setFontSize] = useState(48);
  const [signedSize, setSignedSize] = useState<number | null>(null);
  const [isSigning, setIsSigning] = useState(false);

  const { addFile } = useFileHistory();
  const { proxyRef, numPages, loadError, load, destroy } = usePdfDocProxy();
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const typeCanvasRef = useRef<HTMLCanvasElement>(null);
  const typeContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const uploadCanvasRef = useRef<HTMLCanvasElement>(null);
  const uploadContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const pointsRef = useRef<Point[]>([]);
  const overlayRef = useRef<HTMLDivElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const previewRenderIdRef = useRef(0);

  const setDrawCanvasRef = useCallback((node: HTMLCanvasElement | null) => {
    drawCanvasRef.current = node;
    drawContextRef.current = node?.getContext("2d") ?? null;
  }, []);

  const setTypeCanvasRef = useCallback((node: HTMLCanvasElement | null) => {
    typeCanvasRef.current = node;
    typeContextRef.current = node?.getContext("2d") ?? null;
    if (node) {
      const context = typeContextRef.current;
      if (context) {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, node.width, node.height);
      }
    }
  }, []);

  const setUploadCanvasRef = useCallback((node: HTMLCanvasElement | null) => {
    uploadCanvasRef.current = node;
    uploadContextRef.current = node?.getContext("2d", { willReadFrequently: true }) ?? null;
    if (node) {
      const context = uploadContextRef.current;
      if (context) {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, node.width, node.height);
      }
    }
  }, []);

  const renderPdfPage = useCallback(async (pageNum: number) => {
    const proxy = proxyRef.current;
    if (!proxy) return;
    const renderId = previewRenderIdRef.current + 1;
    previewRenderIdRef.current = renderId;
    const page = await proxy.getPage(pageNum);
    const viewport = page.getViewport({ scale: PAGE_SCALE });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return;

    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: context, viewport }).promise;
    if (proxyRef.current !== proxy || previewRenderIdRef.current !== renderId) return;
    setPreviewDims({ w: viewport.width, h: viewport.height });
    setPreviewCanvasUrl(canvas.toDataURL("image/png"));
  }, [proxyRef]);

  const clearCanvas = useCallback(() => {
    const canvas = drawCanvasRef.current;
    const context = drawContextRef.current;
    if (!canvas || !context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    pointsRef.current = [];
  }, []);

  const redrawSpline = useCallback(
    (pts: Point[]) => {
      const canvas = drawCanvasRef.current;
      const ctx = drawContextRef.current;
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.beginPath();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
      if (pts.length < 3) {
        if (pts.length > 0) ctx.moveTo(pts[0].x, pts[0].y);
        if (pts.length === 2) ctx.lineTo(pts[1].x, pts[1].y);
        ctx.stroke();
        return;
      }
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = i > 0 ? pts[i - 1] : pts[0];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = i !== pts.length - 2 ? pts[i + 2] : p2;
        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
      }
      ctx.stroke();
    },
    [strokeColor, strokeWidth],
  );

  const drawTypedSignature = useCallback(() => {
    const canvas = typeCanvasRef.current;
    const context = typeContextRef.current;
    if (!canvas || !context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = `${fontSize}px "${fontFamily}"`;
    context.fillStyle = strokeColor;
    context.textBaseline = "middle";
    context.textAlign = "center";
    context.fillText(typedName || "Preview", canvas.width / 2, canvas.height / 2);
  }, [fontFamily, fontSize, strokeColor, typedName]);

  const renderUploadedSignature = useCallback((image: HTMLImageElement) => {
    const sourceCanvas = document.createElement("canvas");
    const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
    const destinationCanvas = uploadCanvasRef.current;
    const destinationContext = uploadContextRef.current;
    if (!sourceContext || !destinationCanvas || !destinationContext) return;

    sourceCanvas.width = image.naturalWidth || image.width;
    sourceCanvas.height = image.naturalHeight || image.height;
    sourceContext.fillStyle = "#ffffff";
    sourceContext.fillRect(0, 0, sourceCanvas.width, sourceCanvas.height);
    sourceContext.drawImage(image, 0, 0);

    const pixels = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
    let minX = sourceCanvas.width;
    let minY = sourceCanvas.height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < sourceCanvas.height; y += 1) {
      for (let x = 0; x < sourceCanvas.width; x += 1) {
        const index = (y * sourceCanvas.width + x) * 4;
        const alpha = pixels.data[index + 3];
        const r = pixels.data[index];
        const g = pixels.data[index + 1];
        const b = pixels.data[index + 2];
        if (alpha > 10 && r + g + b < 750) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    const cropX = maxX >= minX ? minX : 0;
    const cropY = maxY >= minY ? minY : 0;
    const cropW = maxX >= minX ? maxX - minX + 1 : sourceCanvas.width;
    const cropH = maxY >= minY ? maxY - minY + 1 : sourceCanvas.height;
    const scale = Math.min((SIGNATURE_WIDTH - 48) / cropW, (SIGNATURE_HEIGHT - 32) / cropH);
    const drawW = cropW * scale;
    const drawH = cropH * scale;
    const drawX = (SIGNATURE_WIDTH - drawW) / 2;
    const drawY = (SIGNATURE_HEIGHT - drawH) / 2;

    destinationContext.clearRect(0, 0, SIGNATURE_WIDTH, SIGNATURE_HEIGHT);
    destinationContext.fillStyle = "#ffffff";
    destinationContext.fillRect(0, 0, SIGNATURE_WIDTH, SIGNATURE_HEIGHT);
    destinationContext.drawImage(sourceCanvas, cropX, cropY, cropW, cropH, drawX, drawY, drawW, drawH);
  }, []);

  const handlePdfDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const selectedFile = acceptedFiles[0];
      if (!selectedFile) return;

      try {
        if (!(await hasPdfHeader(selectedFile))) {
          toast.error("Please select a valid PDF file.");
          return;
        }
        setFile(selectedFile);
        setCurrentPage(1);
        setPlacement((current) => ({ ...current, pageIndex: 0 }));
        setPreviewCanvasUrl("");
        setPreviewDims({ w: 0, h: 0 });
        load(selectedFile);
      } catch (error) {
        console.error(error);
        toast.error("Something went wrong.");
      }
    },
    [load],
  );

  const handleSignatureImageDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const selectedFile = acceptedFiles[0];
      if (!selectedFile) return;

      const objectUrl = URL.createObjectURL(selectedFile);
      const image = new Image();
      image.onload = () => {
        renderUploadedSignature(image);
        URL.revokeObjectURL(objectUrl);
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        toast.error("Something went wrong.");
      };
      image.src = objectUrl;
    },
    [renderUploadedSignature],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: handlePdfDrop,
    accept: { "application/pdf": [".pdf"] },
    multiple: false,
    noClick: false,
    noKeyboard: true,
  });

  const {
    getRootProps: getSignatureRootProps,
    getInputProps: getSignatureInputProps,
    isDragActive: isSignatureDragActive,
    open: openSignaturePicker,
  } = useDropzone({
    onDrop: handleSignatureImageDrop,
    accept: {
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/svg+xml": [".svg"],
    },
    multiple: false,
    noClick: false,
    noKeyboard: true,
  });

  const goToCreateSignature = useCallback(() => {
    if (!file || numPages === 0) return;
    setStep("create");
  }, [file, numPages]);

  const navigatePage = useCallback(
    async (pageNum: number) => {
      if (!proxyRef.current) return;

      const next = clamp(pageNum, 1, numPages);
      setCurrentPage(next);
      setPlacement((current) => ({ ...current, pageIndex: next - 1 }));
      await renderPdfPage(next);
    },
    [numPages, proxyRef, renderPdfPage],
  );

  const handlePreviousPage = useCallback(() => {
    void navigatePage(currentPage - 1);
  }, [currentPage, navigatePage]);

  const handleNextPage = useCallback(() => {
    void navigatePage(currentPage + 1);
  }, [currentPage, navigatePage]);

  const handleStartDrawing = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = canvas.getBoundingClientRect();
    pointsRef.current = [{ x: event.clientX - rect.left, y: event.clientY - rect.top }];
    setIsDrawing(true);
  }, []);

  const handleDraw = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawing) return;
      const canvas = drawCanvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      pointsRef.current = [
        ...pointsRef.current,
        { x: event.clientX - rect.left, y: event.clientY - rect.top },
      ];
      redrawSpline(pointsRef.current);
    },
    [isDrawing, redrawSpline],
  );

  const handleStopDrawing = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsDrawing(false);
  }, []);

  const handleSetSignatureMode = useCallback((mode: SignatureMode) => {
    setSignatureMode(mode);
  }, []);

  const handleUseSignature = useCallback(() => {
    let canvas: HTMLCanvasElement | null = null;
    if (signatureMode === "draw") canvas = drawCanvasRef.current;
    if (signatureMode === "type") canvas = typeCanvasRef.current;
    if (signatureMode === "upload") canvas = uploadCanvasRef.current;
    if (!canvas) return;

    setSignatureDataUrl(canvas.toDataURL("image/png"));
    setStep("place");
  }, [signatureMode]);

  const handleTypedNameChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setTypedName(event.target.value);
  }, []);

  const handleFontFamilyChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    setFontFamily(event.target.value as (typeof FONTS)[number]);
  }, []);

  const handleFontSizeChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setFontSize(Number(event.target.value));
  }, []);

  const handleOpacityChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const opacity = Number(event.target.value);
    setPlacement((current) => ({ ...current, opacity }));
  }, []);

  const handleApplyAllChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const applyAll = event.target.checked;
    setPlacement((current) => ({ ...current, applyAll }));
  }, []);

  const handleChangeSignature = useCallback(() => {
    setStep("create");
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, action: "drag" | "resize" | "rotate", corner?: "tl" | "tr" | "bl" | "br") => {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);

      const startX = event.clientX;
      const startY = event.clientY;
      const startPlacement = { ...placement };
      const overlayRect = overlayRef.current?.getBoundingClientRect();
      const centerX = overlayRect ? overlayRect.left + overlayRect.width / 2 : startX;
      const centerY = overlayRect ? overlayRect.top + overlayRect.height / 2 : startY;
      const startAngle = Math.atan2(startY - centerY, startX - centerX) * (180 / Math.PI);

      const onMove = (moveEvent: PointerEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;

        if (action === "drag") {
          setPlacement((current) => ({
            ...current,
            x: clamp(startPlacement.x + dx, 0, Math.max(0, previewDims.w - startPlacement.width)),
            y: clamp(startPlacement.y + dy, 0, Math.max(0, previewDims.h - startPlacement.height)),
          }));
          return;
        }

        if (action === "resize") {
          const ratio = startPlacement.width / startPlacement.height;
          const horizontalDelta = corner?.includes("l") ? -dx : dx;
          const verticalDelta = corner?.includes("t") ? -dy : dy;
          const sizeDelta = Math.abs(horizontalDelta) > Math.abs(verticalDelta) ? horizontalDelta : verticalDelta * ratio;
          const nextWidth = clamp(startPlacement.width + sizeDelta, 50, previewDims.w);
          const nextHeight = nextWidth / ratio;
          const nextX = corner?.includes("l") ? startPlacement.x + (startPlacement.width - nextWidth) : startPlacement.x;
          const nextY = corner?.includes("t") ? startPlacement.y + (startPlacement.height - nextHeight) : startPlacement.y;
          setPlacement((current) => ({
            ...current,
            width: nextWidth,
            height: nextHeight,
            x: clamp(nextX, 0, Math.max(0, previewDims.w - nextWidth)),
            y: clamp(nextY, 0, Math.max(0, previewDims.h - nextHeight)),
          }));
          return;
        }

        const currentAngle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX) * (180 / Math.PI);
        setPlacement((current) => ({
          ...current,
          rotation: startPlacement.rotation + (currentAngle - startAngle),
        }));
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp, { once: true });
    },
    [placement, previewDims.h, previewDims.w],
  );

  const handleDragPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      handlePointerDown(event, "drag");
    },
    [handlePointerDown],
  );

  const handleRotatePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      handlePointerDown(event, "rotate");
    },
    [handlePointerDown],
  );

  const handleResizeTopLeft = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      handlePointerDown(event, "resize", "tl");
    },
    [handlePointerDown],
  );

  const handleResizeTopRight = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      handlePointerDown(event, "resize", "tr");
    },
    [handlePointerDown],
  );

  const handleResizeBottomLeft = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      handlePointerDown(event, "resize", "bl");
    },
    [handlePointerDown],
  );

  const handleResizeBottomRight = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      handlePointerDown(event, "resize", "br");
    },
    [handlePointerDown],
  );

  const handleDownload = useCallback(async () => {
    if (!file || !signatureDataUrl || previewDims.w === 0 || previewDims.h === 0 || isSigning) return;

    setIsSigning(true);
    toast.info("Placing signature...");
    try {
      const { PDFDocument, degrees } = await import("pdf-lib");
      const originalArrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(originalArrayBuffer);
      const pngImage = await pdfDoc.embedPng(signatureDataUrl);
      const allPages = pdfDoc.getPages();
      const pagesToSign = placement.applyAll ? allPages : [allPages[placement.pageIndex]];
      const placementRatio = {
        x: placement.x / previewDims.w,
        y: placement.y / previewDims.h,
        width: placement.width / previewDims.w,
        height: placement.height / previewDims.h,
      };

      for (const page of pagesToSign) {
        const { width: pageW, height: pageH } = page.getSize();
        const pageRotation = normalizeRotation(page.getRotation().angle);
        const visualSize = getVisualPageSize(pageW, pageH, pageRotation);
        const visualX = placementRatio.x * visualSize.width;
        const visualTopY = placementRatio.y * visualSize.height;
        const pdfW = placementRatio.width * visualSize.width;
        const sigH = placementRatio.height * visualSize.height;
        const visualBottomY = visualSize.height - visualTopY - sigH;
        const pdfPoint = mapVisualPointToPdf(visualX, visualBottomY, pageW, pageH, pageRotation);
        page.drawImage(pngImage, {
          x: pdfPoint.x,
          y: pdfPoint.y,
          width: pdfW,
          height: sigH,
          rotate: degrees(placement.rotation + pageRotation),
          opacity: placement.opacity,
        });
      }

      const bytes = await pdfDoc.save();
      const signedBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const blob = new Blob([signedBuffer], { type: "application/pdf" });
      downloadBlob(blob, `visual-stamp-${file.name}`);
      setSignedSize(bytes.byteLength);
      addFile({
        filename: `visual-stamp-${file.name}`,
        size: bytes.byteLength,
        timestamp: Date.now(),
        tool: "signature",
      });
      toast.success("Done! Visual signature stamp added.");
      setStep("done");
    } catch (error) {
      console.error(error);
      toast.error("Something went wrong.");
    } finally {
      setIsSigning(false);
    }
  }, [addFile, file, isSigning, placement, previewDims.h, previewDims.w, signatureDataUrl]);

  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=Dancing+Script&family=Great+Vibes&family=Pacifico&family=Satisfy&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);

    return () => {
      link.remove();
    };
  }, []);

  useEffect(() => {
    drawTypedSignature();
    return () => {};
  }, [drawTypedSignature]);

  useEffect(() => {
    if (!loadError) return;
    toast.error(
      loadError.reason === "encrypted" || loadError.reason === "unsupported-encryption"
        ? "This PDF is encrypted or unsupported by the browser PDF engine."
        : "Something went wrong.",
    );
  }, [loadError]);

  useEffect(() => {
    if (!file || numPages === 0) return;
    void renderPdfPage(currentPage);
  }, [currentPage, file, numPages, renderPdfPage]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "u") {
        event.preventDefault();
        if (step === "create" && signatureMode === "upload") {
          openSignaturePicker();
        } else {
          open();
        }
      }

      if (key === "c" && step === "create" && signatureMode === "draw") {
        event.preventDefault();
        clearCanvas();
      }

      if (key === "d" && (step === "place" || step === "done")) {
        event.preventDefault();
        void handleDownload();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [clearCanvas, handleDownload, open, openSignaturePicker, signatureMode, step]);

  return (
    <AppShell>
      <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <Link
            href="/tools"
            aria-label="Back to all tools"
            className="mb-5 inline-flex text-sm font-semibold text-muted transition hover:text-foreground"
          >
            &larr; Back to all tools
          </Link>

          <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted">
            <Link href="/" className="transition hover:text-foreground" aria-label="Go to home page">
              Home
            </Link>
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
            <Link href="/tools" className="transition hover:text-foreground" aria-label="Go to tools page">
              Tools
            </Link>
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
            <span className="font-semibold text-foreground">Sign PDF</span>
          </nav>

          <section className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-8">
            <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.18em]" style={{ color: ACCENT_COLOR }}>
                  100% private
                </p>
                <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Visual PDF Signature</h1>
                <p className="mt-2 max-w-2xl text-muted">
                  Draw, type, or upload your signature and place it on your PDF as a visual image stamp.
                </p>
              </div>
              <div className="flex gap-2 text-xs font-semibold text-muted">
                {(["upload", "create", "place", "done"] as Step[]).map((item, index) => (
                  <span
                    key={item}
                    className={`rounded-full px-3 py-1 capitalize ring-1 ring-inset ${
                      step === item ? "bg-primary text-white ring-primary" : "bg-muted/10 ring-border"
                    }`}
                  >
                    {index + 1}. {item}
                  </span>
                ))}
              </div>
            </div>

            {step === "upload" && (
              <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div>
                  <div
                    {...getRootProps()}
                    className={`flex min-h-[260px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition ${
                      isDragActive ? "border-primary bg-primary/5" : "border-border bg-background hover:border-primary"
                    }`}
                    aria-label="Upload PDF dropzone"
                  >
                    <input {...getInputProps({ "aria-label": "Upload PDF" })} />
                    <p className="text-xl font-bold">{isDragActive ? "Drop your PDF here" : "Drag & drop your PDF here"}</p>
                    <p className="mt-2 text-sm text-muted">PDF only, processed locally on your device.</p>
                    <button
                      type="button"
                      onClick={open}
                      aria-label="Browse for a PDF file"
                      className="mt-6 inline-flex items-center gap-3 rounded-md bg-primary px-5 py-3 text-sm font-bold text-white transition hover:opacity-90"
                    >
                      Browse PDF
                      <ShortcutHint shortcut="U" />
                    </button>
                  </div>

                  {previewCanvasUrl && (
                    <div className="mt-6">
                      <div className="overflow-auto rounded-lg border border-border bg-muted/10 p-4">
                        <img src={previewCanvasUrl} alt="PDF page preview" className="mx-auto h-auto max-h-[520px] w-auto shadow-sm" />
                      </div>
                      {numPages > 1 && (
                        <div className="mt-4 flex items-center gap-3">
                          <button
                            type="button"
                            onClick={handlePreviousPage}
                            disabled={currentPage === 1}
                            aria-label="Show previous PDF page"
                            className="rounded-md border border-border p-2 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
                            {Array.from({ length: numPages }, (_, index) => (
                              <button
                                key={index}
                                type="button"
                                onClick={() => void navigatePage(index + 1)}
                                aria-label={`Show PDF page ${index + 1}`}
                                className={`h-16 min-w-12 rounded-md border px-3 text-sm font-bold ${
                                  currentPage === index + 1 ? "border-primary bg-primary text-white" : "border-border bg-background"
                                }`}
                              >
                                {index + 1}
                              </button>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={handleNextPage}
                            disabled={currentPage === numPages}
                            aria-label="Show next PDF page"
                            className="rounded-md border border-border p-2 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <ChevronRight className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <aside className="rounded-lg border border-border bg-background p-5">
                  <h2 className="text-lg font-bold">File</h2>
                  {file ? (
                    <div className="mt-4 space-y-3 text-sm">
                      <p className="break-all font-semibold">{file.name}</p>
                      <p className="text-muted">{formatBytes(file.size)}</p>
                      <p className="text-muted">{numPages} page{numPages === 1 ? "" : "s"}</p>

                      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-amber-700 dark:text-amber-400">
                        <strong>Visual Stamp Only:</strong> This tool adds an image of your signature. It does <strong>not</strong> apply a cryptographic digital signature or legal certificate of authenticity.
                      </div>

                      <button
                        type="button"
                        onClick={goToCreateSignature}
                        aria-label="Create signature"
                        className="mt-4 w-full rounded-md bg-primary px-5 py-3 font-bold text-white transition hover:opacity-90"
                      >
                        Create Signature &rarr;
                      </button>
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-muted">Choose a PDF to begin.</p>
                  )}
                </aside>
              </div>
            )}

            {step === "create" && (
              <div>
                <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="text-2xl font-bold">Create Signature</h2>
                  <div className="flex rounded-lg bg-muted/10 p-1 ring-1 ring-border">
                    {(["draw", "type", "upload"] as SignatureMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => handleSetSignatureMode(mode)}
                        aria-label={`Use ${mode} signature tab`}
                        className={`rounded-md px-4 py-2 text-sm font-bold capitalize transition ${
                          signatureMode === mode ? "bg-primary text-white" : "text-muted hover:text-foreground"
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>

                {signatureMode === "draw" && (
                  <div className="flex flex-col items-center">
                    <canvas
                      ref={setDrawCanvasRef}
                      width={SIGNATURE_WIDTH}
                      height={SIGNATURE_HEIGHT}
                      aria-label="Draw signature canvas"
                      className="h-[180px] w-full max-w-[560px] touch-none rounded-lg border-2 border-dashed border-gray-300 bg-white"
                      onPointerDown={handleStartDrawing}
                      onPointerMove={handleDraw}
                      onPointerUp={handleStopDrawing}
                      onPointerCancel={handleStopDrawing}
                    />
                    <div className="mt-4 flex w-full max-w-[560px] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap items-center gap-4">
                        <div className="flex gap-2">
                          {COLORS.map((color) => (
                            <button
                              key={color.value}
                              type="button"
                              onClick={() => setStrokeColor(color.value)}
                              aria-label={`Select ${color.label} signature color`}
                              className={`h-7 w-7 rounded-full ring-2 ring-offset-2 ring-offset-background ${
                                strokeColor === color.value ? "ring-primary" : "ring-transparent"
                              }`}
                              style={{ backgroundColor: color.value }}
                            />
                          ))}
                        </div>
                        <div className="flex gap-2">
                          {THICKNESSES.map((thickness) => (
                            <button
                              key={thickness.label}
                              type="button"
                              onClick={() => setStrokeWidth(thickness.value)}
                              aria-label={`Use ${thickness.label} stroke thickness`}
                              className={`rounded-md border px-3 py-2 text-sm font-bold ${
                                strokeWidth === thickness.value ? "border-primary text-primary" : "border-border text-muted"
                              }`}
                            >
                              {thickness.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={clearCanvas}
                        aria-label="Clear signature canvas"
                        className="inline-flex items-center justify-center gap-3 rounded-md border border-border px-4 py-2 text-sm font-bold"
                      >
                        Clear
                        <ShortcutHint shortcut="C" />
                      </button>
                    </div>
                  </div>
                )}

                {signatureMode === "type" && (
                  <div className="mx-auto max-w-[560px]">
                    <input
                      type="text"
                      value={typedName}
                      onChange={handleTypedNameChange}
                      placeholder="Type your name"
                      aria-label="Type your signature name"
                      className="w-full rounded-md border border-border bg-background px-4 py-3"
                    />
                    <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr]">
                      <select
                        value={fontFamily}
                        onChange={handleFontFamilyChange}
                        aria-label="Select signature font"
                        className="rounded-md border border-border bg-background px-4 py-3"
                      >
                        {FONTS.map((font) => (
                          <option key={font} value={font}>
                            {font}
                          </option>
                        ))}
                      </select>
                      <label className="flex items-center gap-3 text-sm font-semibold text-muted">
                        Size
                        <input
                          type="range"
                          min="24"
                          max="72"
                          value={fontSize}
                          onChange={handleFontSizeChange}
                          aria-label="Adjust typed signature font size"
                          className="w-full"
                        />
                      </label>
                    </div>
                    <div className="mt-4 flex gap-2">
                      {COLORS.map((color) => (
                        <button
                          key={color.value}
                          type="button"
                          onClick={() => setStrokeColor(color.value)}
                          aria-label={`Select ${color.label} typed signature color`}
                          className={`h-7 w-7 rounded-full ring-2 ring-offset-2 ring-offset-background ${
                            strokeColor === color.value ? "ring-primary" : "ring-transparent"
                          }`}
                          style={{ backgroundColor: color.value }}
                        />
                      ))}
                    </div>
                    <canvas
                      ref={setTypeCanvasRef}
                      width={SIGNATURE_WIDTH}
                      height={SIGNATURE_HEIGHT}
                      aria-label="Typed signature preview canvas"
                      className="mt-4 h-[180px] w-full rounded-lg border-2 border-dashed border-gray-300 bg-white"
                    />
                  </div>
                )}

                {signatureMode === "upload" && (
                  <div className="mx-auto max-w-[560px]">
                    <div
                      {...getSignatureRootProps()}
                      aria-label="Upload signature image dropzone"
                      className={`flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition ${
                        isSignatureDragActive ? "border-primary bg-primary/5" : "border-border bg-background hover:border-primary"
                      }`}
                    >
                      <input {...getSignatureInputProps({ "aria-label": "Upload signature image" })} />
                      <p className="font-bold">{isSignatureDragActive ? "Drop the signature image" : "Upload PNG, JPG, or SVG"}</p>
                      <button
                        type="button"
                        onClick={openSignaturePicker}
                        aria-label="Browse for a signature image"
                        className="mt-4 rounded-md border border-border px-4 py-2 text-sm font-bold"
                      >
                        Browse image
                      </button>
                    </div>
                    <canvas
                      ref={setUploadCanvasRef}
                      width={SIGNATURE_WIDTH}
                      height={SIGNATURE_HEIGHT}
                      aria-label="Uploaded signature preview canvas"
                      className="mt-4 h-[180px] w-full rounded-lg border-2 border-dashed border-gray-300 bg-white"
                    />
                  </div>
                )}

                <div className="mt-8 flex justify-end">
                  <button
                    type="button"
                    onClick={handleUseSignature}
                    aria-label="Use this signature"
                    className="rounded-md bg-primary px-6 py-3 font-bold text-white transition hover:opacity-90"
                  >
                    Use This Signature &rarr;
                  </button>
                </div>
              </div>
            )}

            {step === "place" && (
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
                <div className="w-full overflow-x-auto rounded-lg border border-border bg-muted/10 p-3">
                  <div
                    ref={previewContainerRef}
                    className="relative mx-auto"
                    style={{ width: previewDims.w, height: previewDims.h, minWidth: previewDims.w }}
                  >
                    {previewCanvasUrl && (
                      <img
                        src={previewCanvasUrl}
                        alt="PDF page preview for placing signature"
                        className="absolute left-0 top-0 h-full w-full select-none"
                        draggable={false}
                      />
                    )}
                    {signatureDataUrl && (
                      <div
                        ref={overlayRef}
                        role="button"
                        tabIndex={0}
                        aria-label="Drag signature overlay"
                        className="group absolute cursor-move touch-none border border-dashed border-primary"
                        style={{
                          left: placement.x,
                          top: placement.y,
                          width: placement.width,
                          height: placement.height,
                          opacity: placement.opacity,
                          transform: `rotate(${placement.rotation}deg)`,
                          transformOrigin: "center center",
                        }}
                        onPointerDown={handleDragPointerDown}
                      >
                        <img src={signatureDataUrl} alt="Signature overlay" className="h-full w-full select-none object-contain" draggable={false} />
                        <div
                          aria-label="Resize signature from top left"
                          className="absolute -left-1 -top-1 h-2 w-2 cursor-nwse-resize bg-indigo-600"
                          onPointerDown={handleResizeTopLeft}
                        />
                        <div
                          aria-label="Resize signature from top right"
                          className="absolute -right-1 -top-1 h-2 w-2 cursor-nesw-resize bg-indigo-600"
                          onPointerDown={handleResizeTopRight}
                        />
                        <div
                          aria-label="Resize signature from bottom left"
                          className="absolute -bottom-1 -left-1 h-2 w-2 cursor-nesw-resize bg-indigo-600"
                          onPointerDown={handleResizeBottomLeft}
                        />
                        <div
                          aria-label="Resize signature from bottom right"
                          className="absolute -bottom-1 -right-1 h-2 w-2 cursor-nwse-resize bg-indigo-600"
                          onPointerDown={handleResizeBottomRight}
                        />
                        <div
                          aria-label="Rotate signature"
                          className="absolute -top-9 left-1/2 flex h-7 w-7 -translate-x-1/2 cursor-grab items-center justify-center rounded-full bg-primary text-white"
                          onPointerDown={handleRotatePointerDown}
                        >
                          <RotateCw className="h-4 w-4" aria-hidden="true" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <aside className="flex flex-col gap-5 rounded-lg border border-border bg-background p-5">
                  <label className="text-sm font-bold">
                    Opacity ({Math.round(placement.opacity * 100)}%)
                    <input
                      type="range"
                      min="0.2"
                      max="1"
                      step="0.05"
                      value={placement.opacity}
                      onChange={handleOpacityChange}
                      aria-label="Adjust signature opacity"
                      className="mt-2 w-full"
                    />
                  </label>

                  <label className="flex items-center gap-3 text-sm font-bold">
                    <input
                      type="checkbox"
                      checked={placement.applyAll}
                      onChange={handleApplyAllChange}
                      aria-label="Apply signature to all pages"
                      className="h-4 w-4"
                    />
                    Apply to all pages
                  </label>

                  {numPages > 1 && (
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <button
                        type="button"
                        onClick={handlePreviousPage}
                        disabled={currentPage === 1}
                        aria-label="Go to previous PDF page"
                        className="rounded-md border border-border px-3 py-2 font-bold disabled:opacity-40"
                      >
                        Prev
                      </button>
                      <span className="font-semibold text-muted">
                        Page {currentPage} of {numPages}
                      </span>
                      <button
                        type="button"
                        onClick={handleNextPage}
                        disabled={currentPage === numPages}
                        aria-label="Go to next PDF page"
                        className="rounded-md border border-border px-3 py-2 font-bold disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  )}

                  <div className="rounded-md bg-muted/10 p-3 font-mono text-xs text-muted">
                    X: {Math.round(placement.x)}px Y: {Math.round(placement.y)}px<br />
                    W: {Math.round(placement.width)}px H: {Math.round(placement.height)}px
                  </div>

                  <button
                    type="button"
                    onClick={handleChangeSignature}
                    aria-label="Change signature"
                    className="text-left text-sm font-bold text-primary hover:underline"
                  >
                    Change Signature
                  </button>

                  <button
                    type="button"
                    onClick={handleDownload}
                    disabled={isSigning}
                    aria-label="Sign and download PDF"
                    className="mt-auto inline-flex items-center justify-center gap-3 rounded-md bg-primary px-5 py-3 font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSigning ? "Stamping..." : "Stamp & Download"}
                    <ShortcutHint shortcut="D" />
                  </button>
                </aside>
              </div>
            )}

            {step === "done" && (
              <div className="mx-auto max-w-2xl text-center">
                <h2 className="text-2xl font-black">Visual stamp PDF ready</h2>
                <p className="mt-2 text-muted">Your visual signature stamp file has been downloaded and added to recent files.</p>
                {file && signedSize !== null && (
                  <SizeComparisonBadge originalSize={file.size} compressedSize={signedSize} />
                )}
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                  <button
                    type="button"
                    onClick={handleDownload}
                    aria-label="Download signed PDF again"
                    className="inline-flex items-center justify-center gap-3 rounded-md bg-primary px-5 py-3 font-bold text-white transition hover:opacity-90"
                  >
                    Download Again
                    <ShortcutHint shortcut="D" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      destroy();
                      setFile(null);
                      setCurrentPage(1);
                      setPreviewCanvasUrl("");
                      setPreviewDims({ w: 0, h: 0 });
                      setSignedSize(null);
                      setStep("upload");
                    }}
                    aria-label="Stamp another PDF"
                    className="rounded-md border border-border px-5 py-3 font-bold"
                  >
                    Stamp Another PDF
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </AppShell>
  );
}
