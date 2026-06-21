import Breadcrumb from "./Breadcrumb";
import ModeBadge from "./ModeBadge";
import type { ProcessingMode } from "../lib/design-system";

interface ToolPageHeaderProps {
  title: string;
  description: string;
  category?: string;
  mode?: ProcessingMode;
}

export default function ToolPageHeader({
  title,
  description,
  category = "Edit",
  mode = "local",
}: ToolPageHeaderProps) {
  return (
    <header className="mb-8">
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: category },
          { label: title },
        ]}
      />
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-display-m text-ink-900">{title}</h1>
        <ModeBadge mode={mode} compact />
      </div>
      <p className="mt-2 text-body-m text-ink-700">{description}</p>
    </header>
  );
}
