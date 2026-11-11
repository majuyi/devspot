import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { siteUrl } from "@/data/site";
import "./globals.css";

// Latin subsets, downloaded at build time and served from our own origin: readers never
// contact Google. Half the bytes of the full files, which moved LCP from 2.6s to about 2s
// (decided 2026-11-11). Other subsets, such as Yoruba diacritics in latin-ext, load only
// when a page uses them. The build needs network access to Google Fonts.
const GeistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const GeistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "devspot", template: "%s · devspot" },
  description:
    "Opportunities for early-career tech people in Nigeria, read from each organisation's own page every six hours.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0e10" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only rounded-pill bg-fg px-4 py-2 text-bg focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
        >
          Skip to content
        </a>
        <SiteHeader />
        <div id="main" className="grow">
          {children}
        </div>
        <SiteFooter />
      </body>
    </html>
  );
}
