import type { Role } from "@/lib/db/schema";

// Single permission matrix. Every page, route handler and job trigger checks one of these.
export const PERMISSIONS = {
  "view:dispatcher": ["dispatcher", "lead", "owner"],
  "act:suggestion": ["dispatcher", "lead", "owner"],
  "view:task": ["dispatcher", "lead", "owner"],
  "view:lead": ["lead", "owner"],
  "manage:handoff": ["lead", "owner"],
  "view:owner": ["owner"],
  "view:playbook": ["dispatcher", "lead", "owner"],
  "manage:rules": ["lead", "owner"],
  "view:sources": ["lead", "owner"],
  "manage:sources": ["lead", "owner"],
  "view:settings": ["lead", "owner"],
  "manage:settings": ["owner"],
  "view:audit": ["owner"],
  "manage:demo": ["owner"],
  "upload:transcript": ["dispatcher", "lead", "owner"],
  "export:tasks": ["lead", "owner"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

/** Landing page after login for each role. */
export function homeFor(role: Role): string {
  if (role === "owner") return "/owner";
  if (role === "lead") return "/lead";
  return "/dispatcher";
}

export type NavItem = { href: string; key: string; permission: Permission; demoOnly?: boolean };

export const NAV: NavItem[] = [
  { href: "/owner", key: "nav.owner", permission: "view:owner" },
  { href: "/lead", key: "nav.lead", permission: "view:lead" },
  { href: "/dispatcher", key: "nav.dispatcher", permission: "view:dispatcher" },
  { href: "/playbook", key: "nav.playbook", permission: "view:playbook" },
  { href: "/sources", key: "nav.sources", permission: "view:sources" },
  { href: "/settings", key: "nav.settings", permission: "view:settings" },
  { href: "/demo", key: "nav.demo", permission: "manage:demo", demoOnly: true },
];

export function navFor(role: Role, demoMode: boolean): NavItem[] {
  return NAV.filter((n) => can(role, n.permission) && (!n.demoOnly || demoMode));
}
