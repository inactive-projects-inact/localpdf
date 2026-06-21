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
      className={`sticky top-0 z-50 transition-shadow ${
        scrolled ? "border-b border-border bg-paper-0/92 shadow-sm backdrop-blur-sm" : "bg-transparent"
      }`}
    >
      <div className="container-content flex h-14 items-center justify-between gap-4 sm:h-[72px]">
        <div className="w-[140px] shrink-0">
          <Logo />
        </div>

        <nav className="hidden flex-1 items-center gap-6 lg:flex" aria-label="Main navigation">
          {NAV_CATEGORIES.map((cat) => (
            <Link
              key={cat.id}
              href={cat.href}
              className={`text-caption text-ink-700 transition hover:text-ink-900 hover:underline hover:decoration-local-500 hover:underline-offset-[6px] ${
                pathname.startsWith("/tools") ? "" : ""
              }`}
            >
              {cat.label}
            </Link>
          ))}
          <Link
            href="/tools"
            className="text-caption text-local-500 transition hover:text-local-700 hover:underline hover:underline-offset-[6px]"
          >
            All Tools
          </Link>
        </nav>

        <div className="hidden lg:block">
          <SearchInput />
        </div>

        <div className="hidden w-[180px] items-center justify-end gap-4 lg:flex">
          <Link href="/tools" className="text-body-s text-ink-700 transition hover:text-ink-900">
            All Tools
          </Link>
          <div
            className="h-10 w-10 shrink-0 rounded-full border border-border bg-paper-100"
            aria-hidden
          />
        </div>

        <div className="flex items-center gap-1 lg:hidden">
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center text-ink-700"
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
            className="flex h-11 w-11 items-center justify-center text-ink-700"
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
        <div className="border-t border-border bg-paper-0 px-4 py-3 lg:hidden">
          <SearchInput expanded onNavigate={closeMobile} />
        </div>
      )}

      {mobileOpen && (
        <div
          className="fixed inset-0 top-14 z-40 flex flex-col bg-paper-0 lg:hidden"
          role="navigation"
          aria-label="Mobile navigation"
        >
          <div className="border-b border-border px-4 py-3">
            <SearchInput expanded onNavigate={closeMobile} />
          </div>
          <div className="flex-1 overflow-y-auto">
            {NAV_CATEGORIES.map((cat) => (
              <Link
                key={cat.id}
                href={cat.href}
                onClick={closeMobile}
                className="flex h-14 items-center border-b border-border px-4 text-body-m font-medium text-ink-900"
              >
                {cat.label}
              </Link>
            ))}
            <Link
              href="/tools"
              onClick={closeMobile}
              className="flex h-14 items-center border-b border-border px-4 text-body-m font-semibold text-local-500"
            >
              All Tools
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
