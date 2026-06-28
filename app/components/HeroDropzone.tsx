"use client";

import { useEffect, useState } from "react";
import UploadBox from "./UploadBox";
import type { HomeToolId } from "../lib/design-system";

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
}: HeroDropzoneProps) {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(navigator.platform?.includes("Mac") ?? false);
  }, []);

  return (
    <div className={variant === "hero" ? "mx-auto w-full max-w-[640px]" : "w-full"}>
      <UploadBox selectedTool={selectedTool} id={id} mode="local" />
      <div className="mt-4 flex flex-col items-center gap-2">
        <span className="shortcut-hint">
          <kbd>{isMac ? "⌘" : "Ctrl"}</kbd>
          <span>+</span>
          <kbd>O</kbd>
          <span>to open files</span>
        </span>
        <p className="text-body-s text-text-muted">
          Everything runs locally. Files never leave your device.
        </p>
      </div>
    </div>
  );
}
