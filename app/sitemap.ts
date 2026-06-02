import type { MetadataRoute } from "next";

const BASE_URL = "https://localpdf.dev";

// Use explicit dates, not new Date() — non-deterministic lastModified causes
// Google Search Console to treat every page as "recently modified" on every
// sitemap refresh, wasting crawl budget on unchanged pages.
const CORE_TOOL_DATE = "2026-05-15";
const CONTENT_DATE = "2026-05-20";
const LEGAL_DATE = "2026-01-01";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: CONTENT_DATE, changeFrequency: "weekly", priority: 1.0 },
    { url: `${BASE_URL}/compress`, lastModified: CORE_TOOL_DATE, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE_URL}/merge`, lastModified: CORE_TOOL_DATE, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE_URL}/split`, lastModified: CORE_TOOL_DATE, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE_URL}/rotate`, lastModified: CORE_TOOL_DATE, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/text-to-pdf`, lastModified: CORE_TOOL_DATE, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/resize`, lastModified: CORE_TOOL_DATE, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/page-numbers`, lastModified: CORE_TOOL_DATE, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/crop`, lastModified: CORE_TOOL_DATE, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/tools`, lastModified: CONTENT_DATE, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE_URL}/signature`, lastModified: CORE_TOOL_DATE, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE_URL}/sign`, lastModified: CORE_TOOL_DATE, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE_URL}/pdf-to-pptx`, lastModified: CORE_TOOL_DATE, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/html-to-pdf`, lastModified: CORE_TOOL_DATE, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/flatten`, lastModified: CORE_TOOL_DATE, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/pdf-to-markdown`, lastModified: CORE_TOOL_DATE, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/pdf-to-word`, lastModified: CORE_TOOL_DATE, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/word-to-pdf`, lastModified: CORE_TOOL_DATE, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/pdf-to-excel`, lastModified: CORE_TOOL_DATE, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/excel-to-pdf`, lastModified: CORE_TOOL_DATE, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/protect`, lastModified: CORE_TOOL_DATE, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/redact`, lastModified: CORE_TOOL_DATE, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/unlock`, lastModified: CORE_TOOL_DATE, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/ocr`, lastModified: CORE_TOOL_DATE, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE_URL}/organize`, lastModified: CORE_TOOL_DATE, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE_URL}/watermark`, lastModified: CORE_TOOL_DATE, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/jpg-to-pdf`, lastModified: CORE_TOOL_DATE, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/pdf-to-jpg`, lastModified: CORE_TOOL_DATE, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/blog`, lastModified: CONTENT_DATE, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/about`, lastModified: CONTENT_DATE, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/contact`, lastModified: CONTENT_DATE, changeFrequency: "yearly", priority: 0.5 },
    { url: `${BASE_URL}/privacy-policy`, lastModified: LEGAL_DATE, changeFrequency: "yearly", priority: 0.5 },
    { url: `${BASE_URL}/terms`, lastModified: LEGAL_DATE, changeFrequency: "yearly", priority: 0.5 },
    { url: `${BASE_URL}/disclaimer`, lastModified: LEGAL_DATE, changeFrequency: "yearly", priority: 0.5 },
  ];

  const blogSlugs = [
    "how-to-compress-pdf-without-losing-quality",
    "merge-multiple-pdfs-into-one-free",
    "split-pdf-extract-specific-pages",
    "pdf-privacy-why-you-should-never-upload-documents-online",
    "best-pdf-tools-for-students-india",
    "pdf-file-size-reduction-tips",
  ];

  const blogPages: MetadataRoute.Sitemap = blogSlugs.map((slug) => ({
    url: `${BASE_URL}/blog/${slug}`,
    lastModified: CONTENT_DATE,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  return [...staticPages, ...blogPages];
}
