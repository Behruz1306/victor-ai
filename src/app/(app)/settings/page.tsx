import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/auth/rbac";
import { SettingsView } from "./settings-view";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await requirePage("view:settings");
  return (
    <SettingsView
      canEdit={can(ctx.role, "manage:settings")}
      canAudit={can(ctx.role, "view:audit")}
    />
  );
}
