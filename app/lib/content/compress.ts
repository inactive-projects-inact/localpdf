import type { ToolContentPayload } from "./types";
import { SITE_ORIGIN, buildToolSchemaGraph } from "./schema";

const TOOL_URL = `${SITE_ORIGIN}/compress`;

const guideSteps = [
  {
    title: "Upload your PDF",
    description:
      "Drag and drop a PDF onto the compress tool or use Browse files to select one from your device.",
  },
  {
    title: "Choose a compression level",
    description:
      "Pick Extreme for the smallest file, Recommended for balanced quality, or Print-Safe to preserve print resolution.",
  },
  {
    title: "Compress locally",
    description:
      "Click Compress PDF. Processing runs entirely in your browser — the file is never uploaded to a server.",
  },
  {
    title: "Download the result",
    description:
      "When compression finishes, your reduced PDF downloads automatically. You can compress again or choose another file.",
  },
] as const;

const features = [
  {
    title: "100% local processing",
    description:
      "Your PDF never leaves your device. Compression runs in a browser worker with no server uploads.",
    iconName: "Shield",
  },
  {
    title: "Three quality tiers",
    description:
      "Extreme, Recommended, and Print-Safe modes let you trade file size against visual fidelity.",
    iconName: "SlidersHorizontal",
  },
  {
    title: "No account required",
    description: "Use the tool immediately with no registration, email, or sign-in.",
    iconName: "Zap",
  },
  {
    title: "Works offline-capable",
    description:
      "After the page loads, compression can proceed without sending data over the network.",
    iconName: "WifiOff",
  },
] as const;

const faqs = [
  {
    question: "Is my PDF uploaded to a server?",
    answer:
      "No. LocalPDF compresses PDFs entirely inside your browser. Your file is read from disk, processed locally, and never transmitted to our servers.",
  },
  {
    question: "Which compression level should I use?",
    answer:
      "Recommended is the best default for most documents. Use Extreme when file size matters most and Print-Safe when you need higher image fidelity for printing.",
  },
  {
    question: "Why did my file size increase after compression?",
    answer:
      "Some PDFs are already well optimized. Re-compressing them can add overhead, so LocalPDF returns the original when a smaller result is not possible.",
  },
  {
    question: "Are password-protected PDFs supported?",
    answer:
      "Encrypted or password-protected PDFs cannot be compressed in the browser tool. Remove protection first, then compress the file.",
  },
] as const;

export const compressContent: ToolContentPayload = {
  id: "compress",
  meta: {
    title: "Compress PDF Locally — Free PDF Size Reducer",
    description:
      "Reduce PDF file size in your browser. Choose Extreme, Recommended, or Print-Safe compression with no uploads and no registration.",
  },
  features: [...features],
  guideSteps: [...guideSteps],
  faqs: [...faqs],
  relatedTools: [
    {
      href: "/merge",
      label: "Merge PDF",
      description: "Combine multiple PDFs into one document.",
    },
    {
      href: "/split",
      label: "Split PDF",
      description: "Extract pages or divide a PDF into separate files.",
    },
    {
      href: "/rotate",
      label: "Rotate PDF",
      description: "Fix page orientation without leaving your browser.",
    },
  ],
  schema: buildToolSchemaGraph(
    {
      toolUrl: TOOL_URL,
      breadcrumbLabel: "Compress PDF",
      howToName: "How to Compress a PDF Online",
      webApplication: {
        name: "LocalPDF Compress",
        description:
          "Free browser-based PDF compressor that reduces file size locally without uploading your documents.",
        featureList: features.map((feature) => feature.title),
      },
    },
    [...guideSteps],
    [...faqs],
  ),
};
