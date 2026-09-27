// pnpm eval — runs the Apex "yesterday" scenario through each shortlisted real model and checks
// the outcomes the demo depends on. Uses its own database (victor_eval), never the demo data.
//   pnpm eval                               shortlist of every configured provider + mock baseline
//   pnpm eval -- --models gemini:gemini-3.8-flash,mock
//   pnpm eval -- --out docs/EVAL.md --round 2    append the table to the eval log
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "node:path";
import { appendFileSync } from "node:fs";

const EVAL_URL =
  process.env.EVAL_DATABASE_URL ??
  (process.env.DATABASE_URL ?? "postgres://pulse:pulse@localhost:5433/pulse").replace(
    /\/[^/?]+(\?|$)/,
    "/victor_eval$1",
  );
process.env.DATABASE_URL = EVAL_URL; // before anything touches getDb()

const NOW = new Date("2026-09-26T15:00:00Z"); // Saturday 10:00 CDT; "yesterday" is Friday

/** 2–3 strongest general models per provider (from GET /models, see docs/EVAL.md) + fast ones. */
const SHORTLIST: Record<string, string[]> = {
  cerebras: ["gpt-oss-120b", "qwen-3-235b-a22b-instruct-2507", "llama-3.3-70b", "llama3.1-8b"],
  gemini: [
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
  ],
  anthropic: ["claude-sonnet-5", "claude-haiku-4-5-20251001"],
};

type Check = { id: string; label: string; pass: boolean; detail: string };
type Row = {
  candidate: string;
  checks: Check[];
  analysisCalls: number;
  avgLatencyMs: number;
  totalLatencyMs: number;
  inputTokens: number;
  outputTokens: number;
  failedCalls: number;
  errors: string[];
};

async function ensureDb() {
  const target = new URL(EVAL_URL);
  const name = target.pathname.slice(1);
  const admin = new URL(EVAL_URL);
  admin.pathname = "/postgres";
  const sql = postgres(admin.toString(), { max: 1, onnotice: () => {} });
  const exists = await sql`select 1 from pg_database where datname = ${name}`;
  if (!exists.length) await sql.unsafe(`create database "${name.replace(/"/g, "")}"`);
  await sql.end();
  const client = postgres(EVAL_URL, { max: 1, onnotice: () => {} });
  await migrate(drizzle(client), {
    migrationsFolder: path.resolve(import.meta.dirname, "../drizzle"),
  });
  await client.end();
}

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  return { models: get("--models"), out: get("--out"), round: get("--round"), note: get("--note") };
}

async function main() {
  const { models, out, round, note } = parseArgs();
  await ensureDb();
  // Imported after DATABASE_URL points at the eval database.
  const { getDb, closeDb } = await import("@/lib/db/client");
  const { sql, and, eq } = await import("drizzle-orm");
  const schema = await import("@/lib/db/schema");
  const { seedDemo } = await import("@/lib/demo/seed");
  const { analyzeCustomer } = await import("@/lib/pipeline/analyze");
  const { runSla } = await import("@/lib/pipeline/sla-apply");
  const { editSuggestion } = await import("@/lib/pipeline/suggestion-actions");
  const { generateOwnerDigest } = await import("@/lib/pipeline/digest");
  const { withLlmOverride } = await import("@/lib/llm");
  const { realProviders, MOCK_PROVIDER } = await import("@/lib/llm/providers");
  const db = getDb();
  if (!/victor_eval/.test(process.env.DATABASE_URL ?? ""))
    throw new Error("refusing to run outside victor_eval");

  const providers = realProviders();
  const candidates: { label: string; provider: (typeof providers)[number] }[] = [];
  const wanted = models
    ? models
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [
        ...providers.flatMap((p) => (SHORTLIST[p.id] ?? [p.model]).map((m) => `${p.id}:${m}`)),
        "mock",
      ];
  for (const w of wanted) {
    if (w === "mock") {
      candidates.push({ label: "mock", provider: MOCK_PROVIDER });
      continue;
    }
    const [pid, ...rest] = w.split(":");
    const model = rest.join(":");
    const p = providers.find((x) => x.id === pid);
    if (!p) {
      console.log(`skip ${w}: provider ${pid} is not configured (missing or placeholder key)`);
      continue;
    }
    candidates.push({
      label: `${pid}:${model}`,
      provider: { ...p, model, fastModel: model, models: [model], fastModels: [model] },
    });
  }

  const rows: Row[] = [];
  for (const c of candidates) {
    console.log(`\n=== ${c.label} ===`);
    await db.execute(sql`truncate companies, jobs, system_state restart identity cascade`);
    const { companyId } = await seedDemo(db, NOW);
    const all = await db
      .select()
      .from(schema.customers)
      .where(eq(schema.customers.companyId, companyId));
    const apex = all.find((x) => x.name === "Apex Logistics")!;
    const glf = all.find((x) => x.name === "Great Lakes Foods")!;
    const [timurU] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, "timur@demo.victor.ai"));
    const timur = {
      userId: timurU!.id,
      companyId,
      role: "dispatcher" as const,
      name: timurU!.name,
      email: timurU!.email,
    };
    const checks: Check[] = [];
    const add = (id: string, label: string, pass: boolean, detail = "") => {
      checks.push({ id, label, pass, detail });
      console.log(`${pass ? "PASS" : "FAIL"} ${id} ${label}${detail ? ` — ${detail}` : ""}`);
    };

    await withLlmOverride({ chain: [c.provider], cache: false }, async () => {
      for (const cust of all) {
        const t = Date.now();
        const r = await analyzeCustomer(db, companyId, cust.id, NOW);
        console.log(`  analyzed ${cust.name} in ${Date.now() - t} ms${r ? "" : " (no result)"}`);
      }
      await runSla(db, companyId, NOW);

      const tasks = await db
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.companyId, companyId));
      const byRef = (ref: string) =>
        tasks.find((t) => (t.ref ?? "").includes(ref)) ??
        tasks.find((t) => t.title.en.includes(ref));
      const open = async (kind: string, customerId = apex.id) =>
        db
          .select({ s: schema.signals, text: schema.messages.text })
          .from(schema.signals)
          .leftJoin(schema.messages, eq(schema.messages.id, schema.signals.evidenceMessageId))
          .where(
            and(
              eq(schema.signals.companyId, companyId),
              eq(schema.signals.customerId, customerId),
              eq(schema.signals.status, "open"),
              eq(schema.signals.kind, kind as "overdue"),
            ),
          );

      const t30 = byRef("48230");
      const md = await open("missing_deadline");
      add(
        "1",
        "48230 stuck at acknowledged",
        t30?.status === "acknowledged" && md.some((x) => x.s.taskId === t30.id),
        `status=${t30?.status ?? "no task"}, missing_deadline=${md.length}`,
      );

      const t07 = byRef("48207");
      const enf = await open("eta_not_forwarded");
      add(
        "2",
        "eta_not_forwarded (48207)",
        Boolean(
          t07 &&
          t07.status !== "delivered" &&
          enf.some((x) => x.s.taskId === t07.id && /16:30/.test(x.text ?? "")),
        ),
        `task=${t07?.status ?? "none"}, signals=${enf.length}`,
      );

      const t90 = byRef("48190");
      const od = await open("overdue");
      add(
        "3",
        "48190 POD overdue",
        Boolean(
          t90 &&
          t90.status === "deadline_set" &&
          t90.deadlineAt?.toISOString() === "2026-09-25T20:00:00.000Z" &&
          od.some((x) => x.s.taskId === t90.id),
        ),
        `status=${t90?.status ?? "none"}, deadline=${t90?.deadlineAt?.toISOString() ?? "-"}, overdue=${od.length}`,
      );

      const comp = await open("complaint");
      add(
        "4",
        "complaint flagged",
        comp.some((x) => /third time we are chasing/.test(x.text ?? "")),
        `signals=${comp.length}`,
      );

      const rude = await open("rude_tone");
      add(
        "5",
        "rude tone flagged (Timur)",
        rude.some(
          (x) => /Stop spamming/.test(x.text ?? "") && x.s.responsibleUserId === timur.userId,
        ),
        `signals=${rude.length}`,
      );

      const t21 = byRef("48221");
      const s21 = t21
        ? (
            await db
              .select()
              .from(schema.signals)
              .where(and(eq(schema.signals.taskId, t21.id), eq(schema.signals.status, "open")))
          ).length
        : -1;
      const path21 = t21
        ? (
            await db
              .select()
              .from(schema.taskEvents)
              .where(eq(schema.taskEvents.taskId, t21.id))
              .orderBy(schema.taskEvents.at)
          )
            .map((e) => e.toStatus)
            .join("→")
        : "";
      add(
        "6",
        "48221 delivered cleanly",
        t21?.status === "delivered" && s21 === 0,
        `path=${path21 || "none"}`,
      );

      const glfSignals = await db
        .select()
        .from(schema.signals)
        .where(and(eq(schema.signals.customerId, glf.id), eq(schema.signals.status, "open")));
      add(
        "6b",
        "clean customer has no signals",
        glfSignals.length === 0,
        `open=${glfSignals.length}`,
      );

      // The broker suggestion carries the ETA that only existed in the Russian fleet chat.
      const [custChan] = await db
        .select()
        .from(schema.channels)
        .where(
          and(eq(schema.channels.customerId, apex.id), eq(schema.channels.chatType, "customer")),
        );
      const pending = await db
        .select()
        .from(schema.suggestions)
        .where(
          and(
            eq(schema.suggestions.channelId, custChan!.id),
            eq(schema.suggestions.status, "pending"),
          ),
        );
      const eta = pending.find(
        (s) => /48207/.test(s.proposedText) && /4:30|16:30/.test(s.proposedText),
      );
      let usedFleet = false;
      if (eta?.usedContext.messageIds.length) {
        const used = await db
          .select({ text: schema.messages.text, channelId: schema.messages.channelId })
          .from(schema.messages)
          .where(sql`${schema.messages.id} in ${eta.usedContext.messageIds}`);
        usedFleet = used.some((u) => /трак 214|16:30/.test(u.text));
      }
      add(
        "7",
        "ETA suggestion uses the Fleet message",
        Boolean(eta && usedFleet),
        eta
          ? `"${eta.proposedText.slice(0, 90)}"`
          : `no ETA suggestion (${pending.length} pending)`,
      );

      // Edit with a reason → learned rule → next suggestion follows it.
      let ruleOk = false;
      let followOk = false;
      let followDetail = "no ETA suggestion to edit";
      if (eta) {
        const edited = /around 4:30 PM/.test(eta.proposedText)
          ? eta.proposedText.replace("around 4:30 PM", "4:30 PM CST")
          : `${eta.proposedText.replace(/\b(4:30|16:30)( ?PM)?\b/, "4:30 PM CST")}`;
        const res = await editSuggestion(
          db,
          timur,
          eta.id,
          edited.includes("CST") ? edited : `${edited} (4:30 PM CST, truck #214)`,
          "Apex wants ETA in CST and with the truck number",
        );
        const rule = res.rule
          ? (
              await db
                .select()
                .from(schema.playbookRules)
                .where(eq(schema.playbookRules.id, res.rule.ruleId))
            )[0]
          : undefined;
        ruleOk = Boolean(rule && /CST/.test(rule.ruleText));
        await analyzeCustomer(db, companyId, apex.id, new Date(NOW.getTime() + 5 * 60_000));
        const next = await db
          .select()
          .from(schema.suggestions)
          .where(
            and(
              eq(schema.suggestions.channelId, custChan!.id),
              eq(schema.suggestions.status, "pending"),
            ),
          );
        const follows = next.filter(
          (s) => /\bCST\b/.test(s.proposedText) && rule && s.usedContext.ruleIds.includes(rule.id),
        );
        followOk = follows.length > 0;
        followDetail = next.length
          ? `"${next[0]!.proposedText.slice(0, 90)}" rules=${next[0]!.usedContext.ruleIds.length}`
          : "no next suggestion";
        add(
          "8a",
          "edit distilled into a CST rule",
          ruleOk,
          rule ? `"${rule.ruleText.slice(0, 80)}"` : "no rule",
        );
      } else {
        add("8a", "edit distilled into a CST rule", false, followDetail);
      }
      add("8b", "next suggestion follows the learned rule", followOk, followDetail);

      const digest = await generateOwnerDigest(db, companyId, new Date(NOW.getTime() + 6 * 60_000));
      add(
        "9",
        "owner digest ≤5 worded items",
        digest.length > 0 && digest.length <= 5 && digest.every((d) => d.title.en && d.title.ru),
        `items=${digest.length}`,
      );
    });

    const runs = await db
      .select()
      .from(schema.analysisRuns)
      .where(eq(schema.analysisRuns.companyId, companyId));
    const analysis = runs.filter((r) => r.task === "customer_analysis" && r.ok);
    rows.push({
      candidate: c.label,
      checks,
      analysisCalls: runs.length,
      avgLatencyMs: analysis.length
        ? Math.round(analysis.reduce((a, r) => a + r.latencyMs, 0) / analysis.length)
        : 0,
      totalLatencyMs: runs.reduce((a, r) => a + r.latencyMs, 0),
      inputTokens: runs.reduce((a, r) => a + r.inputTokens, 0),
      outputTokens: runs.reduce((a, r) => a + r.outputTokens, 0),
      failedCalls: runs.filter((r) => !r.ok).length,
      errors: [
        ...new Set(
          runs.filter((r) => !r.ok).map((r) => `${r.task}: ${r.error ?? ""}`.slice(0, 160)),
        ),
      ],
    });
  }

  // ── Report ──
  const ids = rows[0]?.checks.map((c) => c.id) ?? [];
  const header = `| Model | ${ids.join(" | ")} | Passed | Avg analysis latency | Calls (failed) | Tokens in/out |`;
  const sep = `|${" --- |".repeat(ids.length + 5)}`;
  const lines = rows.map((r) => {
    const passed = r.checks.filter((c) => c.pass).length;
    return `| ${r.candidate} | ${r.checks.map((c) => (c.pass ? "✅" : "❌")).join(" | ")} | ${passed}/${r.checks.length} | ${(r.avgLatencyMs / 1000).toFixed(1)} s | ${r.analysisCalls} (${r.failedCalls}) | ${r.inputTokens}/${r.outputTokens} |`;
  });
  const legend = rows[0]?.checks.map((c) => `${c.id} = ${c.label}`).join("; ") ?? "";
  const table = [header, sep, ...lines].join("\n");
  console.log(`\n${table}\n\nChecks: ${legend}`);
  for (const r of rows)
    if (r.errors.length) console.log(`\n${r.candidate} errors:\n  ${r.errors.join("\n  ")}`);
  for (const r of rows) {
    const failed = r.checks.filter((c) => !c.pass);
    if (failed.length)
      console.log(
        `\n${r.candidate} failed checks:\n  ${failed.map((c) => `${c.id} ${c.label}: ${c.detail}`).join("\n  ")}`,
      );
  }
  if (out) {
    const stamp = new Date().toISOString().replace("T", " ").slice(0, 16);
    appendFileSync(
      out,
      `\n### Round ${round ?? "?"} — ${stamp} UTC${note ? ` — ${note}` : ""}\n\n${table}\n\nChecks: ${legend}\n${rows
        .map((r) => {
          const failed = r.checks.filter((c) => !c.pass);
          return failed.length
            ? `\n- **${r.candidate}** failed: ${failed.map((c) => `${c.id} (${c.detail.replace(/\|/g, "/")})`).join("; ")}`
            : "";
        })
        .join("")}\n`,
    );
  }
  await closeDb();
}

main().catch((err: unknown) => {
  console.error("[eval] failed", err);
  process.exit(1);
});
