"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, Search, X } from "lucide-react";
import Logo from "./Logo";
import SearchInput from "./SearchInput";
import { NAV_CATEGORIES } from "../lib/nav-config";

export default function Navbar() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setMobileSearchOpen(false);
  }, [pathname]);

  const closeMobile = () => {
    setMobileOpen(false);
    setMobileSearchOpen(false);
  };

  return (
    <header
      className={`sticky top-0 z-50 transition-[shadow,background] duration-200 ${
        scrolled ? "border-b border-border-subtle bg-bg-surface/92 shadow-sm backdrop-blur-md" : "bg-transparent"
      }`}
    >
      <div className="container-content flex h-14 items-center justify-between gap-4 sm:h-16">
        <div className="w-[140px] shrink-0">
          <Logo />
        </div>

        <nav className="hidden flex-1 items-center gap-6 lg:flex" aria-label="Main navigation">
          {NAV_CATEGORIES.map((cat) => (
            <Link
              key={cat.id}
              href={cat.href}
              className="text-caption text-text-secondary transition hover:text-text-primary hover:underline hover:decoration-brand-primary hover:underline-offset-[6px]"
            >
              {cat.label}
            </Link>
          ))}
          <Link
            href="/tools"
            className="text-caption text-brand-primary transition hover:text-brand-primary-hover hover:underline hover:underline-offset-[6px]"
          >
            All Tools
          </Link>
        </nav>

        <div className="hidden lg:block">
          <SearchInput />
        </div>

        <div className="hidden w-[180px] items-center justify-end gap-4 lg:flex">
          <Link href="/tools" className="text-body-s text-text-secondary transition hover:text-text-primary">
            All Tools
          </Link>
          <div className="privacy-chip">
            <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            Local-only
            <span className="privacy-chip__tooltip">Processing happens in this browser tab. No uploads. No tracking.</span>
          </div>
        </div>

        <div className="flex items-center gap-1 lg:hidden">
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center text-text-secondary"
            onClick={() => {
              setMobileSearchOpen((v) => !v);
              setMobileOpen(false);
            }}
            aria-label="Search tools"
          >
            <Search className="h-6 w-6" />
          </button>
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center text-text-secondary"
            onClick={() => {
              setMobileOpen((v) => !v);
              setMobileSearchOpen(false);
            }}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {mobileSearchOpen && (
        <div className="border-t border-border-subtle bg-bg-surface px-4 py-3 lg:hidden">
          <SearchInput expanded onNavigate={closeMobile} />
        </div>
      )}

      {mobileOpen && (
        <div
          className="fixed inset-0 top-14 z-40 flex flex-col bg-bg-surface lg:hidden"
          role="navigation"
          aria-label="Mobile navigation"
        >
          <div className="border-b border-border-subtle px-4 py-3">
            <SearchInput expanded onNavigate={closeMobile} />
          </div>
          <div className="flex-1 overflow-y-auto">
            {NAV_CATEGORIES.map((cat) => (
              <Link
                key={cat.id}
                href={cat.href}
                onClick={closeMobile}
                className="flex h-14 items-center border-b border-border-subtle px-4 text-body-m font-medium text-text-primary"
              >
                {cat.label}
              </Link>
            ))}
            <Link
              href="/tools"
              onClick={closeMobile}
              className="flex h-14 items-center border-b border-border-subtle px-4 text-body-m font-semibold text-brand-primary"
            >
              All Tools
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
