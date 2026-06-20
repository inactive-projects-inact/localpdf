import Link from "next/link";

import type { InternalLink, ToolSchemaData } from "../lib/content/types";

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
    <article
      aria-label={`${toolName} guide and resources`}
      className="border-t border-border bg-background"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaData) }}
      />

      <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
        {children}

        {relatedTools.length > 0 && (
          <section aria-labelledby="tool-related-heading" className="mb-4">
            <h2 id="tool-related-heading" className="mb-6 text-2xl font-bold text-foreground">
              Related PDF Tools
            </h2>
            <nav aria-label="Related PDF tools">
              <ul className="grid list-none gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {relatedTools.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="flex h-full flex-col rounded-2xl border border-border bg-card p-4 transition hover:border-accent/40 hover:bg-accent-light/30"
                    >
                      <span className="font-semibold text-foreground">{link.label}</span>
                      {link.description && (
                        <span className="mt-1 text-sm leading-relaxed text-muted">
                          {link.description}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </section>
        )}
      </div>
    </article>
  );
}
