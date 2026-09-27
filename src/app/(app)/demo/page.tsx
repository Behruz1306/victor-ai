import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/guard";
import { env } from "@/lib/env";
import { DemoView } from "./demo-view";

export const metadata = { title: "Demo control" };

export default async function DemoPage() {
  if (!env().demoMode) notFound();
  await requirePage("manage:demo");
  return <DemoView />;
}
