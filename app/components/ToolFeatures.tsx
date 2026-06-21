import type { FeatureItem } from "../lib/content/types";

export interface ToolFeaturesProps {
  features: FeatureItem[];
}

export default function ToolFeatures({ features }: ToolFeaturesProps) {
  if (features.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="tool-features-heading" className="mb-16">
      <div className="prose-tool max-w-none">
        {features.map((feature, index) => (
          <div key={`${feature.title}-${index}`} className="mb-8">
            {feature.title && (
              <h2 className="text-heading-s text-ink-900">{feature.title}</h2>
            )}
            <p className="mt-3 text-body-m leading-relaxed text-ink-700">{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
