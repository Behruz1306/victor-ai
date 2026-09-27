import { describe, expect, it } from "vitest";
import { can, homeFor, navFor, PERMISSIONS } from "@/lib/auth/rbac";
import { isSameOrigin } from "@/lib/auth/guard";
import { readEnv, resolveSessionSecret } from "@/lib/env";
import { providerChain } from "@/lib/llm/providers";

describe("rbac", () => {
  it("owner sees owner screen, dispatcher does not", () => {
    expect(can("owner", "view:owner")).toBe(true);
    expect(can("lead", "view:owner")).toBe(false);
    expect(can("dispatcher", "view:owner")).toBe(false);
  });
  it("only lead/owner manage rules and handoffs; only owner changes settings", () => {
    expect(can("dispatcher", "manage:rules")).toBe(false);
    expect(can("lead", "manage:rules")).toBe(true);
    expect(can("lead", "manage:settings")).toBe(false);
    expect(can("owner", "manage:settings")).toBe(true);
    expect(can("dispatcher", "manage:handoff")).toBe(false);
  });
  it("every permission lists at least one role", () => {
    for (const roles of Object.values(PERMISSIONS)) expect(roles.length).toBeGreaterThan(0);
  });
  it("home and nav are role-aware; demo nav only in demo mode", () => {
    expect(homeFor("dispatcher")).toBe("/dispatcher");
    expect(homeFor("owner")).toBe("/owner");
    expect(navFor("dispatcher", true).map((n) => n.href)).toEqual(["/dispatcher", "/playbook"]);
    expect(navFor("owner", false).some((n) => n.href === "/demo")).toBe(false);
    expect(navFor("owner", true).some((n) => n.href === "/demo")).toBe(true);
  });
});

describe("same-origin check (CSRF)", () => {
  const h = (init: Record<string, string>) => new Headers(init);
  it("accepts same host", () => {
    expect(isSameOrigin(h({ origin: "http://localhost:3001", host: "localhost:3001" }))).toBe(true);
  });
  it("rejects foreign origin and cross-site fetch metadata", () => {
    expect(isSameOrigin(h({ origin: "http://evil.com", host: "localhost:3001" }))).toBe(false);
    expect(isSameOrigin(h({ "sec-fetch-site": "cross-site", host: "a" }))).toBe(false);
  });
  it("rejects requests without origin unless the browser says same-origin", () => {
    expect(isSameOrigin(h({ host: "localhost:3001" }))).toBe(false);
    expect(isSameOrigin(h({ host: "localhost:3001", "sec-fetch-site": "same-origin" }))).toBe(true);
  });
});

describe("env / provider chain", () => {
  const E = (v: Record<string, string>) => readEnv(v as unknown as NodeJS.ProcessEnv);
  const ids = (v: Record<string, string>) => providerChain(E(v).llm).map((p) => p.id);
  const KEY = "k".repeat(40);
  it("falls back to mock without keys", () => {
    expect(ids({})).toEqual(["mock"]);
  });
  it("Cerebras first, Gemini second, mock last; Anthropic leads only when keyed", () => {
    expect(ids({ LLM_BASE_URL: "https://api.cerebras.ai/v1", LLM_API_KEY: KEY, GEMINI_API_KEY: KEY })).toEqual([
      "cerebras",
      "gemini",
      "mock",
    ]);
    expect(ids({ ANTHROPIC_API_KEY: KEY, GEMINI_API_KEY: KEY })).toEqual(["anthropic", "gemini", "mock"]);
  });
  it("LLM_PROVIDER=mock forces offline mode even with keys", () => {
    expect(ids({ GEMINI_API_KEY: KEY, LLM_PROVIDER: "mock" })).toEqual(["mock"]);
  });
  it("treats placeholder keys (non-ASCII, too short) as missing and says so", () => {
    const e = E({ LLM_BASE_URL: "https://api.cerebras.ai/v1", LLM_API_KEY: "ключ-cerebras", TELEGRAM_BOT_TOKEN: "токен" });
    expect(providerChain(e.llm).map((p) => p.id)).toEqual(["mock"]);
    expect(e.telegram.token).toBeUndefined();
    expect(e.warnings.join(" ")).toMatch(/LLM_API_KEY looks like a placeholder/);
    expect(e.warnings.join(" ")).toMatch(/TELEGRAM_BOT_TOKEN looks like a placeholder/);
    expect(e.warnings.join(" ")).not.toContain("ключ");
  });
  it("accepts a BotFather-shaped token", () => {
    expect(E({ TELEGRAM_BOT_TOKEN: `123456789:${"A".repeat(35)}` }).telegram.token).toBeDefined();
  });
  it("an old Claude LLM_MODEL does not leak into the OpenAI-compatible provider", () => {
    const e = E({ LLM_BASE_URL: "https://api.cerebras.ai/v1", LLM_API_KEY: KEY, LLM_MODEL: "claude-sonnet-5" });
    expect(e.llm.model).not.toMatch(/claude/);
    expect(e.llm.anthropicModel).toBe("claude-sonnet-5");
  });
  it("refuses a weak session secret in production, allows a dev fallback locally", () => {
    expect(() => resolveSessionSecret("short", true)).toThrow();
    expect(resolveSessionSecret("", false).length).toBeGreaterThanOrEqual(32);
    const strong = "x".repeat(40);
    expect(resolveSessionSecret(strong, true)).toBe(strong);
  });
  it("the worker can read env in production without a session secret", () => {
    expect(() => readEnv({ NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv)).not.toThrow();
  });
});
