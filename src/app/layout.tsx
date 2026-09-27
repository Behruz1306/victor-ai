import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Providers } from "@/components/providers";
import { BRAND, THEME_COOKIE } from "@/lib/brand";
import { env } from "@/lib/env";
import { LANG_COOKIE, parseLang } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(env().appUrl),
  title: { default: `${BRAND.name} — customer work, driven to done`, template: `%s · ${BRAND.name}` },
  description: BRAND.tagline.en,
  applicationName: BRAND.name,
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: { url: "/apple-icon.png", sizes: "180x180" },
  },
  openGraph: {
    type: "website",
    siteName: BRAND.name,
    title: BRAND.name,
    description: BRAND.tagline.en,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: `${BRAND.name} — ${BRAND.tagline.en}` }],
  },
  twitter: { card: "summary_large_image", title: BRAND.name, description: BRAND.tagline.en, images: ["/og.png"] },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d12" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const lang = parseLang(jar.get(LANG_COOKIE)?.value);
  const theme = jar.get(THEME_COOKIE)?.value === "dark" ? "dark" : "light";
  return (
    <html
      lang={lang}
      className={`${GeistSans.variable} ${GeistMono.variable}${theme === "dark" ? " dark" : ""}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen">
        <Providers lang={lang} theme={theme}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
