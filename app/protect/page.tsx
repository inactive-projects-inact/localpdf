"use client";

import Link from "next/link";
import { ChevronRight, Lock, Home, ShieldAlert } from "lucide-react";
import AppShell from "../components/AppShell";

const ACCENT = "#FF4D4D";
export default function ProtectPage() {
  return (
    <AppShell>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {/* Breadcrumb */}
        <nav className="mb-2 flex items-center gap-1.5 text-xs text-muted" aria-label="Breadcrumb">
          <Link href="/" className="flex items-center gap-1 hover:text-foreground transition-colors">
            <Home className="h-3 w-3" /> Home
          </Link>
          <ChevronRight className="h-3 w-3" />
          <Link href="/tools" className="hover:text-foreground transition-colors">Tools</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground">Protect PDF</span>
        </nav>

        <Link href="/tools" className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors">
          ← Back to all tools
        </Link>

        {/* Header */}
        <div className="mb-8 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ background: "#2A0F0F", color: ACCENT }}>
            <Lock className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Protect PDF</h1>
            <p className="mt-1 text-sm text-muted">True browser-side PDF encryption is currently unsupported.</p>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-red-500/30 bg-red-500/10 p-8 text-center">
          <ShieldAlert className="mx-auto mb-4 h-12 w-12 text-red-500" />
          <h2 className="mb-3 text-xl font-bold text-foreground">True Encryption Unsupported</h2>
          <p className="mx-auto max-w-lg text-sm leading-relaxed text-muted">
            Secure PDF encryption cannot be correctly implemented purely in the browser with our current client-side engine.
            To prevent a false sense of security, this feature is explicitly disabled. We will not pretend to encrypt your file or output an unprotected document while claiming success.
          </p>
        </div>
      </main>
    </AppShell>
  );
}
