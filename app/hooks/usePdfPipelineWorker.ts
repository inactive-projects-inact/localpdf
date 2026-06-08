"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  PdfPipelineComplete,
  PdfPipelineError,
  PdfPipelineMemoryWarning,
  PdfPipelineProgress,
  PdfPipelineRequest,
  PdfPipelineResponse,
  PdfPipelineTask,
} from "../lib/pdf-pipeline-protocol";

export type PdfPipelineStatus = "idle" | "processing" | "done" | "error" | "cancelled";

export type PdfPipelineResult = {
  blob: Blob | null;
  text: string | null;
  filename: string;
  output: PdfPipelineComplete["output"] | null;
};

export type PdfPipelineState = {
  status: PdfPipelineStatus;
  progress: PdfPipelineProgress | null;
  memoryWarning: PdfPipelineMemoryWarning | null;
  result: PdfPipelineResult;
  error: PdfPipelineError | null;
};

const INITIAL_RESULT: PdfPipelineResult = {
  blob: null,
  text: null,
  filename: "",
  output: null,
};

const INITIAL_STATE: PdfPipelineState = {
  status: "idle",
  progress: null,
  memoryWarning: null,
  result: INITIAL_RESULT,
  error: null,
};

export function usePdfPipelineWorker(createWorker: () => Worker) {
  const [state, setState] = useState<PdfPipelineState>(INITIAL_STATE);
  const workerRef = useRef<Worker | null>(null);
  const activeJobIdRef = useRef(0);

  const terminateWorker = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  const reset = useCallback(() => {
    activeJobIdRef.current += 1;
    terminateWorker();
    setState(INITIAL_STATE);
  }, [terminateWorker]);

  const cancel = useCallback(() => {
    const worker = workerRef.current;
    if (!worker) return;
    const jobId = activeJobIdRef.current;
    const cancelMessage: PdfPipelineRequest = { type: "CANCEL", jobId };
    worker.postMessage(cancelMessage);
    activeJobIdRef.current += 1;
    terminateWorker();
    setState((current) => ({ ...current, status: "cancelled", progress: null }));
  }, [terminateWorker]);

  const process = useCallback(
    async (file: File, task: PdfPipelineTask) => {
      const jobId = activeJobIdRef.current + 1;
      activeJobIdRef.current = jobId;
      terminateWorker();
      setState({
        status: "processing",
        progress: { type: "PROGRESS", jobId, phase: "reading", percent: 0, message: "Reading file..." },
        memoryWarning: null,
        result: INITIAL_RESULT,
        error: null,
      });

      try {
        const fileBytes = await file.arrayBuffer();
        if (activeJobIdRef.current !== jobId) return;

        const worker = createWorker();
        workerRef.current = worker;

        worker.onmessage = (event: MessageEvent<PdfPipelineResponse>) => {
          const message = event.data;
          if (message.jobId !== activeJobIdRef.current) return;

          if (message.type === "PROGRESS") {
            setState((current) => ({ ...current, progress: message }));
            return;
          }

          if (message.type === "MEMORY_WARNING") {
            setState((current) => ({ ...current, memoryWarning: message }));
            return;
          }

          if (message.type === "CANCELLED") {
            terminateWorker();
            setState((current) => ({ ...current, status: "cancelled", progress: null }));
            return;
          }

          if (message.type === "ERROR") {
            terminateWorker();
            setState((current) => ({ ...current, status: "error", progress: null, error: message }));
            return;
          }

          terminateWorker();
          if (message.output.kind === "text" || message.output.kind === "file") {
            const buffer = message.output.bytes.buffer.slice(
              message.output.bytes.byteOffset,
              message.output.bytes.byteOffset + message.output.bytes.byteLength,
            ) as ArrayBuffer;
            const blob = new Blob([buffer], { type: message.output.mimeType });
            const text = message.output.kind === "text" ? new TextDecoder().decode(message.output.bytes) : null;
            setState((current) => ({
              ...current,
              status: "done",
              progress: null,
              result: {
                blob,
                text,
                filename: message.output.filename,
                output: message.output,
              },
            }));
            return;
          }

          setState((current) => ({
            ...current,
            status: "done",
            progress: null,
            result: {
              blob: null,
              text: null,
              filename: message.output.filename,
              output: message.output,
            },
          }));
        };

        worker.onerror = (event) => {
          if (activeJobIdRef.current !== jobId) return;
          terminateWorker();
          setState((current) => ({
            ...current,
            status: "error",
            progress: null,
            error: {
              type: "ERROR",
              jobId,
              code: "unknown",
              message: event.message || "Worker failed.",
              recoverable: true,
            },
          }));
        };

        const message: PdfPipelineRequest = {
          type: "START",
          jobId,
          input: {
            fileBytes,
            fileName: file.name,
            fileSize: file.size,
          },
          task,
        };
        worker.postMessage(message, [fileBytes]);
      } catch {
        if (activeJobIdRef.current !== jobId) return;
        setState((current) => ({
          ...current,
          status: "error",
          progress: null,
          error: {
            type: "ERROR",
            jobId,
            code: "unknown",
            message: "Could not read file for processing.",
            recoverable: true,
          },
        }));
      }
    },
    [createWorker, terminateWorker],
  );

  useEffect(() => {
    return () => {
      activeJobIdRef.current += 1;
      terminateWorker();
    };
  }, [terminateWorker]);

  return {
    ...state,
    process,
    cancel,
    reset,
  };
}
