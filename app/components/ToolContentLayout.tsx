import Link from "next/link";

import type { InternalLink, ToolSchemaData } from "../lib/content/types";
import ToolCard from "./ToolCard";

export interface ToolContentLayoutProps {
  toolName: string;
  children: React.ReactNode;
  schemaData: ToolSchemaData;
  relatedTools?: InternalLink[];
}

export default function ToolContentLayout({
  toolName,
  children,
  schemaData,
  relatedTools = [],
}: ToolContentLayoutProps) {
  return (
    <article aria-label={`${toolName} guide and resources`} className="border-t border-border bg-paper-50">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaData) }}
      />

      <div className="container-tool py-16">
        {children}

        {relatedTools.length > 0 && (
          <section aria-labelledby="tool-related-heading" className="mt-16">
            <h2 id="tool-related-heading" className="text-heading-s text-ink-900">
              Often used next
            </h2>
            <nav aria-label="Related PDF tools" className="mt-6 grid gap-6 sm:grid-cols-3">
              {relatedTools.slice(0, 3).map((link) => (
                <ToolCard
                  key={link.href}
                  title={link.label}
                  description={link.description ?? ""}
                  href={link.href}
                  icon={
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  }
                />
              ))}
            </nav>
          </section>
        )}
      </div>
    </article>
  );
}
