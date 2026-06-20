import type {
  FaqItem,
  GuideStep,
  JsonLdDocument,
  ToolSchemaInput,
} from "./types";

export const SITE_ORIGIN = "https://localpdf.dev";

export function buildWebApplicationSchema(
  toolUrl: string,
  input: ToolSchemaInput["webApplication"],
): Record<string, unknown> {
  return {
    "@type": "WebApplication",
    "@id": `${toolUrl}#webapp`,
    name: input.name,
    url: toolUrl,
    description: input.description,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Web",
    browserRequirements: "Requires JavaScript",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    featureList: input.featureList,
  };
}

export function buildHowToSchema(
  name: string,
  steps: GuideStep[],
  toolUrl: string,
): Record<string, unknown> {
  return {
    "@type": "HowTo",
    name,
    description: `${name} using LocalPDF in your browser.`,
    step: steps.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step.title,
      text: step.description,
      url: `${toolUrl}#guide-step-${index + 1}`,
    })),
  };
}

export function buildFaqPageSchema(faqs: FaqItem[]): Record<string, unknown> {
  return {
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}

export function buildBreadcrumbSchema(
  breadcrumbLabel: string,
  toolUrl: string,
): Record<string, unknown> {
  return {
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: SITE_ORIGIN,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: breadcrumbLabel,
        item: toolUrl,
      },
    ],
  };
}

export function buildToolSchemaGraph(
  input: ToolSchemaInput,
  guideSteps: GuideStep[],
  faqs: FaqItem[],
): JsonLdDocument {
  return {
    "@context": "https://schema.org",
    "@graph": [
      buildWebApplicationSchema(input.toolUrl, input.webApplication),
      buildHowToSchema(input.howToName, guideSteps, input.toolUrl),
      buildFaqPageSchema(faqs),
      buildBreadcrumbSchema(input.breadcrumbLabel, input.toolUrl),
    ],
  };
}
