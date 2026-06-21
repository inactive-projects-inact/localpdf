import { Lock, UserX, EyeOff } from "lucide-react";
import Link from "next/link";

const items = [
  {
    icon: Lock,
    title: "Files processed in your browser",
    description: "Nothing is sent to a server.",
  },
  {
    icon: UserX,
    title: "No sign-up, no email required",
    description: "Start immediately, no account.",
  },
  {
    icon: EyeOff,
    title: "We never see your files",
    description: "Your documents stay on your device.",
  },
];

export default function TrustBar() {
  return (
    <section aria-label="Trust and privacy" className="bg-paper-100 py-12 sm:py-16">
      <div className="container-content">
        <div className="grid gap-8 sm:grid-cols-3 sm:gap-12">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="flex flex-col items-center text-center">
                <Icon className="h-8 w-8 text-local-500" strokeWidth={1.5} aria-hidden />
                <p className="mt-3 text-body-m font-medium text-ink-900">{item.title}</p>
                <p className="mt-1 text-body-s text-ink-500">{item.description}</p>
              </div>
            );
          })}
        </div>
        <p className="mt-8 text-center">
          <Link
            href="/privacy-policy"
            className="text-body-s font-semibold text-ink-700 underline-offset-3 hover:underline"
          >
            How we handle your files
          </Link>
        </p>
      </div>
    </section>
  );
}
