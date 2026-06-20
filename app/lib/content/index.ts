import type { ToolId } from "../tool-registry";
import { compressContent } from "./compress";
import { mergeContent } from "./merge";
import type { ToolContentPayload } from "./types";

export type {
  FaqItem,
  FeatureItem,
  GuideStep,
  InternalLink,
  JsonLdDocument,
  ToolContentPayload,
  ToolMeta,
  ToolSchemaData,
  ToolSchemaInput,
  WebApplicationSchemaInput,
} from "./types";

export {
  SITE_ORIGIN,
  buildBreadcrumbSchema,
  buildFaqPageSchema,
  buildHowToSchema,
  buildToolSchemaGraph,
  buildWebApplicationSchema,
} from "./schema";

export { compressContent } from "./compress";
export { mergeContent } from "./merge";

const contentRegistry: Partial<Record<ToolId, ToolContentPayload>> = {
  compress: compressContent,
  merge: mergeContent,
};

export function getToolContent(toolId: ToolId): ToolContentPayload {
  const content = contentRegistry[toolId];
  if (!content) {
    throw new Error(`No content payload registered for tool: ${toolId}`);
  }
  return content;
}

export function hasToolContent(toolId: ToolId): toolId is keyof typeof contentRegistry {
  return toolId in contentRegistry;
}

export function getRegisteredToolContentIds(): ToolId[] {
  return Object.keys(contentRegistry) as ToolId[];
}
