import Link from "next/link";

interface ToolCardProps {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  mode?: "local" | "cloud";
}

export default function ToolCard({
  title,
  description,
  href,
  icon,
  mode = "local",
}: ToolCardProps) {
  return (
    <Link href={href} className="tool-card group" aria-label={title}>
      <div className="tool-card__icon">
        <span className="[&>svg]:h-5 [&>svg]:w-5">{icon}</span>
        {mode === "cloud" && (
          <span
            className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-cloud-500"
            aria-label="Cloud processing"
          />
        )}
      </div>
      <h3 className="mt-3 font-display text-base font-semibold leading-6 text-text-primary">{title}</h3>
      <p className="mt-1 line-clamp-1 text-body-s text-text-muted">{description}</p>
    </Link>
  );
}
