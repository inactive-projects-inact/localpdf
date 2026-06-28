import { Lock, UserX, Shield } from "lucide-react";

const ITEMS = [
  { icon: Shield, label: "Runs in your browser" },
  { icon: Lock, label: "Files never leave your device" },
  { icon: UserX, label: "No account · no tracking" },
] as const;

export default function ToolTrustIndicators() {
  return (
    <div
      className="mb-8 flex flex-wrap gap-2"
      role="list"
      aria-label="Privacy and security"
    >
      {ITEMS.map(({ icon: Icon, label }, index) => (
        <span
          key={label}
          role="listitem"
          className="inline-flex items-center gap-1.5 rounded-md border border-trust/20 bg-trust-tint px-3 py-1.5 font-mono text-xs font-medium text-trust animate-fade-in"
          style={{ animationDelay: `${index * 60}ms` }}
        >
          <Icon className="h-3 w-3 shrink-0" aria-hidden />
          {label}
        </span>
      ))}
    </div>
  );
}
