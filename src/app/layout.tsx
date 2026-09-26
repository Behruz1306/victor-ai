import type { Metadata } from "next";
import { cookies } from "next/headers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Providers } from "@/components/providers";
import { BRAND } from "@/lib/brand";
import { LANG_COOKIE, parseLang } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: BRAND.name, template: `%s · ${BRAND.name}` },
  description: BRAND.tagline.en,
  icons: { icon: "/icon.svg" },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const lang = parseLang(jar.get(LANG_COOKIE)?.value);
  const dark = jar.get("pulse_theme")?.value === "dark";
  return (
    <html
      lang={lang}
      className={`${GeistSans.variable} ${GeistMono.variable}${dark ? " dark" : ""}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen">
        <Providers lang={lang}>{children}</Providers>
      </body>
    </html>
  );
}
