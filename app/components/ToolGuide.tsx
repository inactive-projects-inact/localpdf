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
      <h2 id="tool-guide-heading" className="text-heading-s text-ink-900">
        How it works
      </h2>
      <ol className="mt-8 grid list-none gap-6 sm:grid-cols-3 sm:gap-8">
        {steps.map((step, index) => (
          <li key={`${step.title}-${index}`} id={`guide-step-${index + 1}`} className="flex flex-col items-start">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-paper-100 font-mono text-[13px] font-medium text-ink-900">
              {index + 1}
            </span>
            <h3 className="mt-3 text-body-m font-medium text-ink-900">{step.title}</h3>
            <p className="mt-1 text-body-s text-ink-500">{step.description}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
