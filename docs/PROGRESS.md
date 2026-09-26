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
- [ ] Settings: SLA, criteria, Telegram status, send mode, LLM provider, token usage + cost, retention, consent notice (+ post to group)
- [ ] Retention cleanup job
- [ ] Audit log viewer
- [ ] Phase gate + commit

## Phase 8 — Demo control & polish
- [ ] `/demo` control room (reset, load yesterday, live replay start/stop, queue status)
- [ ] Visual polish, loading/empty/error states, EN/RU completeness, favicon + brand constant
- [ ] `docs/DEMO_SCRIPT.md` (RU, minute by minute + fallback)
- [ ] Phase gate + commit

## Phase 9 — Hardening & packaging
- [ ] Tenant isolation test + RBAC tests
- [ ] Playwright golden path + screenshots in `docs/screenshots/`, review them
- [ ] Production Dockerfile (web standalone + worker bundle), compose with auto-migrate + demo seed
- [ ] `docs/DEPLOY.md`, `docs/SECURITY.md`
- [ ] Final gate + commit + final report

## Stretch
- [x] Call transcript upload
- [ ] CSV export of tasks
- [ ] Per-customer daily summaries view
- [ ] Email IMAP connector

## Blockers / notes
- No `ANTHROPIC_API_KEY` / `TELEGRAM_BOT_TOKEN` in this environment → verified with the mock provider; Telegram live path verified by unit tests of the normalizer, not against a real group.
