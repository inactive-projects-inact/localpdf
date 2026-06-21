import Link from "next/link";

export default function CloudExplainer() {
  return (
    <section aria-label="Processing modes" className="container-content py-12 text-center">
      <p className="text-body-m text-ink-500">
        Every tool above runs entirely in your browser. We&apos;re building optional cloud features for
        larger files —{" "}
        <Link href="/about" className="font-semibold text-ink-900 underline-offset-3 hover:underline">
          see what&apos;s coming
        </Link>
        .
      </p>
    </section>
  );
}
