import Link from "next/link";
import { ChevronRight } from "lucide-react";
import Logo from "./Logo";
import { NAV_TOOLS } from "../lib/nav-config";

const COMPANY_LINKS = [
  { label: "About", href: "/about" },
  { label: "Blog", href: "/blog" },
  { label: "Contact", href: "/contact" },
];

const LEGAL_LINKS = [
  { label: "Privacy Policy", href: "/privacy-policy" },
  { label: "Terms & Conditions", href: "/terms" },
  { label: "Disclaimer", href: "/disclaimer" },
];

const PRODUCT_LINKS = [
  { label: "How it works", href: "/#how-it-works" },
  { label: "All tools", href: "/tools" },
  { label: "Compress PDF", href: "/compress" },
  { label: "Merge PDF", href: "/merge" },
  { label: "Split PDF", href: "/split" },
];

function FooterColumn({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <h3 className="text-caption text-white/50">{title}</h3>
      <ul className="mt-4 flex flex-col gap-2.5">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="text-[13px] text-white/60 transition hover:text-white"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FooterAccordion({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <details className="border-b border-white/10 sm:hidden">
      <summary className="flex h-11 cursor-pointer list-none items-center justify-between text-caption text-white/50 marker:content-none [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronRight className="h-4 w-4" aria-hidden />
      </summary>
      <ul className="mb-4 flex flex-col gap-2.5 pl-1">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="text-[13px] text-white/60 hover:text-white">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}

export default function Footer() {
  const sortedTools = [...NAV_TOOLS].sort((a, b) => a.label.localeCompare(b.label));

  return (
    <footer className="bg-[#061B31] px-4 pb-8 pt-16">
      <div className="container-content">
        <div className="hidden gap-8 sm:grid sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-1">
            <Logo footer />
            <p className="mt-3 text-[13px] text-white/50">
              Free PDF tools that never leave your device.
            </p>
          </div>
          <FooterColumn title="Product" links={PRODUCT_LINKS} />
          <div>
            <h3 className="text-caption text-white/50">Tools</h3>
            <ul className="mt-4 flex max-h-48 flex-col gap-2 overflow-y-auto">
              {sortedTools.map((tool) => (
                <li key={tool.href}>
                  <Link
                    href={tool.href}
                    className="text-[13px] text-white/60 transition hover:text-white"
                  >
                    {tool.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <FooterColumn title="Company" links={COMPANY_LINKS} />
          <FooterColumn title="Legal" links={LEGAL_LINKS} />
        </div>

        <div className="sm:hidden">
          <Logo footer />
          <FooterAccordion title="Product" links={PRODUCT_LINKS} />
          <FooterAccordion
            title="Tools"
            links={sortedTools.slice(0, 8).map((t) => ({ label: t.label, href: t.href }))}
          />
          <FooterAccordion title="Company" links={COMPANY_LINKS} />
          <FooterAccordion title="Legal" links={LEGAL_LINKS} />
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 sm:flex-row">
          <p className="text-caption text-white/40">
            © {new Date().getFullYear()} Localpdf. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
