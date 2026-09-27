import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { analysisRuns, customers, llmLimits } from "@/lib/db/schema";
import { seedDemo } from "@/lib/demo/seed";
import { buildAnalysisContext, type AnalysisContext } from "@/lib/pipeline/context";
import { generateStructured, withLlmOverride } from "@/lib/llm";
import { CustomerAnalysis } from "@/lib/llm/schemas";
import { ANALYSIS_INSTRUCTIONS, renderAnalysisPrompt } from "@/lib/llm/prompts/analysis";
import { MOCK_PROVIDER, type ProviderConfig } from "@/lib/llm/providers";
import { resetDatabase } from "./helpers";

// The real structured-output path (AI SDK → OpenAI-compatible HTTP) against a local fake
// provider that replays a RECORDED real model answer (gemini-3.5-flash-lite, text only).
const FIXTURE = readFileSync(
  path.resolve(
    import.meta.dirname,
    "../fixtures/llm/customer-analysis.gemini-3.5-flash-lite.apex.json",
  ),
  "utf8",
);
const NOW = new Date("2026-09-26T15:00:00Z");
const db = getDb();

type Reply = { status: number; body: unknown; headers?: Record<string, string> };
let script: Reply[] = [];
const requests: Record<string, unknown>[] = [];
let server: Server;
let baseUrl = "";

const completion = (content: string) => ({
  id: "chatcmpl-test",
  object: "chat.completion",
  created: 1_790_000_000,
  model: "fake-model",
  choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }],
  usage: { prompt_tokens: 5200, completion_tokens: 1800, total_tokens: 7000 },
});

let companyId = "";
let ctx: AnalysisContext;

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      requests.push(JSON.parse(raw || "{}") as Record<string, unknown>);
      const r = script.shift() ?? { status: 500, body: { error: { message: "script exhausted" } } };
      res.writeHead(r.status, { "content-type": "application/json", ...(r.headers ?? {}) });
      res.end(JSON.stringify(r.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}/v1`;

  await resetDatabase();
  ({ companyId } = await seedDemo(db, NOW));
  const [apex] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.companyId, companyId), eq(customers.name, "Apex Logistics")));
  ctx = (await buildAnalysisContext(db, companyId, apex!.id, NOW))!;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(async () => {
  script = [];
  requests.length = 0;
  await db.delete(llmLimits);
  await db.delete(analysisRuns).where(eq(analysisRuns.companyId, companyId));
});

const fake = (): ProviderConfig => ({
  id: "openai",
  label: "Fake",
  kind: "openai-compatible",
  baseUrl,
  apiKey: "test-key-not-a-secret-0000000000",
  model: "fake-model",
  fastModel: "fake-model",
  models: ["fake-model"],
  fastModels: ["fake-model"],
});

const analyze = (chain: ProviderConfig[]) =>
  withLlmOverride({ chain, cache: false }, () =>
    generateStructured(
      CustomerAnalysis,
      { instructions: ANALYSIS_INSTRUCTIONS, prompt: renderAnalysisPrompt(ctx.input) },
      {
        model: "main",
        task: "customer_analysis",
        mockInput: ctx.input,
        log: { db, companyId, customerId: ctx.customer.id },
        maxWaitMs: 2_000,
      },
    ),
  );

const runs = () => db.select().from(analysisRuns).where(eq(analysisRuns.companyId, companyId));

describe("structured output with a recorded real response", () => {
  it("strict JSON Schema request → recorded answer validates (even wrapped in prose)", async () => {
    script = [
      { status: 200, body: completion(`Here is the analysis:\n\`\`\`json\n${FIXTURE}\n\`\`\``) },
    ];
    const out = await analyze([fake()]);
    expect(out?.quality_flags.map((f) => f.kind).sort()).toEqual([
      "complaint",
      "eta_not_forwarded",
      "rude_tone",
    ]);
    expect(out?.suggestions[0]?.text).toMatch(/48207/);
    const rf = requests[0]!.response_format as { type: string; json_schema: { strict: boolean } };
    expect(rf.type).toBe("json_schema");
    expect(rf.json_schema.strict).toBe(true);
    const [row] = await runs();
    expect(row).toMatchObject({
      provider: "openai",
      model: "fake-model",
      ok: true,
      inputTokens: 5200,
    });
  });

  it("invalid answer → one repair attempt with the validation error → valid", async () => {
    script = [
      { status: 200, body: completion('{"task_updates": "not a list"}') },
      { status: 200, body: completion(FIXTURE) },
    ];
    const out = await analyze([fake()]);
    expect(out?.task_updates.length).toBeGreaterThan(5);
    expect(requests).toHaveLength(2);
    expect(JSON.stringify(requests[1]!.messages)).toContain("YOUR PREVIOUS ANSWER WAS REJECTED");
  });

  it("provider rejects strict JSON Schema → JSON mode with the schema in the instructions", async () => {
    script = [
      {
        status: 400,
        body: { error: { message: "response_format json_schema is not supported for this model" } },
      },
      { status: 200, body: completion(FIXTURE) },
    ];
    const out = await analyze([fake()]);
    expect(out).not.toBeNull();
    expect((requests[1]!.response_format as { type: string }).type).toBe("json_object");
    expect(JSON.stringify(requests[1]!.messages)).toContain("OUTPUT FORMAT");
  });

  it("two invalid answers → graceful skip to the next provider (mock), both attempts logged", async () => {
    script = [
      { status: 200, body: completion("I cannot help with that.") },
      { status: 200, body: completion("Still no JSON, sorry.") },
    ];
    const out = await analyze([fake(), MOCK_PROVIDER]);
    expect(out?.suggestions.length).toBeGreaterThan(0); // mock answer
    const rows = await runs();
    expect(rows.find((r) => r.provider === "openai")).toMatchObject({ ok: false });
    expect(rows.find((r) => r.provider === "mock")?.error).toMatch(/^fallback: openai\/fake-model/);
  });
});

describe("failover", () => {
  it("503 overload is retried, then succeeds on the same provider", async () => {
    const busy: Reply = {
      status: 503,
      body: { error: { message: "high demand" } },
      headers: { "retry-after": "0" },
    };
    script = [busy, { status: 200, body: completion(FIXTURE) }];
    const out = await analyze([fake(), MOCK_PROVIDER]);
    expect(out?.quality_flags.length).toBe(3);
    expect(requests).toHaveLength(2);
  });

  it("429 with a long retryDelay → no hammering: cooldown recorded, mock answers", async () => {
    script = [
      {
        status: 429,
        body: [
          {
            error: {
              code: 429,
              message: "You exceeded your current quota",
              details: [{ retryDelay: "120s" }],
            },
          },
        ],
      },
    ];
    const out = await analyze([fake(), MOCK_PROVIDER]);
    expect(out).not.toBeNull();
    expect(requests).toHaveLength(1);
    const [limit] = await db.select().from(llmLimits).where(eq(llmLimits.key, "openai:fake-model"));
    expect(limit!.lastStatus).toBe(429);
    expect(limit!.cooldownUntil!.getTime() - Date.now()).toBeGreaterThan(100_000);
    // The next call skips the cooling provider without sending a request.
    requests.length = 0;
    await analyze([fake(), MOCK_PROVIDER]);
    expect(requests).toHaveLength(0);
  });

  it("without a fallback the call returns null instead of throwing", async () => {
    script = [
      { status: 500, body: { error: { message: "boom" } }, headers: { "retry-after": "0" } },
    ];
    script.push(...script, ...script);
    expect(await analyze([fake()])).toBeNull();
  });
});
