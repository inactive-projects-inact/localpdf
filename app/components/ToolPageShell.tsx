"use client";

import ToolPageHeader from "./ToolPageHeader";
import ToolTrustIndicators from "./ToolTrustIndicators";

interface ToolPageShellProps {
  title: string;
  description: string;
  category?: string;
  children: React.ReactNode;
}

export default function ToolPageShell({
  title,
  description,
  category,
  children,
}: ToolPageShellProps) {
  return (
    <main className="container-tool flex-1 py-8 sm:py-10">
      <ToolPageHeader title={title} description={description} category={category} />
      <ToolTrustIndicators />
      {children}
    </main>
  );
}
