import { Lock, Shield } from "lucide-react";
import type { ProcessingMode } from "../lib/design-system";

interface InlineTrustBadgeProps {
  variant?: "privacy" | "security";
  children: React.ReactNode;
}

export function InlineTrustBadge({ variant = "privacy", children }: InlineTrustBadgeProps) {
  const isPrivacy = variant === "privacy";

  return (
    <span
      className={`inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 font-mono text-xs font-medium ${
        isPrivacy ? "bg-local-50 text-local-700" : "bg-cloud-50 text-cloud-700"
      }`}
    >
      {isPrivacy ? (
        <Lock className="h-3 w-3 shrink-0" aria-hidden />
      ) : (
        <Shield className="h-3 w-3 shrink-0" aria-hidden />
      )}
      {children}
    </span>
  );
}

interface PrivacyBadgeProps {
  mode?: ProcessingMode;
}

export function PrivacyBadge({ mode = "local" }: PrivacyBadgeProps) {
  if (mode === "cloud") {
    return <InlineTrustBadge variant="security">Auto-deleted in 60 min</InlineTrustBadge>;
  }
  return <InlineTrustBadge variant="privacy">Never uploaded</InlineTrustBadge>;
}
