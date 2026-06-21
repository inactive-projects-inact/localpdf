import Link from "next/link";
import { ChevronRight } from "lucide-react";

const GUIDE_CLUSTERS = [
  {
    title: "Popular guides",
    links: [
      { label: "How to compress a PDF online", href: "/compress" },
      { label: "How to merge PDF files", href: "/merge" },
      { label: "How to split a PDF by pages", href: "/split" },
      { label: "Is it safe to compress a PDF online?", href: "/compress" },
    ],
  },
  {
    title: "Convert & secure",
    links: [
      { label: "How to convert PDF to Word", href: "/pdf-to-word" },
      { label: "How to convert Word to PDF", href: "/word-to-pdf" },
      { label: "How to password-protect a PDF", href: "/protect" },
      { label: "How to remove a PDF password", href: "/unlock" },
    ],
  },
];

function GuideList({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <h2 className="text-heading-s text-ink-900">{title}</h2>
      <ul className="mt-4 list-none space-y-3">
        {links.map((link) => (
          <li key={link.label}>
            <Link
              href={link.href}
              className="group flex items-center justify-between gap-2 py-1 text-body-m text-ink-900 transition hover:text-local-700"
            >
              {link.label}
              <ChevronRight
                className="h-4 w-4 shrink-0 text-ink-300 transition group-hover:text-local-500"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function EducationalSection() {
  return (
    <section aria-label="Guides" className="container-content py-12 sm:py-16">
      <div className="hidden gap-16 sm:grid sm:grid-cols-2">
        {GUIDE_CLUSTERS.map((cluster) => (
          <GuideList key={cluster.title} {...cluster} />
        ))}
      </div>

      <details className="sm:hidden">
        <summary className="flex h-11 cursor-pointer list-none items-center justify-between text-heading-s text-ink-900 marker:content-none [&::-webkit-details-marker]:hidden">
          Popular guides
          <ChevronRight className="h-4 w-4 text-ink-500 [[details[open]_&]]:rotate-90" aria-hidden />
        </summary>
        <div className="mt-4 space-y-8">
          {GUIDE_CLUSTERS.map((cluster) => (
            <GuideList key={cluster.title} {...cluster} />
          ))}
        </div>
      </details>
    </section>
  );
}
