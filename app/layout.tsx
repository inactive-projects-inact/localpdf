import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import ThemeProvider from "./components/ThemeProvider";
import FileHistoryProvider from "./components/FileHistoryProvider";
import ToastManager from "./components/ToastManager";
import { ADSENSE_PUBLISHER_NUM } from "./lib/adsense-config";
import { spaceGrotesk, inter, ibmPlexMono } from "./lib/fonts";

export const metadata: Metadata = {
  title: {
    default: "Localpdf — Your PDFs. Done in Seconds. Right in Your Browser.",
    template: "%s | Localpdf",
  },
  description:
    "Free online PDF tools that work entirely in your browser. Compress, merge, and split PDFs instantly with no uploads, no registration, and no data stored.",
  keywords: [
    "PDF tools",
    "compress PDF",
    "merge PDF",
    "split PDF",
    "free PDF tools",
    "online PDF",
    "PDF compressor",
    "PDF merger",
    "PDF splitter",
    "browser PDF tool",
    "PDF tools India",
    "free PDF compress",
  ],
  authors: [{ name: "LocalPDF" }],
  creator: "LocalPDF",
  metadataBase: new URL("https://localpdf.dev"),
  alternates: { canonical: "https://localpdf.dev" },
  manifest: "/manifest.json",
  openGraph: {
    type: "website",
    siteName: "LocalPDF",
    title: "LocalPDF — Free Online PDF Tools | Compress Merge Split",
    description:
      "Free online PDF tools that work entirely in your browser. Compress, merge, and split PDFs instantly with no uploads, no registration, and no data stored.",
    url: "https://localpdf.dev",
    images: [
      { url: "/og-image.png", width: 1200, height: 630, alt: "LocalPDF — Free Online PDF Tools" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "LocalPDF — Free Online PDF Tools | Compress Merge Split",
    description:
      "Free online PDF tools that work entirely in your browser. Compress, merge, and split PDFs instantly with no uploads, no registration, and no data stored.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${inter.variable} ${ibmPlexMono.variable} h-full scroll-smooth antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* --- GOOGLE ANALYTICS INTEGRATION --- */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-WP7JP34538"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-WP7JP34538');
          `}
        </Script>
        {/* ------------------------------------ */}

        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                document.documentElement.classList.add('light')
              } catch (_) {}
            `,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('consent', 'default', {
                'ad_storage': 'denied',
                'ad_user_data': 'denied',
                'ad_personalization': 'denied',
                'analytics_storage': 'denied',
                'wait_for_update': 500
              });
              window.adsbygoogle = window.adsbygoogle || [];
              adsbygoogle.pauseAdRequests = 1;
            `,
          }}
        />
        <Script
          id="google-privacy-messaging-cmp"
          src={`https://fundingchoicesmessages.google.com/i/pub-${ADSENSE_PUBLISHER_NUM}?ers=1`}
          strategy="beforeInteractive"
        />
      </head>
      <body className="min-h-full flex flex-col font-body">
        <ThemeProvider>
          <FileHistoryProvider>
            <div className="sticky top-0 z-50 border-b border-amber-700 bg-amber-400 px-4 py-3 text-center text-sm font-bold leading-relaxed text-slate-950 shadow-md sm:px-6">
              <span className="text-base uppercase tracking-wider block sm:inline sm:mr-2">Domain sale for $5:</span>
              localpdf.dev is available for immediate transfer ($5 USD / ₹450 INR). Registered at Name.com (valid through May 27, 2027) — instant, free account-to-account push. Contact / Verified Owner:{" "}
              <a
                href="mailto:jyotishpabbisetti2025@gmail.com?subject=localpdf.dev%20Domain%20Purchase"
                className="underline decoration-2 underline-offset-2 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-400"
              >
                jyotishpabbisetti2025@gmail.com
              </a>
            </div>
            {children}
            <ToastManager />
          </FileHistoryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}