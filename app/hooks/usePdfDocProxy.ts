"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getPdfjs } from "../lib/pdf-utils";

type PDFDocumentProxy = import("pdfjs-dist").PDFDocumentProxy;
type PDFDocumentLoadingTask = import("pdfjs-dist").PDFDocumentLoadingTask;

export type PdfDocProxyLoadError = {
  reason: "encrypted" | "unsupported-encryption" | "corrupted" | "unknown";
  message: string;
};

function classifyPdfOpenError(error: unknown): PdfDocProxyLoadError {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (normalized.includes("aes") || normalized.includes("unsupported encryption") || normalized.includes("unsupported security")) {
    return { reason: "unsupported-encryption", message };
  }

  if (normalized.includes("encrypt") || normalized.includes("password") || normalized.includes("decrypt") || normalized.includes("security")) {
    return { reason: "encrypted", message };
  }

  if (message.trim() === "") {
    return { reason: "unknown", message: "Unknown PDF loading error." };
  }

  return { reason: "corrupted", message };
}

function destroyLoadingTask(task: PDFDocumentLoadingTask | null) {
  if (!task) return;
  void task.destroy().catch((error: unknown) => {
    console.warn("[usePdfDocProxy] Failed to destroy PDF loading task.", error);
  });
}

function destroyProxy(proxy: PDFDocumentProxy | null) {
  if (!proxy) return;
  void proxy.destroy().catch((error: unknown) => {
    console.warn("[usePdfDocProxy] Failed to destroy PDF proxy.", error);
  });
}

export function usePdfDocProxy() {
  const proxyRef = useRef<PDFDocumentProxy | null>(null);
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const jobIdRef = useRef(0);
  const [isLoading, setIsLoading] = useState(false);
  const [numPages, setNumPages] = useState(0);
  const [loadError, setLoadError] = useState<PdfDocProxyLoadError | null>(null);

  const destroy = useCallback(() => {
    jobIdRef.current += 1;
    destroyLoadingTask(loadingTaskRef.current);
    loadingTaskRef.current = null;
    destroyProxy(proxyRef.current);
    proxyRef.current = null;
    setNumPages(0);
    setLoadError(null);
    setIsLoading(false);
  }, []);

  const load = useCallback((source: File | ArrayBuffer) => {
    const jobId = jobIdRef.current + 1;
    jobIdRef.current = jobId;

    destroyLoadingTask(loadingTaskRef.current);
    loadingTaskRef.current = null;
    destroyProxy(proxyRef.current);
    proxyRef.current = null;
    setNumPages(0);
    setLoadError(null);
    setIsLoading(true);

    void (async () => {
      try {
        const pdfjs = await getPdfjs();
        const sourceBuffer = source instanceof File ? await source.arrayBuffer() : source;
        if (jobIdRef.current !== jobId) return;

        const loadingTask = pdfjs.getDocument({ data: sourceBuffer.slice(0) });
        loadingTaskRef.current = loadingTask;
        const proxy = await loadingTask.promise;

        if (jobIdRef.current !== jobId) {
          destroyProxy(proxy);
          return;
        }

        proxyRef.current = proxy;
        loadingTaskRef.current = null;
        setNumPages(proxy.numPages);
        setIsLoading(false);
      } catch (error) {
        if (jobIdRef.current !== jobId) return;
        loadingTaskRef.current = null;
        proxyRef.current = null;
        setLoadError(classifyPdfOpenError(error));
        setIsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    return () => {
      jobIdRef.current += 1;
      destroyLoadingTask(loadingTaskRef.current);
      loadingTaskRef.current = null;
      destroyProxy(proxyRef.current);
      proxyRef.current = null;
    };
  }, []);

  return { proxyRef, isLoading, numPages, loadError, load, destroy };
}
