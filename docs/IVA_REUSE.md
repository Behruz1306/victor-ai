# What we reuse from Iva (MIT)

Source: https://github.com/smixs/iva-agent (MIT, © 2026 smixs), studied from a shallow clone in
`reference/iva-agent` (gitignored). Iva is a single-user, self-hosted Telegram assistant on the
`eve` agent framework, Node 24, SQLite and systemd. Pulse is multi-tenant with a web dashboard,
so we port ideas and pure functions, not the runtime.

| Iva module | What it does | Decision |
|---|---|---|
| `agent/lib/security-gate.ts` → `sanitizeInbound` | Deterministic inbound gate: strips invisible Unicode (blocks >5% floods), counts "wallet-drain" scripts, normalizes Cyrillic/Greek homoglyphs in a detection copy, counts role markers (`system:`, `assistant:` …, EN/RU/UZ) and override patterns (EN canonical, RU/UZ canonical, five intent families); block threshold = 2+ role markers with 1+ override, or 3+ overrides | **Ported** to `src/lib/security/injection.ts`. We use the multilingual "web" surface rules because chat text is always *data* for us (never an instruction), so the policy is warn-and-pass: flagged text still reaches the model, but wrapped in `<untrusted>` and marked `untrusted_flag`. Trimmed the per-turn tracing (eve-specific). |
| `agent/lib/security-gate.ts` → `scanOutbound` + `packages/secret-redaction` | Outbound gate: provider key shapes (OpenAI, Anthropic, OpenRouter, Telegram bot token, AWS, Stripe, JWT, Bearer …), named secrets, `.env`-looking lines, URL userinfo passwords, exfil image URLs → `[REDACTED]` | **Ported** to `src/lib/security/redact.ts`; applied to every suggestion shown/sent, every digest item, every Telegram send. Named-secret list adapted to our env (`SESSION_SECRET`, `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `LLM_API_KEY`, `ANTHROPIC_API_KEY`, `IMAP_PASSWORD`). |
| `docs/memory.md` memory tree (daily leaves → summaries → `CORE.md` ≤1200 chars in every prompt) | Layered memory | **Idea ported** per customer: verbatim `messages` = leaves; `daily_summaries` per customer = branches; `customers.brief` (≤1200 chars, clamped in code like `core-clamp.ts`) = trunk, regenerated after each analysis and injected into every prompt for that customer. Handoff briefs read brief + daily summaries. |
| `scripts/poller/*`, `docs/deploy.md` long-polling bridge | `getUpdates` loop, offset advanced only after success, per-chat pacing, backoff while server boots | **Pattern ported**: grammY `bot.start()` long polling in the worker (grammY persists offsets by acking), ingestion is idempotent on `(channel_id, external_id)` so a redelivered update is harmless; backoff on errors via grammY's runner defaults. No webhook needed. |
| `agent/lib/telegram-format.ts` | Markdown → Telegram HTML, balanced tags, ≤4096 chunking, plain-text fallback on 400 | **Partially ported**: `src/lib/telegram/format.ts` keeps HTML escaping and 4096-char chunking; we send plain text (suggestions are plain), so the markdown→HTML converter is not needed. |
| `scripts/lib/telegram-send.ts` | Transient-retry policy (network, 5xx, 408, 425, 429) | **Idea ported** into the `telegram_send` job: retries via the job queue backoff; 429 honors `retry_after`. |
| `agent/lib/telegram-allowlist.ts` | Fail-closed allowlist of who may talk to the bot | **Adapted**: the bot only ingests chats; nobody can command it. Unknown groups land as "Unmapped" and produce no analysis until an owner maps them (fail closed). |
| `docs/userbot.md`, `services/telegram-userbot` | Personal-account (Telethon) reading and sending with anti-ban guardrails | **Not implemented.** Iva itself warns that automating a personal account violates Telegram ToS and can get it limited/banned. Documented as a possible future **read-only** connector behind a disabled flag (`TELEGRAM_USERBOT_ENABLED=false`, no code path). Sending from personal accounts is out of scope permanently. For 1:1 chats we use Telegram Business connected bots instead (official API). |
| eve runtime, systemd installers, Obsidian vault, personal CRM cards, Google Workspace, update system, plugins, MCP proxy | Single-user assistant infrastructure | **Skipped** — not relevant to a multi-tenant web product. |

## License compliance

- `THIRD_PARTY_NOTICES.md` contains Iva's MIT license text and copyright line.
- Every ported file starts with `// Adapted from iva-agent (MIT), see THIRD_PARTY_NOTICES.md`.
