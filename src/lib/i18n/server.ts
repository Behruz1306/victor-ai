import { cookies } from "next/headers";
import { LANG_COOKIE, parseLang } from "./index";
import type { Lang } from "@/lib/types";

export async function getLang(): Promise<Lang> {
  return parseLang((await cookies()).get(LANG_COOKIE)?.value);
}
