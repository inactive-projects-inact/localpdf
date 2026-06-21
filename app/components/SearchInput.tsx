"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { NAV_CATEGORIES, searchTools } from "../lib/nav-config";
import ModeBadge from "./ModeBadge";

interface SearchInputProps {
  className?: string;
  expanded?: boolean;
  onNavigate?: () => void;
}

export default function SearchInput({ className = "", expanded = false, onNavigate }: SearchInputProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const results = searchTools(query);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [close]);

  const showDropdown = open && query.trim().length > 0;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div
        className={`flex items-center rounded-full bg-paper-100 transition-shadow ${
          expanded ? "w-full" : "w-60 focus-within:w-[360px]"
        } ${open ? "shadow-md" : ""}`}
      >
        <Search className="ml-3 h-4 w-4 shrink-0 text-ink-500" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search tools…"
          aria-label="Search PDF tools"
          aria-expanded={showDropdown}
          aria-controls="search-results"
          className="h-10 w-full bg-transparent px-3 text-body-s text-ink-900 outline-none placeholder:text-ink-500"
        />
      </div>

      {showDropdown && (
        <div
          id="search-results"
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[400px] overflow-y-auto rounded-lg border border-border bg-paper-0 shadow-lg"
        >
          {results.length === 0 ? (
            <p className="px-4 py-3 text-body-s text-ink-500">No tools found</p>
          ) : (
            results.map(({ item, isSynonym }) => {
              const Icon = item.icon;
              const category = NAV_CATEGORIES.find((c) => c.id === item.category)?.label ?? "";
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  role="option"
                  onClick={() => {
                    close();
                    onNavigate?.();
                  }}
                  className="flex h-11 items-center gap-3 px-4 transition hover:bg-paper-100"
                >
                  <Icon className="h-5 w-5 shrink-0 text-ink-900" aria-hidden />
                  <span className="flex-1 text-body-m text-ink-900">
                    {isSynonym && (
                      <span className="mr-1 text-body-s italic text-ink-500">Did you mean </span>
                    )}
                    {item.label}
                  </span>
                  <span className="hidden text-body-s text-ink-500 sm:inline">{category}</span>
                  <ModeBadge mode={item.mode} compact className="hidden sm:inline-flex" />
                </Link>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
