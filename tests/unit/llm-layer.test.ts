import { describe, expect, it } from "vitest";
import { z } from "zod";
import { APICallError } from "ai";
import { cooldownFromHeaders, evaluateBucket, quotaDay } from "@/lib/llm/ratelimit";
import { jsonSchemaFor, parseJsonLenient, parseStructured } from "@/lib/llm/json";
import { classifyError } from "@/lib/llm";
import { cacheKey } from "@/lib/llm/cache";
import { modelList } from "@/lib/llm/providers";
import { repairDeadlineYear } from "@/lib/pipeline/state-machine";

const limits = { rpm: 10, tpm: 10_000, rpd: 3 };
const now = new Date("2026-09-26T15:00:00Z");
const full = {
  requestTokens: limits.rpm * 1000,
  tokenTokens: limits.tpm,
  refilledAt: now,
  day: quotaDay(now),
  dayCount: 0,
  cooldownUntil: null,
};

describe("token bucket", () => {
  it("grants a request and charges one request + the estimated tokens", () => {
    const { result, next } = evaluateBucket(full, limits, 2_000, now);
    expect(result.ok).toBe(true);
    expect(next.requestTokens).toBe(9_000);
    expect(next.tokenTokens).toBe(8_000);
    expect(next.dayCount).toBe(1);
  });

  it("waits for the per-minute request budget to refill", () => {
    const { result } = evaluateBucket({ ...full, requestTokens: 400 }, limits, 100, now);
    expect(result).toMatchObject({ ok: false, reason: "rpm" });
    // 600 milli-requests at 10 rpm = 3.6 s
    expect(result.ok ? 0 : result.waitMs).toBe(3600);
  });

  it("waits for tokens, but lets an oversized request go on a full bucket", () => {
    const low = evaluateBucket({ ...full, tokenTokens: 1_000 }, limits, 5_000, now);
    expect(low.result).toMatchObject({ ok: false, reason: "tpm" });
    const huge = evaluateBucket(full, limits, 50_000, now);
    expect(huge.result.ok).toBe(true);
    expect(huge.next.tokenTokens).toBeLessThan(0);
  });

  it("refills over time, honours cooldowns and the daily cap, resets on a new quota day", () => {
    const later = new Date(now.getTime() + 30_000);
    const refilled = evaluateBucket(
      { ...full, requestTokens: 0, tokenTokens: 0 },
      limits,
      1_000,
      later,
    );
    expect(refilled.result.ok).toBe(true); // 30 s = 5 requests and 5k tokens back

    const cooling = evaluateBucket(
      { ...full, cooldownUntil: new Date(now.getTime() + 9_000) },
      limits,
      1,
      now,
    );
    expect(cooling.result).toMatchObject({ ok: false, reason: "cooldown", waitMs: 9_000 });

    const capped = evaluateBucket({ ...full, dayCount: 3 }, limits, 1, now);
    expect(capped.result).toMatchObject({ ok: false, reason: "daily" });
    const tomorrow = new Date(now.getTime() + 26 * 3_600_000);
    expect(evaluateBucket({ ...full, dayCount: 3 }, limits, 1, tomorrow).result.ok).toBe(true);
  });

  it("reads Cerebras-style limit headers", () => {
    expect(
      cooldownFromHeaders(
        { "x-ratelimit-remaining-tokens-minute": "500", "x-ratelimit-reset-tokens-minute": "12.5" },
        4_000,
      ),
    ).toBe(12_500);
    expect(
      cooldownFromHeaders(
        { "x-ratelimit-remaining-requests-day": "0", "x-ratelimit-reset-requests-day": "600" },
        1,
      ),
    ).toBe(600_000);
    expect(
      cooldownFromHeaders({ "x-ratelimit-remaining-tokens-minute": "50000" }, 4_000),
    ).toBeNull();
  });
});

describe("structured output parsing", () => {
  const Schema = z.object({ load: z.string(), eta: z.string().nullable() });

  it("accepts plain JSON, fenced JSON and JSON wrapped in prose", () => {
    expect(parseJsonLenient('{"load":"48207","eta":null}')).toEqual({ load: "48207", eta: null });
    expect(parseJsonLenient('```json\n{"load":"48207","eta":"4:30 PM"}\n```')).toMatchObject({
      eta: "4:30 PM",
    });
    expect(
      parseJsonLenient('Here is the JSON:\n{"load":"1","eta":null}\nHope it helps!'),
    ).toMatchObject({ load: "1" });
    expect(() => parseJsonLenient("Here is the JSON")).toThrow();
  });

  it("reports schema mismatches in a form short enough to feed back for repair", () => {
    const bad = parseStructured('{"load": 48207}', Schema);
    expect(bad.ok).toBe(false);
    expect(bad.ok ? "" : bad.error).toMatch(/load/);
    expect(parseStructured('{"load":"48207","eta":null}', Schema)).toEqual({
      ok: true,
      value: { load: "48207", eta: null },
    });
  });

  it("produces a strict JSON Schema without the $schema header", () => {
    const js = jsonSchemaFor(Schema);
    expect(js.$schema).toBeUndefined();
    expect(js.additionalProperties).toBe(false);
    expect(js.required).toEqual(["load", "eta"]);
  });
});

describe("failover classification", () => {
  const apiError = (status: number, body: string, headers: Record<string, string> = {}) =>
    new APICallError({
      message: "boom",
      url: "https://example.test/v1/chat/completions",
      requestBodyValues: {},
      statusCode: status,
      responseHeaders: headers,
      responseBody: body,
    });

  it("429 with Gemini retryDelay → cooldown hint", () => {
    const f = classifyError(
      apiError(
        429,
        '[{"error":{"code":429,"message":"You exceeded your current quota","details":[{"retryDelay":"37s"}]}}]',
      ),
      60_000,
    );
    expect(f).toMatchObject({ status: 429, retryAfterMs: 37_000, schemaRejected: false });
    expect(f.message).toMatch(/exceeded your current quota/);
  });

  it("Gemini per-day quota waits for the next quota day, not the 5 s retryDelay", () => {
    const body =
      '[{"error":{"code":429,"message":"You exceeded your current quota. * Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: gemini-3.7-flash Please retry in 5.7s.","details":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"},{"retryDelay":"5s"}]}}]';
    const f = classifyError(apiError(429, body), 1);
    expect(f.retryAfterMs).toBeGreaterThan(60_000);
    expect(f.message).toMatch(/limit 20 per day/);
  });

  it("Retry-After header, 503 overload and rejected response_format", () => {
    expect(classifyError(apiError(429, "{}", { "retry-after": "5" }), 1).retryAfterMs).toBe(5_000);
    expect(classifyError(apiError(503, '{"error":{"message":"high demand"}}'), 1)).toMatchObject({
      status: 503,
    });
    expect(
      classifyError(
        apiError(400, '{"error":{"message":"Invalid response_format: json_schema not supported"}}'),
        1,
      ).schemaRejected,
    ).toBe(true);
  });

  it("timeouts are transient (status 0)", () => {
    const e = new Error("The operation was aborted due to timeout");
    e.name = "TimeoutError";
    expect(classifyError(e, 90_000)).toMatchObject({ status: 0, message: "timeout after 90 s" });
  });
});

describe("demo cache key and model lists", () => {
  it("ignores the clock line, nothing else", () => {
    const a = cacheKey("customer_analysis", "I", "NOW: Saturday 10:00\nTIMELINE: x");
    const b = cacheKey("customer_analysis", "I", "NOW: Saturday 10:07\nTIMELINE: x");
    const c = cacheKey("customer_analysis", "I", "NOW: Saturday 10:07\nTIMELINE: y");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("model env vars accept failover lists", () => {
    expect(modelList(" gemini-3.7-flash, gemini-3.5-flash-lite ,gemini-3.7-flash")).toEqual([
      "gemini-3.7-flash",
      "gemini-3.5-flash-lite",
    ]);
  });
});

describe("deadline year repair", () => {
  const evidence = new Date("2026-09-25T13:52:00Z");
  it("moves a deadline written in the wrong year next to its evidence", () => {
    expect(repairDeadlineYear("2025-09-25T15:00:00-05:00", evidence)).toBe(
      "2026-09-25T20:00:00.000Z",
    );
  });
  it("keeps plausible deadlines and non-dates untouched", () => {
    expect(repairDeadlineYear("2026-09-25T15:00:00-05:00", evidence)).toBe(
      "2026-09-25T15:00:00-05:00",
    );
    expect(repairDeadlineYear("soon", evidence)).toBe("soon");
    expect(repairDeadlineYear(null, evidence)).toBeNull();
  });
  it("handles a promise across New Year", () => {
    const dec = new Date("2026-12-31T20:00:00Z");
    expect(repairDeadlineYear("2026-01-02T15:00:00Z", dec)).toBe("2027-01-02T15:00:00.000Z");
  });
});
