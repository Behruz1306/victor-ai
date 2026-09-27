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
- Approving a suggestion on a `demo` channel records the message into that channel as sent by the dispatcher (labeled as sent via Victor AI) so the pipeline reacts exactly as it would to a real Telegram send.
- Bot sends go through a `telegram_send` job executed by the worker (single side-effect path, retries, redaction right before send); the web never talks to Telegram directly except the health check.
- Fonts via the `geist` npm package (local files) instead of `next/font/google` — builds work offline and in Docker without Google access.
- bcryptjs (pure JS) instead of argon2 — no native build step under pnpm/Docker.
- Mutations are route handlers protected by `guard()` with a same-origin (Origin/Host) check → CSRF-safe with SameSite=Lax cookies.
- Login rate limit is in-memory per process (5 attempts / 10 min per email+IP) — enough for a single web instance; documented in SECURITY.md. (Superseded in polish B5: now in Postgres.)
- Postgres published on host port 5433 to avoid clashing with a local Postgres on 5432.
- Daily per-customer summaries are produced as `day_summary` inside the same analysis call (no extra LLM call) and stored in `daily_summaries`; they feed the handoff brief (Iva memory-tree idea).
- Iva userbot (personal account reading) is not implemented — ToS risk; documented as a future read-only connector behind a disabled flag.
- Prod worker is bundled with esbuild into `dist/worker.mjs` (tsc can't resolve Next-style path aliases without extra tooling).
- Env template ships as `env.example` (not `.env.example`): this build session's permission rules forbid writing dot-env files. Copy it to `.env`; all scripts use `--env-file-if-exists=.env` and dev falls back to safe local defaults (dev-only session secret, localhost:5433 DB).
- `system_state` (key/value) is a global infra table for worker heartbeat and bot identity; it holds no tenant data, so it has no company_id (exception to the 'every table has company_id' rule, like the job queue's global jobs).
- Phases 2 and 3 were built together and committed as one commit: the Sources mapping UI needs the LLM layer (AI mapping proposal) and the worker handlers need the pipeline.
- In DEMO_MODE, Telegram messages use a 5 s analysis debounce (15 s otherwise) so the live-mode demo meets the ~15 s promise including processing and 3 s UI polling.
- Evidence sent before a task's request is rejected by the application layer (`evidence_before_request`), and the mock only links messages to requests that already existed — found in live replay where yesterday's reply "acknowledged" a task created today.
- A re-analysis that proposes nothing for a chat retires that chat's pending suggestion (the need is gone); a changed text supersedes it.
- Edits are distilled into rules inline in the Edit request (so the UI can say "New rule learned…" immediately); a failure falls back to a queued `distill_rule` job.
- Handoff briefs are generated synchronously in the request (one main-model call per customer) and stored as a draft; confirming reassigns customers and their open tasks.
- Docker: the worker container applies migrations and seeds the demo into an empty DB; web starts after the worker is healthy, so only one process migrates.
- Docker: when `SESSION_SECRET` is missing the web container generates a random one at start (never a known default); the secret check lives in the session code so the worker starts without it.
- Dockerfile default target `app` contains web + worker for PaaS "two services from one image"; compose uses the slimmer `web`/`worker` targets.
- Owner digest ranking adds a kind weight (complaint > rudeness > overdue > …) at equal severity, so relationship damage surfaces first.
- pgvector is enabled (first migration) but unused in the MVP — no embedding provider without extra keys; rule similarity uses token Jaccard.

## Polish (Victor AI)

- Product renamed Pulse → **Victor AI** (`src/lib/brand.ts`). Intentional "pulse" leftovers: Postgres user/password/database `pulse` in `docker-compose.yml`, `env.example`, `drizzle.config.ts`, `src/lib/db/client.ts`, test URLs and DEPLOY backup command (renaming would orphan the existing `pulse_pgdata` volume); the Docker Compose project name (folder `pulse`); Tailwind's `animate-pulse` utility class; the historical specs `BUILD_PROMPT.md` / `POLISH_PROMPT.md` / `VICTOR_AI_PROMPT.md`.
- Cookies renamed `pulse_*` → `victor_*` (`victor_session`, `victor_lang`, `victor_theme`); everyone simply signs in again.
- Integration-test database renamed `pulse_test` → `victor_test` (created by the test global setup; the old one is harmless).
- App port is 3001 everywhere, including inside the container (`PORT=3001`), so nothing in the repo points at 3000 (reserved for another project on the presenter laptop).
- `pnpm dev` compiles into `.next-dev` (`NEXT_DIST_DIR`), production builds into `.next`: `pnpm build` / e2e never clobber a running dev server (a stale dev server from the previous session is still bound to :3000 and must not be stopped).
- Worker entry moved `src/worker/index.ts` → `src/worker/main.ts`: a stale `tsx watch src/worker/index.ts` from the previous session shares a `concurrently -k` group with the :3000 server, so it cannot be stopped without stopping :3000; with the entry gone it can no longer hot-reload new code and compete for jobs or the Telegram long poll.
- Messages recorded from approved suggestions use external id `victor-<suggestionId>` and `raw.viaVictor` (was `pulse-…` / `viaPulse`); the demo is re-seeded, so no migration of old rows.
- Provider chain Cerebras → Gemini → mock (Anthropic first only when keyed), all configured from env; each provider has a failover list of models (`GEMINI_MODEL=a,b,c`) because free tiers cap each model separately (Gemini: 20 requests/day/model) and overload models independently (503 "high demand").
- The chain calls OpenAI-compatible endpoints with plain `generateText` + `response_format` in provider options (strict `json_schema` first, `json_object` + schema in the instructions once a model rejects it) and parses the text ourselves (lenient JSON + zod + one repair attempt). `Output.object` stays only for the Anthropic provider.
- Rate limiting is a token bucket per provider+model stored in Postgres (`llm_limits`): web, worker and `pnpm eval` share one free-tier budget. 429 → cooldown from `Retry-After` / Gemini `retryDelay`; a Gemini per-day quota violation waits for the next quota day (midnight Pacific) because its `retryDelay` says "5s"; 5xx/timeouts → two spaced retries, then failover.
- `maxRetries: 0` in the AI SDK: retries are ours, so a 429 never gets hammered by SDK backoff.
- Demo response cache (`llm_cache`) is keyed by task + instructions + prompt without the `NOW:` line, used only for demo companies, 7-day TTL; cached answers are logged with `cached=true` and don't count as provider requests.
- Placeholder keys (non-ASCII or < 20 chars, e.g. a Cyrillic "ключ-…") are treated as missing and reported in Settings, the worker log and `demo:check`; this environment's `LLM_API_KEY` (Cerebras) and `TELEGRAM_BOT_TOKEN` are such placeholders.
- `LLM_MODEL`/`LLM_FAST_MODEL` now belong to the primary OpenAI-compatible provider; a leftover Claude id there is ignored (goes to `ANTHROPIC_MODEL` instead).
- Main model on Gemini = `gemini-3.1-flash-lite` (11/11 in `pnpm eval` round 3), fast = `gemini-3.5-flash-lite`; pro models are 0/day on the free tier, 2.5 models are 404 for new users, Gemma 4 times out on the full analysis prompt (docs/EVAL.md).
- Reasoning effort "low" for Gemini/gpt-oss models: extraction work doesn't benefit from long thinking and the live demo needs ~15 s end to end.
- Deadlines are repaired in code when a model puts a promise in the wrong year (timeline stamps omit the year); NOW in the prompt now carries the full date, year and UTC offset.
- Telegram long polling is guarded by a Postgres advisory lock (`victor:telegram-long-poll`): a second worker stands by instead of crashing on 409 Conflict and takes over within 15 s. Liveness = the last successful `getUpdates` round-trip (grammY API transformer), stored in `system_state` and shown as "Bot online · last update Xs ago".
- `createBot()` takes an injected token/botInfo so the integration test feeds real-shaped Telegram `Update` JSON through the exact handlers the poller uses (`bot.handleUpdate`), without network.
- `LLM_RECORD_DIR` saves raw model output text (never prompts or keys) — used to record the real Gemini fixture in `tests/fixtures/llm/`.
- `message_links` stays in the model output schema as required, but the zod schema defaults it to `[]` so answers recorded before the field existed still parse.
- B5: login attempts live in Postgres (`login_attempts`, fixed 10-min window via one upsert), so every web instance shares the count and a restart doesn't reset it.
- B1: `reply_needed` is tracked per customer question and task: `message_links` (analysis output, mock heuristics) + task-event evidence + the creating message tell what each message is about; a reply only clears questions about the same task; an unlinked reply clears a linked question only when it is the only one open; a question about a closed task is answered by the result.
