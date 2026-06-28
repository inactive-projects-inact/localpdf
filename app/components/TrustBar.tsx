import { Lock, UserX, EyeOff } from "lucide-react";
import Link from "next/link";

const items = [
  {
    icon: Lock,
    title: "Processed in your browser",
    description: "Your files are handled locally — nothing is sent to any server.",
  },
  {
    icon: UserX,
    title: "No sign-up required",
    description: "Start immediately. No account, no email, no tracking.",
  },
  {
    icon: EyeOff,
    title: "We never see your files",
    description: "Your documents stay on your device, start to finish.",
  },
];

export default function TrustBar() {
  return (
    <section aria-label="Trust and privacy" className="bg-bg-surface-muted py-12 sm:py-16">
      <div className="container-content">
        <div className="grid gap-8 sm:grid-cols-3 sm:gap-12">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="flex flex-col items-center text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-trust-tint">
                  <Icon className="h-6 w-6 text-trust" strokeWidth={1.5} aria-hidden />
                </div>
                <p className="mt-4 text-body-m font-medium text-text-primary">{item.title}</p>
                <p className="mt-1 text-body-s text-text-muted">{item.description}</p>
              </div>
            );
          })}
        </div>
        <p className="mt-8 text-center">
          <Link
            href="/privacy-policy"
            className="text-body-s font-medium text-text-secondary underline-offset-3 transition hover:text-brand-primary hover:underline"
          >
            How we handle your files →
          </Link>
        </p>
      </div>
    </section>
  );
}
