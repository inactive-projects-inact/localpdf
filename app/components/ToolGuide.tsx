import type { GuideStep } from "../lib/content/types";

export interface ToolGuideProps {
  steps: GuideStep[];
}

export default function ToolGuide({ steps }: ToolGuideProps) {
  if (steps.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="tool-guide-heading" className="mb-16">
      <h2 id="tool-guide-heading" className="mb-6 text-2xl font-bold text-foreground">
        How to Use This Tool
      </h2>
      <ol className="grid list-none gap-4 sm:grid-cols-2">
        {steps.map((step, index) => (
          <li
            key={`${step.title}-${index}`}
            id={`guide-step-${index + 1}`}
            className="rounded-2xl border border-border bg-card p-5"
          >
            <div className="mb-4 flex h-8 w-8 items-center justify-center rounded-full bg-accent-light text-sm font-bold text-accent">
              {index + 1}
            </div>
            <h3 className="mb-2 font-semibold text-foreground">{step.title}</h3>
            <p className="text-sm leading-relaxed text-muted">{step.description}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
