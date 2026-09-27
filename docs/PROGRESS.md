# Progress

Tick items as they are finished. Blockers go to the bottom section.

## Phase 0 — Recon & plan
- [x] Read product brief and BUILD_PROMPT
- [x] Clone Iva into `reference/iva-agent` (gitignored), study security gate, memory, userbot, deploy
- [x] CLAUDE.md, PROGRESS.md, DECISIONS.md, ARCHITECTURE.md (Mermaid), IVA_REUSE.md
- [x] THIRD_PARTY_NOTICES.md
- [x] Commit phase 0

## Phase 1 — Scaffold & infra
- [x] Next.js 15 + Tailwind v4 + UI kit + ESLint + Prettier + Vitest + Playwright
- [x] Drizzle schema (all tables of 5.2) + first migration (with `CREATE EXTENSION vector`)
- [x] docker-compose.yml (db pgvector/pgvector:pg16), .env.example
- [x] Auth (bcrypt + iron-session), login rate limit, RBAC guard, same-origin check
- [x] App shell: role-aware nav, EN/RU toggle, light/dark
- [x] `/api/health` with DB check
- [x] Role-specific empty screens; security headers
- [x] Phase gate + commit

## Phase 2 — Ingestion
- [x] Normalizer contract + `ingestMessage()` (upsert channel/participant, injection screen, idempotent insert, debounced job)
- [x] Ported injection screen + outbound redaction (with tests)
- [x] Job queue (enqueue/claim/complete/fail, dedupe, backoff) + tests
- [x] Demo seed JSON (raw messages only) + `pnpm seed` / `pnpm seed:reset`
- [x] Worker: grammY long polling (groups), business messages behind flag
- [x] `/sources`: channels, raw messages, unmapped chat mapping with AI proposal
- [x] Phase gate + commit

## Phase 3 — Pipeline
- [x] LLM abstraction (anthropic / openai-compatible / mock), retries, repair, logging to analysis_runs
- [x] Prompts + `CustomerAnalysis` zod schema
- [x] Mock provider heuristics (EN/RU)
- [x] Task state machine (unit tests)
- [x] SLA engine (unit tests with fake clock) + signal dedupe/resolve + audience routing
- [x] Customer brief + daily summaries
- [x] Owner digest (≤5, ranked in code, worded by fast model)
- [x] Integration test: Apex scenario → six expected outcomes (mock)
- [x] Phase gate + commit

## Phase 4 — Dispatcher screen
- [x] Chat list grouped by customer, urgency sort, badges, unread
- [x] Merged cross-chat timeline with chips + highlights
- [x] Open tasks (compact steppers) + suggestion card (context, rules, rationale)
- [x] Approve (copy / bot send), Edit with reason, Dismiss
- [x] Top bar: edit rate, urgent count; 3 s polling
- [x] Phase gate + commit

## Phase 5 — Task card, Owner, Lead
- [x] `/tasks/[id]` stepper with timestamps, evidence, stuck step, signals
- [x] `/owner` 3 KPI tiles + ≤5 digest items + empty state + last updated
- [x] `/lead` dispatcher table + drill-down
- [x] Phase gate + commit

## Phase 6 — Learning loop
- [x] distill_rule job (mock + LLM), merge similar rules, scope handling
- [x] Rule injection + "applied rules" display
- [x] `/playbook` screen (rules by scope, approve/reject proposed, source edits)
- [x] Edit-rate metrics + daily chart
- [x] Integration test: edit with reason → next Apex suggestion follows rule
- [x] Phase gate + commit

## Phase 7 — Onboarding, handoff, settings
- [x] Owner watch-criteria onboarding (3 questions → structured criteria, editable)
- [x] Handoff brief (pick replacement, per-channel brief, reassign on confirm, printable)
- [x] Settings: SLA, criteria, Telegram status, send mode, LLM provider, token usage + cost, retention, consent notice (+ post to group)
- [x] Retention cleanup job
- [x] Audit log viewer
- [x] Phase gate + commit

## Phase 8 — Demo control & polish
- [x] `/demo` control room (reset, load yesterday, live replay start/stop, queue status)
- [x] Visual polish, loading/empty/error states, EN/RU completeness, favicon + brand constant
- [x] `docs/DEMO_SCRIPT.md` (RU, minute by minute + fallback)
- [x] Phase gate + commit

## Phase 9 — Hardening & packaging
- [x] Tenant isolation test + RBAC tests
- [x] Playwright golden path + screenshots in `docs/screenshots/`, review them
- [x] Production Dockerfile (web standalone + worker bundle), compose with auto-migrate + demo seed
- [x] `docs/DEPLOY.md`, `docs/SECURITY.md`
- [x] Final gate + commit + final report

## Stretch
- [x] Call transcript upload
- [ ] CSV export of tasks (not done)
- [ ] Per-customer daily summaries view (data is stored in `daily_summaries` and used by handoff; no separate screen)
- [ ] Email IMAP connector (not done; normalizer contract ready for it)

## Blockers / notes
- No `ANTHROPIC_API_KEY` / `TELEGRAM_BOT_TOKEN` in this environment → everything verified with the mock provider; the Telegram path is verified through the normalizer + ingestion integration test (a real group was not available). Real-model runs are untested here.
- Dot-env files could not be written by the build session → template ships as `env.example`.

# Polish (VICTOR_AI_PROMPT.md, branch `polish`)

## Phase R — Rename to Victor AI
- [x] `brand.ts` name/tagline/owner promise; UI, metadata, consent notice, bot texts, docs
- [x] Demo accounts `@demo.victor.ai`; cookies `victor_*`; `package.json` name `victor-ai`
- [x] Port 3001 everywhere (dev, start, Playwright, Docker, APP_URL, docs)
- [x] Leftover "pulse" strings listed in DECISIONS.md
- [x] Re-seed demo company, phase gate, commit `polish R`

## Phase A — Real AI and live Telegram
- [x] A1 provider chain Cerebras → Gemini → mock, `/models` listing in EVAL.md, failover, token buckets, demo cache, JSON-mode repair, Settings usage per provider (⚠️ Cerebras key is a placeholder)
- [x] A2 `pnpm eval` harness + model choice + up to 3 improvement rounds → docs/EVAL.md
- [x] A3 structured-output robustness + recorded real fixture unit test
- [x] A4 live Telegram: poller lock, getMe/getUpdates health, "Bot online · last update Xs ago", Update-JSON integration test (⚠️ TELEGRAM_BOT_TOKEN in .env is a placeholder — the live check is for the human)
- [x] A5 mock: 30+ new EN/RU trucking phrasings + tests
- [ ] Phase gate + commit

## Phase B — Known issues
- [x] B1 reply_needed per open customer question (task-level) + tests
- [x] B2 demo-aware KPI window
- [x] B3 worker re-seeds stale demo (>12 h) on start
- [x] B4 CSP nonces (no 'unsafe-inline' for scripts) + Playwright console check
- [x] B5 login rate limit in Postgres
- [x] B6 `.env.example` alongside `env.example` (⚠️ environment forbids writing dot-env files; documented)
- [ ] Phase gate + commit

## Phase C — Design overhaul
- [x] C0 before screenshots (taken during phase R: old design, new name)
- [x] C1 docs/DESIGN.md
- [x] C2 tokens (type, color, contrast test, space, motion)
- [x] C3 components (SeverityBadge, StatusStepper, KpiTile, EvidenceQuote, ChatTypeChip, SuggestionCard, Avatar, EmptyState, skeletons, sonner, ⌘K)
- [x] C4 screens: shell, dispatcher, learning moment, task card, owner, lead, playbook, sources, login, demo room
- [x] C5 brand mark, favicons, OG image
- [x] C6 landing page
- [ ] C7 screenshot quality pass (light/dark, 1440/1280/390) + axe (matrix + axe done; review/fix loop in progress)
- [ ] Phase gate + commit

## Phase D — Bulletproof demo
- [ ] D1 `pnpm demo:check`
- [x] D2 offline-mode switch at runtime
- [ ] D3 DEMO_SCRIPT.md (RU) for the new UI
- [ ] D4 clean `docker compose up --build`, e2e golden path
- [ ] B7 (stretch) IMAP connector
- [ ] Final report
