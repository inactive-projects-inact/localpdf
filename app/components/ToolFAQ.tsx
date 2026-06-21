import type { FaqItem } from "../lib/content/types";

export interface ToolFAQProps {
  faqs: FaqItem[];
}

export default function ToolFAQ({ faqs }: ToolFAQProps) {
  if (faqs.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="tool-faq-heading" className="mb-16">
      <h2 id="tool-faq-heading" className="text-heading-s text-ink-900">
        Common questions
      </h2>
      <div className="mt-6 flex flex-col divide-y divide-border border-y border-border">
        {faqs.map((faq, index) => {
          const panelId = `tool-faq-panel-${index}`;
          const triggerId = `tool-faq-trigger-${index}`;

          return (
            <details key={`${faq.question}-${index}`} className="group">
              <summary
                id={triggerId}
                aria-controls={panelId}
                className="flex h-14 cursor-pointer list-none items-center justify-between gap-4 text-body-m text-ink-900 marker:content-none [&::-webkit-details-marker]:hidden"
              >
                {faq.question}
                <span
                  aria-hidden="true"
                  className="shrink-0 text-ink-500 transition-transform group-open:rotate-180"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="stroke-current">
                    <path d="M4 6l4 4 4-4" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </summary>
              <div id={panelId} role="region" aria-labelledby={triggerId} className="pb-4">
                <p className="text-body-s leading-relaxed text-ink-700">{faq.answer}</p>
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
