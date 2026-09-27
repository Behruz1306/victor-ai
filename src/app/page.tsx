import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { currentUser } from "@/lib/auth/guard";
import { homeFor } from "@/lib/auth/rbac";
import { getLang } from "@/lib/i18n/server";
import { THEME_COOKIE } from "@/lib/brand";
import { Landing } from "./landing";

/** Signed in → your screen. Signed out → the product page for the jury. */
export default async function Home() {
  const ctx = await currentUser();
  if (ctx) redirect(homeFor(ctx.role));
  const lang = await getLang();
  const theme = (await cookies()).get(THEME_COOKIE)?.value === "dark" ? "dark" : "light";
  return <Landing lang={lang} theme={theme} />;
}
