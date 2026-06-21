"use client";

import ToolSizeResult from "./ToolSizeResult";

/** @deprecated Prefer ToolSizeResult */
export default function SizeComparisonBadge({
  originalSize,
  compressedSize,
}: {
  originalSize: number;
  compressedSize: number;
}) {
  return <ToolSizeResult originalSize={originalSize} newSize={compressedSize} />;
}
