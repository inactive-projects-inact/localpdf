import {
  ArrowUpDown,
  FileCheck,
  Layers,
  Shield,
  SlidersHorizontal,
  WifiOff,
  Zap,
  type LucideIcon,
} from "lucide-react";

import type { FeatureItem } from "../lib/content/types";

export interface ToolFeaturesProps {
  features: FeatureItem[];
}

const ICON_MAP: Record<string, LucideIcon> = {
  Shield,
  SlidersHorizontal,
  Zap,
  WifiOff,
  ArrowUpDown,
  Layers,
  FileCheck,
};

function FeatureIcon({ iconName }: { iconName: string }) {
  const Icon = ICON_MAP[iconName] ?? Shield;

  return (
    <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-light text-accent">
      <Icon className="h-5 w-5" aria-hidden="true" />
    </span>
  );
}

export default function ToolFeatures({ features }: ToolFeaturesProps) {
  if (features.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="tool-features-heading" className="mb-16">
      <h2 id="tool-features-heading" className="mb-6 text-2xl font-bold text-foreground">
        Why Use LocalPDF?
      </h2>
      <ul className="grid list-none gap-4 sm:grid-cols-2">
        {features.map((feature, index) => (
          <li
            key={`${feature.title}-${index}`}
            className="flex gap-4 rounded-2xl border border-border bg-card p-5"
          >
            <FeatureIcon iconName={feature.iconName} />
            <div>
              <h3 className="mb-1 font-semibold text-foreground">{feature.title}</h3>
              <p className="text-sm leading-relaxed text-muted">{feature.description}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
