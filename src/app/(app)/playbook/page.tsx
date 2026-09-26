import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/auth/rbac";
import { PlaybookView } from "./playbook-view";

export const metadata = { title: "Playbook" };

export default async function PlaybookPage() {
  const ctx = await requirePage("view:playbook");
  return <PlaybookView canManage={can(ctx.role, "manage:rules")} />;
}
