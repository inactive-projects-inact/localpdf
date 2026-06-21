interface HowItWorksProps {
  steps?: { title: string; description: string }[];
}

const DEFAULT_STEPS = [
  { title: "Choose file", description: "Drop or browse for your PDF — no account needed." },
  { title: "Process", description: "Your file is processed entirely in your browser." },
  { title: "Download", description: "Get your result instantly. Nothing is uploaded." },
];

export default function HowItWorks({ steps = DEFAULT_STEPS }: HowItWorksProps) {
  return (
    <section id="how-it-works" aria-labelledby="how-it-works-heading" className="container-content py-12 sm:py-16">
      <h2 id="how-it-works-heading" className="text-heading-s text-ink-900">
        How it works
      </h2>
      <ol className="mt-8 grid list-none gap-6 sm:grid-cols-3 sm:gap-8">
        {steps.map((step, index) => (
          <li key={step.title} className="flex flex-col items-start">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-paper-100 font-mono text-[13px] font-medium text-ink-900">
              {index + 1}
            </span>
            <h3 className="mt-3 text-body-m font-medium text-ink-900">{step.title}</h3>
            <p className="mt-1 text-body-s text-ink-500">{step.description}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
