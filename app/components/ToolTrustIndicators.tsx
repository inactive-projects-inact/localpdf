import { Lock, UserX, Shield } from "lucide-react";

const ITEMS = [
  { icon: Lock, label: "Files stay on your device" },
  { icon: UserX, label: "No account required" },
  { icon: Shield, label: "Secure local processing" },
] as const;

export default function ToolTrustIndicators() {
  return (
    <div
      className="mb-8 flex flex-wrap gap-2"
      role="list"
      aria-label="Privacy and security"
    >
      {ITEMS.map(({ icon: Icon, label }) => (
        <span
          key={label}
          role="listitem"
          className="inline-flex items-center gap-1.5 rounded-full bg-local-50 px-3 py-1.5 font-mono text-xs font-medium text-local-700"
        >
          <Icon className="h-3 w-3 shrink-0" aria-hidden />
          {label}
        </span>
      ))}
    </div>
  );
}
