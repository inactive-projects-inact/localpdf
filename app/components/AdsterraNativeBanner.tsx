"use client";

import { useEffect, useState, useRef } from "react";

export default function AdsterraNativeBanner() {
  const [isBlocked, setIsBlocked] = useState(false);
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const containerId = "container-4470a11499cdb442b765a62310f45573";
    const scriptSrc = "https://pl29664260.effectivecpmnetwork.com/4470a11499cdb442b765a62310f45573/invoke.js";

    // 1. Create and configure script tag
    const script = document.createElement("script");
    script.src = scriptSrc;
    script.async = true;
    script.setAttribute("data-cfasync", "false");

    // 2. Handle block/error via direct loading failure
    script.onerror = () => {
      setIsBlocked(true);
    };

    // 3. Append the script to document body
    document.body.appendChild(script);

    // 4. Secondary check: Wait 3 seconds to see if the container is still empty
    const checkTimeout = setTimeout(() => {
      const container = containerRef.current;
      if (container) {
        // If the container has no element children, it was blocked
        if (container.children.length === 0 && container.innerHTML.trim() === "") {
          setIsBlocked(true);
        }
      }
    }, 3000);

    // Cleanup: remove script and clear timeout
    return () => {
      clearTimeout(checkTimeout);
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, [mounted]);

  // Prevent layout shift: render empty container with fixed min-height during SSR
  if (!mounted) {
    return (
      <div className="w-full max-w-4xl mx-auto my-6 px-4">
        <div className="w-full min-h-[250px] bg-card border border-border/50 rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (isBlocked) {
    return (
      <div className="w-full max-w-4xl mx-auto my-6 px-4">
        <div className="w-full p-6 rounded-2xl border border-amber-500/20 bg-amber-500/5 dark:bg-amber-950/10 flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left transition-all duration-300">
          <div className="flex flex-col md:flex-row items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h4 className="font-bold text-foreground text-sm">Support Localpdf by Whitelisting Us</h4>
              <p className="text-xs text-muted mt-1 max-w-xl">
                We detected that an ad blocker is running. Localpdf processes all your files 100% locally in your browser and keeps them completely private. Whitelisting us helps cover serverless, bandwidth, and maintenance costs!
              </p>
            </div>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="shrink-0 text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 px-4 py-2 rounded-xl transition duration-200"
          >
            Check Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto my-6 px-4 flex flex-col items-center">
      <span className="text-[10px] text-muted tracking-wider uppercase mb-1.5 select-none font-medium">
        Advertisement
      </span>
      <div
        ref={containerRef}
        id="container-4470a11499cdb442b765a62310f45573"
        className="w-full min-h-[250px] flex items-center justify-center rounded-2xl bg-card border border-border/50 overflow-hidden shadow-sm transition-all"
      />
    </div>
  );
}
