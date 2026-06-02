import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Prevent crawlers from indexing Next.js internals
        disallow: ["/_next/", "/api/"],
      },
    ],
    sitemap: "https://localpdf.dev/sitemap.xml",
    host: "https://localpdf.dev",
  };
}
