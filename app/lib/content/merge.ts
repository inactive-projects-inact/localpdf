import type { ToolContentPayload } from "./types";
import { SITE_ORIGIN, buildToolSchemaGraph } from "./schema";

const TOOL_URL = `${SITE_ORIGIN}/merge`;

const guideSteps = [
  {
    title: "Add PDF files",
    description:
      "Upload two or more PDFs using drag and drop or the file picker. Files stay on your device.",
  },
  {
    title: "Arrange the order",
    description:
      "Drag files in the list to set the sequence pages will appear in the merged document.",
  },
  {
    title: "Merge in your browser",
    description:
      "Click Merge PDFs. LocalPDF combines the documents locally without sending them to a server.",
  },
  {
    title: "Save the combined PDF",
    description: "Download the merged file when processing completes.",
  },
] as const;

const features = [
  {
    title: "Private by design",
    description: "Merging happens in your browser memory. Documents are not uploaded for processing.",
    iconName: "Shield",
  },
  {
    title: "Drag to reorder",
    description: "Control page order by rearranging files before you merge.",
    iconName: "ArrowUpDown",
  },
  {
    title: "No file-count paywall",
    description: "Combine multiple PDFs in one session without creating an account.",
    iconName: "Layers",
  },
  {
    title: "Preserves original quality",
    description: "Pages are appended without re-encoding images or altering formatting.",
    iconName: "FileCheck",
  },
] as const;

const faqs = [
  {
    question: "How many PDFs can I merge at once?",
    answer:
      "You can merge many PDFs in one session. The practical limit depends on your device memory because processing is entirely local.",
  },
  {
    question: "Will merging reduce PDF quality?",
    answer:
      "No. LocalPDF appends pages from each source file without degrading images or text.",
  },
  {
    question: "Can I change the order before merging?",
    answer: "Yes. Drag files in the list to set the final page sequence before merging.",
  },
  {
    question: "Is it safe for confidential documents?",
    answer:
      "Yes. Files never leave your browser, which makes LocalPDF suitable for sensitive documents.",
  },
] as const;

export const mergeContent: ToolContentPayload = {
  id: "merge",
  meta: {
    title: "Merge PDF Online — Combine PDF Files in Your Browser",
    description:
      "Merge multiple PDF files locally in your browser. Reorder documents, combine pages, and download — no uploads required.",
  },
  features: [...features],
  guideSteps: [...guideSteps],
  faqs: [...faqs],
  relatedTools: [
    {
      href: "/compress",
      label: "Compress PDF",
      description: "Shrink merged PDFs after combining files.",
    },
    {
      href: "/split",
      label: "Split PDF",
      description: "Extract or separate pages from a combined document.",
    },
    {
      href: "/organize",
      label: "Organize PDF",
      description: "Reorder, rotate, or remove pages after merging.",
    },
  ],
  schema: buildToolSchemaGraph(
    {
      toolUrl: TOOL_URL,
      breadcrumbLabel: "Merge PDF",
      howToName: "How to Merge PDF Files Online",
      webApplication: {
        name: "LocalPDF Merge",
        description:
          "Free browser-based PDF merger that combines multiple documents locally without server uploads.",
        featureList: features.map((feature) => feature.title),
      },
    },
    [...guideSteps],
    [...faqs],
  ),
};
