import type { ToolId } from "../tool-registry";

export interface ToolMeta {
  title: string;
  description: string;
}

export interface GuideStep {
  title: string;
  description: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface FeatureItem {
  title: string;
  description: string;
  iconName: string;
}

export interface InternalLink {
  href: string;
  label: string;
  description?: string;
}

/** Serializable JSON-LD document injected by ToolContentLayout. */
export interface JsonLdDocument {
  "@context": "https://schema.org";
  "@graph": Record<string, unknown>[];
}

export interface WebApplicationSchemaInput {
  name: string;
  description: string;
  featureList: string[];
}

export interface ToolSchemaInput {
  toolUrl: string;
  breadcrumbLabel: string;
  webApplication: WebApplicationSchemaInput;
  howToName: string;
}

export type ToolSchemaData = JsonLdDocument;

export interface ToolContentPayload {
  id: ToolId;
  meta: ToolMeta;
  features: FeatureItem[];
  guideSteps: GuideStep[];
  faqs: FaqItem[];
  relatedTools: InternalLink[];
  schema: ToolSchemaData;
}
