import { describe, expect, it } from "vitest";
import { can, homeFor, navFor, PERMISSIONS } from "@/lib/auth/rbac";
import { RateLimiter } from "@/lib/auth/rate-limit";
import { isSameOrigin } from "@/lib/auth/guard";
import { readEnv } from "@/lib/env";

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

describe("login rate limiter", () => {
  it("allows 5 attempts per window then blocks, resets after window", () => {
    const rl = new RateLimiter(5, 1000);
    for (let i = 0; i < 5; i++) expect(rl.hit("k", 0)).toBe(true);
    expect(rl.hit("k", 10)).toBe(false);
    expect(rl.hit("k", 1001)).toBe(true);
  });
});

describe("same-origin check (CSRF)", () => {
  const h = (init: Record<string, string>) => new Headers(init);
  it("accepts same host", () => {
    expect(isSameOrigin(h({ origin: "http://localhost:3000", host: "localhost:3000" }))).toBe(true);
  });
  it("rejects foreign origin and cross-site fetch metadata", () => {
    expect(isSameOrigin(h({ origin: "http://evil.com", host: "localhost:3000" }))).toBe(false);
    expect(isSameOrigin(h({ "sec-fetch-site": "cross-site", host: "a" }))).toBe(false);
  });
  it("rejects requests without origin unless the browser says same-origin", () => {
    expect(isSameOrigin(h({ host: "localhost:3000" }))).toBe(false);
    expect(isSameOrigin(h({ host: "localhost:3000", "sec-fetch-site": "same-origin" }))).toBe(true);
  });
});

describe("env / provider selection", () => {
  it("falls back to mock without keys", () => {
    expect(readEnv({} as unknown as NodeJS.ProcessEnv).llm.provider).toBe("mock");
  });
  it("uses anthropic with a key and openai-compatible with base url + key", () => {
    expect(readEnv({ ANTHROPIC_API_KEY: "x" } as unknown as NodeJS.ProcessEnv).llm.provider).toBe("anthropic");
    expect(
      readEnv({
        LLM_BASE_URL: "https://openrouter.ai/api/v1",
        LLM_API_KEY: "y",
      } as unknown as NodeJS.ProcessEnv).llm.provider,
    ).toBe("openai-compatible");
  });
  it("forced real provider without credentials degrades to mock", () => {
    expect(readEnv({ LLM_PROVIDER: "anthropic" } as unknown as NodeJS.ProcessEnv).llm.provider).toBe("mock");
  });
  it("refuses a weak session secret in production", () => {
    expect(() =>
      readEnv({ NODE_ENV: "production", SESSION_SECRET: "short" } as unknown as NodeJS.ProcessEnv),
    ).toThrow();
  });
});
