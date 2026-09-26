import { getDb, type Db } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";

export type AuditAction =
  | "login"
  | "login_failed"
  | "logout"
  | "suggestion_approved"
  | "suggestion_edited"
  | "suggestion_dismissed"
  | "rule_approved"
  | "rule_rejected"
  | "rule_edited"
  | "handoff_created"
  | "handoff_confirmed"
  | "settings_changed"
  | "channel_mapped"
  | "consent_posted"
  | "export_tasks"
  | "transcript_uploaded"
  | "demo_reset"
  | "demo_loaded"
  | "demo_replay";

export async function audit(
  entry: {
    companyId: string;
    userId: string | null;
    action: AuditAction;
    target?: string | null;
    meta?: Record<string, unknown>;
  },
  db: Db = getDb(),
): Promise<void> {
  await db.insert(auditLog).values({
    companyId: entry.companyId,
    userId: entry.userId,
    action: entry.action,
    target: entry.target ?? null,
    meta: entry.meta ?? {},
  });
}
