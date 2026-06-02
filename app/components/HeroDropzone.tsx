"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { useFileHistory } from "./FileHistoryProvider";
import type { HomeToolId } from "../lib/design-system";
import { getToolDefinition, validateFilesForTool } from "../lib/design-system";

interface HeroDropzoneProps {
  selectedTool: HomeToolId;
  variant?: "hero" | "bottom";
  id?: string;
  pulseOnView?: boolean;
}

export default function HeroDropzone({
  selectedTool,
  variant = "hero",
  id,
  pulseOnView = false,
}: HeroDropzoneProps) {
  const router = useRouter();
  const { setPendingUpload } = useFileHistory();
  const tool = getToolDefinition(selectedTool);
  const defaultTitle = variant === "hero" ? tool.input.emptyTitle : `Ready? ${tool.input.emptyTitle}.`;
  const [readyState, setReadyState] = useState<{ tool: HomeToolId; title: string } | null>(null);
  const [pulseVisible, setPulseVisible] = useState(false);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;

      void (async () => {
        const validFiles = await validateFilesForTool(acceptedFiles, selectedTool);
        if (validFiles.length === 0) {
          toast.error(tool.input.invalidMessage);
          return;
        }

        setPendingUpload(selectedTool, validFiles);
        setReadyState({
          tool: selectedTool,
          title:
            validFiles.length === 1
              ? `${tool.input.readySingular}: ${validFiles[0].name}`
              : `${validFiles.length} ${tool.input.readyPlural} - opening tool...`,
        });
        router.push(tool.route);
      })();
    },
    [router, selectedTool, setPendingUpload, tool],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: tool.input.accept,
    multiple: tool.input.multiple,
    maxFiles: tool.input.maxFiles,
    noClick: true,
    maxSize: tool.input.maxSizeBytes,
    onDropRejected: (rejections) => {
      const err = rejections[0]?.errors[0];
      if (err?.code === "file-too-large") {
        toast.error(`File exceeds the ${Math.round(tool.input.maxSizeBytes / 1024 / 1024)} MB limit.`);
      } else {
        toast.error(`${tool.input.invalidMessage} Got: ${rejections[0]?.file.name ?? "unknown"}`);
      }
    },
  });

  const rootRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || !pulseOnView) return;
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) {
            setPulseVisible(true);
            observer.disconnect();
          }
        },
        { threshold: 0.4 },
      );
      observer.observe(node);
    },
    [pulseOnView],
  );

  const isHero = variant === "hero";
  const title = readyState?.tool === selectedTool ? readyState.title : defaultTitle;

  return (
    <div
      {...getRootProps()}
      ref={pulseOnView ? rootRef : undefined}
      id={id}
      className={`dropzone-lp relative ${variant === "bottom" ? "dropzone-lp--bottom" : ""} ${
        isDragActive ? "is-dragover" : ""
      } ${pulseVisible ? "is-visible" : ""} ${isHero ? "mt-8" : ""}`}
    >
      <input {...getInputProps()} aria-label={`Upload ${tool.input.label}`} />

      {isHero && (
        <svg className="mb-4 h-12 w-12 text-accent" viewBox="0 0 48 48" fill="none" aria-hidden="true">
          <path
            d="M14 6h14l10 10v26a2 2 0 01-2 2H14a2 2 0 01-2-2V8a2 2 0 012-2z"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M28 6v10h10M24 28v-8M20 24l4-4 4 4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}

      <p className={`text-foreground ${isHero ? "text-xl font-semibold" : "text-2xl font-bold"}`}>
        {isDragActive ? tool.input.dragActiveTitle : title}
      </p>

      <p className="my-3 text-sm text-muted">or</p>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          open();
        }}
        className="dropzone-lp__btn"
      >
        {tool.input.browseLabel} - Start Now
      </button>

      {!isHero && <p className="mt-3 text-[13px] text-muted">{tool.input.helperText}</p>}
    </div>
  );
}
