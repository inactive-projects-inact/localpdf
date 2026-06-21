import Link from "next/link";
import AppShell from "./components/AppShell";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page Not Found | LocalPDF",
  description: "The page you are looking for does not exist.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function NotFound() {
  return (
    <AppShell>
      <main className="container-content flex flex-1 flex-col items-center justify-center py-16 text-center">
        <h1 className="text-display-m text-ink-900">Page not found</h1>
        <p className="mt-4 max-w-md text-body-m text-ink-700">
          Sorry, we couldn&apos;t find that page. It may have been moved or doesn&apos;t exist.
        </p>

        <div className="mt-10 w-full max-w-sm rounded-lg border border-border bg-paper-0 p-6 text-left">
          <h2 className="text-caption text-ink-500">Popular pages</h2>
          <ul className="mt-4 flex flex-col gap-3">
            {[
              { href: "/", label: "Home" },
              { href: "/compress", label: "Compress PDF" },
              { href: "/merge", label: "Merge PDF" },
              { href: "/split", label: "Split PDF" },
              { href: "/tools", label: "All tools" },
            ].map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-body-m font-medium text-ink-900 transition hover:text-local-700"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </AppShell>
  );
}
