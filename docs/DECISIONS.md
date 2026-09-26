# Decisions

One line per decision: what and why.

- Next.js pinned to 15.x (spec) even though 16 exists — stack is decided, 15 is stable with React 19.
- AI SDK 7 is current: use `generateText` + `Output.object` (the `generateObject` path is legacy) and `instructions` instead of `system`.
- LLM entry point is `generateStructured(schema, prompt, { model, task, mockInput })`: real providers read `instructions`+`prompt`, the mock provider dispatches on `task` with the structured `mockInput`, so offline runs stay deterministic without parsing prompts.
- Zod schemas for LLM output use `.nullable()` rather than `.optional()` — structured-output providers reject optional fields.
- Human-facing generated text (task titles, signal titles/reasons, rationales, digest items, event explanations) is stored bilingual as jsonb `{en, ru}` so the EN/RU toggle switches AI text instantly; suggestion text itself stays in the target chat's language.
- One Telegram bot per deployment, bound to the company from `TELEGRAM_COMPANY_ID` (default: the first company, i.e. the demo company) — multi-bot routing is out of MVP scope.
- Sender side rule: linked user → `employee`; otherwise `customer` in customer chats, `employee` in internal/fleet/billing chats, `unknown` in unmapped chats.
- Users get a nullable `telegram_user_id` so participants can be auto-linked to employees by Telegram id (spec says "matched by Telegram id").
- `jobs` gets `company_id` (nullable for global jobs) and `dedupe_key` with a partial unique index on pending jobs — needed for per-customer debounce.
- Debounce = pending job for the same key gets `run_after` pushed to now+debounce, capped at 4×debounce after first enqueue so a busy chat still gets analyzed.
- Trucking dispatch runs 24/7 → default business hours = always on; SLA config supports a daily window + weekdays when a company sets one.
- `missing_deadline` also fires for `acknowledged` tasks with no progress/deadline past the threshold — this is exactly the "stuck at acknowledged" case from the demo scenario.
- `eta_not_forwarded` is emitted by the analyzer as a quality flag pointing at the internal/fleet ETA message, then kept only if timestamps confirm no later employee message to the customer carries an ETA (code check).
- Signal `audience` stores the highest audience reached (owner ⊃ lead ⊃ dispatcher); dispatchers see every signal for their customers regardless.
- Owner KPI "avg acknowledgment time" uses a rolling 24 h window instead of calendar "today", because the demo scenario is "yesterday" relative to now.
- Approving a suggestion on a `demo` channel records the message into that channel as sent by the dispatcher (labeled as sent via Pulse) so the pipeline reacts exactly as it would to a real Telegram send.
- Bot sends go through a `telegram_send` job executed by the worker (single side-effect path, retries, redaction right before send); the web never talks to Telegram directly except the health check.
- Fonts via the `geist` npm package (local files) instead of `next/font/google` — builds work offline and in Docker without Google access.
- bcryptjs (pure JS) instead of argon2 — no native build step under pnpm/Docker.
- Mutations are route handlers protected by `guard()` with a same-origin (Origin/Host) check → CSRF-safe with SameSite=Lax cookies.
- Login rate limit is in-memory per process (5 attempts / 10 min per email+IP) — enough for a single web instance; documented in SECURITY.md.
- Postgres published on host port 5433 to avoid clashing with a local Postgres on 5432.
- Daily per-customer summaries are produced as `day_summary` inside the same analysis call (no extra LLM call) and stored in `daily_summaries`; they feed the handoff brief (Iva memory-tree idea).
- Iva userbot (personal account reading) is not implemented — ToS risk; documented as a future read-only connector behind a disabled flag.
- Prod worker is bundled with esbuild into `dist/worker.mjs` (tsc can't resolve Next-style path aliases without extra tooling).
- Env template ships as `env.example` (not `.env.example`): this build session's permission rules forbid writing dot-env files. Copy it to `.env`; all scripts use `--env-file-if-exists=.env` and dev falls back to safe local defaults (dev-only session secret, localhost:5433 DB).
- `system_state` (key/value) is a global infra table for worker heartbeat and bot identity; it holds no tenant data, so it has no company_id (exception to the 'every table has company_id' rule, like the job queue's global jobs).
