"use client";

import { Upload } from "lucide-react";
import { useDropzone, type Accept, type FileRejection } from "react-dropzone";
import ModeBadge from "./ModeBadge";

interface ToolUploadZoneProps {
  accept: Accept;
  multiple?: boolean;
  maxSize?: number;
  maxFiles?: number;
  disabled?: boolean;
  noClick?: boolean;
  emptyTitle?: string;
  dragTitle?: string;
  helperText?: string;
  onDrop: (files: File[]) => void;
  onDropRejected?: (rejections: FileRejection[]) => void;
  className?: string;
}

export default function ToolUploadZone({
  accept,
  multiple = false,
  maxSize,
  maxFiles,
  disabled = false,
  noClick = false,
  emptyTitle = "Drop your file here",
  dragTitle = "Drop to upload",
  helperText,
  onDrop,
  onDropRejected,
  className = "",
}: ToolUploadZoneProps) {
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept,
    multiple,
    maxSize,
    maxFiles,
    disabled,
    noClick: noClick || disabled,
    onDropRejected,
  });

  return (
    <div
      {...getRootProps()}
      className={`upload-box ${isDragActive ? "is-dragover" : ""} ${disabled ? "pointer-events-none opacity-60" : ""} ${className}`}
      aria-busy={disabled}
    >
      <input {...getInputProps()} aria-label={emptyTitle} />
      <Upload className="h-10 w-10 text-ink-500" strokeWidth={1.5} aria-hidden />
      <p className="text-heading-s text-ink-900">{isDragActive ? dragTitle : emptyTitle}</p>
      {!disabled && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            open();
          }}
          className="text-body-s text-ink-500 underline-offset-2 hover:underline"
        >
          or click to browse
        </button>
      )}
      {helperText && <p className="text-body-s text-ink-500">{helperText}</p>}
      <ModeBadge mode="local" />
    </div>
  );
}
