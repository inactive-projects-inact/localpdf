"use client";

import { createContext, useContext, useState, useCallback } from "react";
import type { ToolId } from "../lib/tool-registry";

export interface FileHistoryItem {
  filename: string;
  size: number;
  timestamp: number;
  tool: ToolId;
}

interface FileHistoryCtx {
  files: FileHistoryItem[];
  addFile: (item: FileHistoryItem) => void;
  pendingFiles: File[];
  pendingTool: ToolId | null;
  setPendingFiles: (files: File[]) => void;
  setPendingUpload: (tool: ToolId, files: File[]) => void;
  clearPendingFiles: () => void;
}

const Ctx = createContext<FileHistoryCtx>({
  files: [],
  addFile: () => {},
  pendingFiles: [],
  pendingTool: null,
  setPendingFiles: () => {},
  setPendingUpload: () => {},
  clearPendingFiles: () => {},
});

export function useFileHistory() {
  return useContext(Ctx);
}

export default function FileHistoryProvider({ children }: { children: React.ReactNode }) {
  const [files, setFiles] = useState<FileHistoryItem[]>([]);
  const [pendingFiles, setPendingFilesState] = useState<File[]>([]);
  const [pendingTool, setPendingTool] = useState<ToolId | null>(null);

  const addFile = useCallback((item: FileHistoryItem) => {
    setFiles((prev) => [item, ...prev].slice(0, 4));
  }, []);

  const setPendingFiles = useCallback((incoming: File[]) => {
    setPendingFilesState(incoming);
    setPendingTool(null);
  }, []);

  const setPendingUpload = useCallback((tool: ToolId, incoming: File[]) => {
    setPendingTool(tool);
    setPendingFilesState(incoming);
  }, []);

  const clearPendingFiles = useCallback(() => {
    setPendingTool(null);
    setPendingFilesState([]);
  }, []);

  return (
    <Ctx.Provider value={{ files, addFile, pendingFiles, pendingTool, setPendingFiles, setPendingUpload, clearPendingFiles }}>
      {children}
    </Ctx.Provider>
  );
}
