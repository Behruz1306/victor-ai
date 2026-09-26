// Enum values shared by the DB schema, zod schemas and client components (no DB imports here).
export const ROLES = ["owner", "lead", "dispatcher"] as const;
export const CUSTOMER_KINDS = ["broker", "shipper", "other"] as const;
export const SOURCES = ["telegram", "email", "call", "demo"] as const;
export const CHAT_TYPES = ["customer", "internal", "fleet", "billing", "support"] as const;
export const SIDES = ["customer", "employee", "bot", "unknown"] as const;
export const TASK_KINDS = [
  "quote",
  "truck_availability",
  "eta_update",
  "pod_bol",
  "detention",
  "invoice",
  "reschedule",
  "breakdown",
  "other",
] as const;
export const TASK_STATUSES = [
  "received",
  "acknowledged",
  "in_progress",
  "deadline_set",
  "delivered",
  "cancelled",
] as const;
export const SIGNAL_KINDS = [
  "reply_needed",
  "no_ack",
  "missing_deadline",
  "overdue",
  "eta_not_forwarded",
  "rude_tone",
  "complaint",
  "context_ignored",
  "customer_silent",
] as const;
export const AUDIENCES = ["dispatcher", "lead", "owner"] as const;
export const SUGGESTION_INTENTS = [
  "reply_customer",
  "ask_fleet_eta",
  "remind_task",
  "confirm_task",
  "apologize_and_fix",
  "escalate",
] as const;
export const SUGGESTION_STATUSES = [
  "pending",
  "approved",
  "edited",
  "dismissed",
  "superseded",
] as const;
export const RULE_SCOPES = ["company", "customer", "chat_type"] as const;
export const RULE_STATUSES = ["active", "proposed", "rejected"] as const;
export const ACTORS = ["ai", "user", "sla"] as const;
