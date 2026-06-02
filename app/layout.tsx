import type { Metadata } from "next";
import "./globals.css";
import ThemeProvider from "./components/ThemeProvider";
import FileHistoryProvider from "./components/FileHistoryProvider";
import ToastManager from "./components/ToastManager";
import CookieConsent from "./components/CookieConsent";

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
  // verification: {
  //   google: "REPLACE_WITH_REAL_TOKEN_FROM_GOOGLE_SEARCH_CONSOLE",
  //   // Go to search.google.com/search-console → Add Property → HTML tag method
  // },
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
      className="h-full scroll-smooth antialiased"
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (localStorage.theme === 'light') {
                  document.documentElement.classList.add('light')
                } else {
                  document.documentElement.classList.remove('light')
                }
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <ThemeProvider>
          <FileHistoryProvider>
            {children}
            <ToastManager />
          </FileHistoryProvider>
        </ThemeProvider>
        <CookieConsent />
      </body>
    </html>
  );
}
