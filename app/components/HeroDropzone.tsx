"use client";

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
  return (
    <div className={variant === "hero" ? "mt-10 w-full" : "w-full"}>
      <UploadBox selectedTool={selectedTool} id={id} mode="local" />
    </div>
  );
}
