import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ProcessorInboundMessage,
  ProcessorOutboundMessage,
  ProcessorTaskOptions,
} from "../lib/pdf-processor-protocol";

interface ProcessorWorkerState {
  status: "idle" | "processing" | "done" | "error";
  progress: number;
  message: string;
  resultBlob: Blob | null;
  resultFilename: string | null;
  error: string | null;
}

export function useProcessorWorker() {
  const [state, setState] = useState<ProcessorWorkerState>({
    status: "idle",
    progress: 0,
    message: "",
    resultBlob: null,
    resultFilename: null,
    error: null,
  });

  const workerRef = useRef<Worker | null>(null);
  const currentJobIdRef = useRef<number>(0);

  useEffect(() => {
    workerRef.current = new Worker(new URL("../lib/pdf-processor.worker.ts", import.meta.url), {
      type: "module",
    });

    workerRef.current.onmessage = (e: MessageEvent<ProcessorOutboundMessage>) => {
      const msg = e.data;
      if (msg.jobId !== currentJobIdRef.current) return; // Ignore stale messages

      if (msg.type === "PROGRESS") {
        setState((s) => ({ ...s, progress: msg.percent, message: msg.message || s.message }));
      } else if (msg.type === "ERROR") {
        setState((s) => ({ ...s, status: "error", error: msg.error, progress: 0 }));
      } else if (msg.type === "COMPLETE") {
        const type = msg.isZip ? "application/zip" : "application/pdf";
        const blob = new Blob([new Uint8Array(msg.result)], { type });
        setState((s) => ({ ...s, status: "done", resultBlob: blob, progress: 100, message: "Done!" }));
      }
    };

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const process = useCallback(
    async (file: File | null, task: ProcessorTaskOptions, outputFilename: string) => {
      const jobId = ++currentJobIdRef.current;
      setState({
        status: "processing",
        progress: 0,
        message: "Starting...",
        resultBlob: null,
        resultFilename: outputFilename,
        error: null,
      });

      try {
        const fileBytes = file ? await file.arrayBuffer() : new ArrayBuffer(0);
        if (workerRef.current) {
          const msg: ProcessorInboundMessage = {
            type: "START_PROCESS",
            jobId,
            fileBytes,
            task,
          };
          workerRef.current.postMessage(msg, [fileBytes]); // transfer the array buffer
        }
      } catch (err) {
        setState((s) => ({
          ...s,
          status: "error",
          error: "Could not read file for processing.",
        }));
      }
    },
    []
  );

  const cancel = useCallback(() => {
    if (workerRef.current && state.status === "processing") {
      currentJobIdRef.current++; // Invalidate the current job immediately
      const msg: ProcessorInboundMessage = { type: "CANCEL_PROCESS" };
      workerRef.current.postMessage(msg);
      setState((s) => ({ ...s, status: "idle", progress: 0, message: "Cancelled." }));
    }
  }, [state.status]);

  const reset = useCallback(() => {
    setState({
      status: "idle",
      progress: 0,
      message: "",
      resultBlob: null,
      resultFilename: null,
      error: null,
    });
  }, []);

  return {
    ...state,
    process,
    cancel,
    reset,
  };
}
