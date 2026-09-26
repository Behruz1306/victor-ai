import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/guard";
import { homeFor } from "@/lib/auth/rbac";

export default async function Home() {
  const ctx = await currentUser();
  redirect(ctx ? homeFor(ctx.role) : "/login");
}
