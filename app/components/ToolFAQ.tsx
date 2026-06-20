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
      <h2 id="tool-faq-heading" className="mb-6 text-2xl font-bold text-foreground">
        Frequently Asked Questions
      </h2>
      <div className="flex flex-col gap-3">
        {faqs.map((faq, index) => {
          const panelId = `tool-faq-panel-${index}`;
          const triggerId = `tool-faq-trigger-${index}`;

          return (
            <details
              key={`${faq.question}-${index}`}
              className="group rounded-2xl border border-border bg-card open:border-accent/30"
            >
              <summary
                id={triggerId}
                aria-controls={panelId}
                className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-foreground marker:content-none [&::-webkit-details-marker]:hidden"
              >
                <span className="flex items-center justify-between gap-4">
                  {faq.question}
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-muted transition-transform group-open:rotate-180"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      className="stroke-current"
                    >
                      <path
                        d="M4 6l4 4 4-4"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </span>
              </summary>
              <div
                id={panelId}
                role="region"
                aria-labelledby={triggerId}
                className="border-t border-border px-5 py-4"
              >
                <p className="text-sm leading-relaxed text-muted">{faq.answer}</p>
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
