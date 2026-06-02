"use client";

import { useRouter } from "next/navigation";
import Reveal from "./Reveal";
import type { HomeToolId } from "../lib/design-system";
import { orderedHomeTools } from "../lib/design-system";

interface TileProps {
  tool: HomeToolId;
  delay: number;
  icon: React.ReactNode;
  onSelect: (tool: HomeToolId) => void;
}

function FeatureTile({ tool, delay, icon, onSelect }: TileProps) {
  const router = useRouter();
  const definition = orderedHomeTools.find((item) => item.id === tool);
  if (!definition) return null;

  const handleClick = () => {
    onSelect(tool);
    router.push(definition.route);
  };

  return (
    <Reveal delay={delay}>
      <button type="button" className="tile-lp" onClick={handleClick}>
        <div className={`tile-lp__icon-wrap ${definition.accentClass}`}>{icon}</div>
        <div className="min-w-0 flex-1 text-left">
          <div className="text-[15px] font-semibold text-foreground">{definition.label}</div>
          <div className="mt-0.5 text-[13px] text-muted">{definition.homeDescription}</div>
        </div>
        <span className="tile-lp__chevron" aria-hidden="true">
          ›
        </span>
      </button>
    </Reveal>
  );
}

interface HomeFeaturesProps {
  onSelectTool: (tool: HomeToolId) => void;
}

export default function HomeFeatures({ onSelectTool }: HomeFeaturesProps) {
  return (
    <section className="px-4 py-12 sm:py-16 lg:py-20" id="features">
      <div className="container-lp">
        <Reveal>
          <h2 className="mb-10 text-center text-[32px] font-bold text-foreground">What do you need today?</h2>
        </Reveal>

        <div className="flex flex-col gap-10">
          <div className="grid items-start gap-6 lg:grid-cols-[180px_1fr]">
            <Reveal className="border-l-[3px] border-accent pl-3">
              <h3 className="text-lg font-bold text-accent">Quick Fix</h3>
              <p className="mt-1 text-[13px] text-muted">Get things done fast</p>
            </Reveal>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <FeatureTile
                tool="compress"
                delay={0}
                onSelect={onSelectTool}
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 19V5M7 10l5-5 5 5" />
                  </svg>
                }
              />
              <FeatureTile
                tool="merge"
                delay={120}
                onSelect={onSelectTool}
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M8 6h12M8 12h12M8 18h8" />
                  </svg>
                }
              />
              <FeatureTile
                tool="split"
                delay={240}
                onSelect={onSelectTool}
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4" />
                  </svg>
                }
              />
              <FeatureTile
                tool="rotate"
                delay={360}
                onSelect={onSelectTool}
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 3a8 8 0 10-6.5 13.5M21 3v4M21 3h-4" />
                  </svg>
                }
              />
            </div>
          </div>

          <div className="grid items-start gap-6 lg:grid-cols-[180px_1fr]">
            <Reveal className="border-l-[3px] border-accent pl-3">
              <h3 className="font-bold text-accent">Everyday</h3>
              <p className="mt-1 text-[13px] text-muted">Convert &amp; create</p>
            </Reveal>
            <div className="grid gap-4 sm:grid-cols-2">
              <FeatureTile
                tool="jpg2pdf"
                delay={0}
                onSelect={onSelectTool}
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                    <path d="M8 16l3-5 3 3 3-6" />
                  </svg>
                }
              />
              <FeatureTile
                tool="pdf2jpg"
                delay={120}
                onSelect={onSelectTool}
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="4" y="3" width="16" height="18" rx="2" />
                    <circle cx="9" cy="9" r="2" fill="currentColor" />
                  </svg>
                }
              />
            </div>
          </div>

          <div className="grid items-start gap-6 lg:grid-cols-[180px_1fr]">
            <Reveal className="border-l-[3px] border-accent pl-3">
              <h3 className="text-[13px] font-medium text-accent">Power Tools</h3>
              <p className="mt-1 text-[13px] text-muted">Advanced options</p>
            </Reveal>
            <div className="grid gap-4 sm:grid-cols-2">
              <FeatureTile
                tool="watermark"
                delay={0}
                onSelect={onSelectTool}
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 20l5-10 4 5 4-8 7 13" />
                  </svg>
                }
              />
              <FeatureTile
                tool="signature"
                delay={120}
                onSelect={onSelectTool}
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 18c5-8 11-8 16 0" />
                    <path d="M5 18h14" />
                  </svg>
                }
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
