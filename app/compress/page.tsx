import type { Metadata } from "next";

import AppShell from "../components/AppShell";
import ToolContentLayout from "../components/ToolContentLayout";
import ToolFAQ from "../components/ToolFAQ";
import ToolFeatures from "../components/ToolFeatures";
import ToolGuide from "../components/ToolGuide";
import { getToolContent } from "../lib/content";
import CompressMain from "./main";

const content = getToolContent("compress");

export const metadata: Metadata = {
  title: content.meta.title,
  description: content.meta.description,
  alternates: { canonical: "https://localpdf.dev/compress" },
};

export default function CompressPage() {
  return (
    <AppShell>
      <CompressMain />
      <ToolContentLayout
        toolName="Compress PDF"
        schemaData={content.schema}
        relatedTools={content.relatedTools}
      >
        <ToolFeatures features={content.features} />
        <ToolGuide steps={content.guideSteps} />
        <ToolFAQ faqs={content.faqs} />
      </ToolContentLayout>
    </AppShell>
  );
}
