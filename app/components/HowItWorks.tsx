interface HowItWorksProps {
  steps?: { title: string; description: string }[];
}

const DEFAULT_STEPS = [
  { title: "Choose your file", description: "Drop or browse for your PDF — no account, no upload." },
  { title: "Process locally", description: "Your browser does the work. Nothing leaves your device." },
  { title: "Download instantly", description: "Get your result in seconds. Completely private." },
];

export default function HowItWorks({ steps = DEFAULT_STEPS }: HowItWorksProps) {
  return (
    <section id="how-it-works" aria-labelledby="how-it-works-heading" className="container-content py-12 sm:py-16">
      <h2 id="how-it-works-heading" className="text-heading-s text-text-primary">
        How it works
      </h2>
      <ol className="mt-8 grid list-none gap-6 sm:grid-cols-3 sm:gap-8">
        {steps.map((step, index) => (
          <li key={step.title} className="flex flex-col items-start">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-primary font-mono text-[13px] font-medium text-white">
              {index + 1}
            </span>
            <h3 className="mt-3 text-body-m font-medium text-text-primary">{step.title}</h3>
            <p className="mt-1 text-body-s text-text-muted">{step.description}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
