# POLISH PROMPT — from working MVP to jury-ready product

You are continuing the project in this repository. The first build (BUILD_PROMPT.md, phases 0–9) is done and committed on `master`. Read `CLAUDE.md`, `docs/PROGRESS.md`, `docs/DECISIONS.md`, `docs/ARCHITECTURE.md` and `docs/DEMO_SCRIPT.md` first.

Your job now, in this order:
**A.** make the real AI and live Telegram actually work,
**B.** fix the known issues,
**C.** redesign the product so it looks like a senior product design team built it,
**D.** make the demo bulletproof.

Work autonomously for several hours. Do not ask questions.

---

## 0. OPERATING RULES

1. **No questions.** Decide, write one line in `docs/DECISIONS.md`, continue.
2. **Work on a branch.** First command: `git checkout -b polish`. Commit after every phase: `git add -A && git commit -m "polish N: <summary>"`. Never push. Never deploy.
3. **Before every commit:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:e2e` (or the project's e2e script). Fix every failure before committing.
4. **Track progress** in `docs/PROGRESS.md` under a new heading "Polish". If the session restarts, re-read it and continue from the first unticked item.
5. **Secrets.** `.env` contains real keys. Never print, log, echo, commit or copy their values anywhere. Do not open `.env` to display it; read variables only through the app's config loader. Make sure `.env` is in `.gitignore`. If a key is missing, continue with the mock provider and mark the related item ⚠️ in the final report.
6. **Stay inside this repository.** No `sudo`, no global installs, no changes outside the project folder.
7. **Ports.** The previous session may have left dev servers running. Before starting servers, NEVER kill processes on port 3000 — it belongs to another project of the user. Pulse must run on port 3001 everywhere (dev, e2e, docker port mapping, APP_URL). Do not stop the Docker `db` container unless you need to recreate it.
8. **Cost guard.** Real LLM spend for this whole session must stay under $5. Log every call in `analysis_runs` (already implemented) and check the total after phase A.

---

## PHASE A — Real AI and live Telegram

**A1. Model check.** With `ANTHROPIC_API_KEY` set, make one minimal call through `src/lib/llm/`. If the configured model id fails (404 / not found), call the Anthropic models list endpoint through the SDK, pick the newest Sonnet-class model for `LLM_MODEL` and the newest Haiku-class model for `LLM_FAST_MODEL`, update `env.example` defaults and `docs/DECISIONS.md`. Never hardcode a key.

**A2. Eval harness.** Create `pnpm eval` that runs the Apex "yesterday" scenario through the **real** provider and checks the 6 expected outcomes from BUILD_PROMPT.md section 8 (stuck at acknowledged, eta_not_forwarded, overdue, complaint, rude_tone, one clean task delivered), plus: the ETA suggestion uses the fleet chat message, and the suggestion after the CST edit follows the learned rule. Print a pass/fail table and token cost. Run it up to 3 times; after each failing run, improve prompts or zod schemas (not the test) and rerun. Save results to `docs/EVAL.md`.

**A3. Structured output robustness.** Verify the AI SDK structured-output path works with the real model (schema validation, one repair attempt, graceful skip). Add a unit test with a recorded real response fixture (store only the model output text, no keys).

**A4. Live Telegram.** If `TELEGRAM_BOT_TOKEN` is set: start the worker, confirm the log line `[telegram] long polling as @…`, call `getMe` and `getUpdates` health checks through grammY, and add a Settings indicator "Bot online · last update Xs ago". Write an integration test that feeds a real-shaped Telegram `Update` JSON (group message) through the same handler the poller uses and asserts task + suggestion creation. You cannot type into Telegram yourself — the human will do the final manual check; write the exact steps for it in the final report.

**A5. Mock coverage.** Make the mock provider recognize more trucking phrasing (at least 30 new EN/RU variants for load requests, ETA, POD/BOL, detention, complaints, rude tone) so the offline fallback survives improvised demo messages. Add tests.

---

## PHASE B — Known issues from the first build

1. **Reply-needed at task level.** A team message must not clear `reply_needed` if an earlier customer question in the same chat is still unanswered. Track open customer questions per task; resolve only when the reply addresses that task (LLM mapping, mock heuristic fallback). Tests.
2. **Demo-aware KPIs.** "Avg acknowledgment time" must use the demo company's scenario window in demo mode, so the owner screen never shows empty KPIs because "yesterday" aged past 24 h. In non-demo mode keep a rolling 24 h window.
3. **Seed freshness.** On worker start in demo mode, if the demo data is older than 12 h, re-seed relative to now automatically (and log it).
4. **CSP with nonces.** Remove `'unsafe-inline'` for scripts using Next.js nonce middleware. Keep styles working. Verify every page renders with no CSP errors in the browser console (Playwright console listener).
5. **Login rate limit in Postgres** instead of process memory.
6. **Env file naming.** Keep `env.example` and also add `.env.example` if the environment allows; document both.
7. **Email IMAP connector** (stretch — only after everything else in B and C is done).

---

## PHASE C — Expert-level design overhaul (the biggest phase)

Goal: when the jury sees the first screen, it should look like a funded startup's product built by a senior design team — calm, precise, confident, fast — not a generic AI-generated dashboard.

**C0. Capture "before".** Run the e2e screenshot suite and copy the images to `docs/screenshots/before/`.

**C1. Design direction — write it first.** Create `docs/DESIGN.md` with: product personality (calm control room for operators under pressure: precise, quiet, trustworthy, fast), principles (information density without noise; one accent; severity is the only loud color; every number has context; motion only to explain change), and the full token set below. Every later decision must follow this file.

**C2. Design system (tokens in CSS variables + Tailwind theme):**
- **Typography:** Geist Sans for UI and Geist Mono for numbers, IDs, times, load numbers (load via `next/font` or the `geist` package — self-hosted, no external requests). Scale: 12 / 13 / 14 / 16 / 20 / 24 / 32. Base UI text 14, tables and dense lists 13. Tabular numerals everywhere numbers align. Tight but readable line heights; negative letter-spacing only on 24+.
- **Color:** neutral scale (zinc-like, slightly cool), one brand accent (a deep, confident blue-violet or teal — choose one and justify in DESIGN.md), and a semantic severity scale: critical, high, medium, low, ok. Severity always = color + icon + text label. Separate tuned palettes for light and dark; dark mode must be designed, not inverted. All text meets WCAG AA contrast (write a unit test that checks token pairs).
- **Space & shape:** 4 px base grid; radius 6 (controls) / 10 (cards) / 14 (dialogs); hairline 1 px borders instead of heavy shadows; one subtle elevation for popovers and dialogs.
- **Motion:** 120–200 ms, ease-out, `prefers-reduced-motion` respected. Use motion only to show change: new item slides in and briefly highlights, status step animates forward, counters tick, the "Live" dot pulses.

**C3. Components.** Upgrade the shadcn components to the tokens and add: `SeverityBadge`, `StatusStepper` (task path, with animated progression and stuck state), `KpiTile` (value, delta vs previous period, sparkline), `EvidenceQuote` (quote with source chat chip, time, link), `ChatTypeChip` (customer / internal / fleet / billing with distinct icons), `SuggestionCard` (target chat, draft, rationale, "context used from", applied rules, actions), `Avatar` (initials, deterministic colors), `EmptyState` (original minimal SVG illustration + one-line guidance), skeleton loaders for every list, toasts via `sonner`, command palette via `cmdk` (⌘K: jump to customer, task, dispatcher, screen).

**C4. Screens — redesign each one:**
- **Global shell:** slim left sidebar with icons + labels, product mark, role switcher (demo mode), live connection indicator ("Live · 3 sources"), ⌘K hint, language and theme toggles in a compact menu. Page headers with title, one-line context and primary action.
- **Dispatcher:** three-pane layout that feels like a professional inbox (think the polish of Linear, Front, Superhuman — inspiration for quality level only, do not copy their layouts or assets). Left list: urgency-sorted with severity badges, customer avatar, last message preview, time in mono. Center: merged timeline with day separators, chat-type chips, sender side clearly distinguished, messages that created tasks subtly marked. Right: open tasks as compact steppers and the suggestion card pinned at the top. Keyboard: `J/K` move, `A` approve, `E` edit, `Esc` cancel; show hints on hover.
- **Suggestion → learning moment:** after "Edit + reason", animate a small card "New rule learned for Apex Logistics" that flies into the Playbook nav item; edit-rate counter ticks.
- **Task card:** large horizontal stepper, each step with time and evidence quote, the stuck step clearly marked with the reason and "time stuck" counter.
- **Owner:** the most beautiful screen. Generous whitespace, a calm headline ("3 things need your attention today"), 3 KPI tiles with sparklines and deltas, ≤5 attention items as elegant cards (what happened, why it matters, who, evidence, Open). Perfect on a phone (the owner will look at it on a phone — design mobile first for this screen).
- **Lead:** clean data table (sticky header, sortable, mono numbers, inline severity), row → side panel with the dispatcher's problems; handoff flow as a polished 2-step dialog.
- **Playbook:** rules as readable cards grouped by scope, the source edit shown as a before/after diff; edit-rate chart styled with tokens (no default Recharts look).
- **Sources:** make the "chaos" intentionally visible — dense stack of raw chats — with a toggle "Show what Pulse sees" that overlays detected tasks and signals on the raw messages. This is a demo moment.
- **Login:** split layout — left: product mark, one-line promise, subtle abstract original background; right: form and the three demo role buttons.
- **Demo control room:** clear big controls, queue status, and a "Presenter checklist" (keys OK, bot online, data fresh, last pipeline run).

**C5. Brand.** Create an original, simple product mark (SVG, geometric, works at 16 px and in monochrome), favicon set, and Open Graph image. Keep the name in `src/lib/brand.ts`. Do not imitate any existing company's logo.

**C6. Landing page for the jury** at `/` when logged out (after all screens are done): hero with the one-sentence promise and a real screenshot of the dispatcher screen, the problem in 3 short points, "How it works" (connect chats → Pulse reads → tasks tracked to result → it learns from edits), the three roles, security & privacy section, pricing placeholder, CTA "Open live demo". Fast, no heavy assets.

**C7. Quality pass.** For every screen, in light and dark, at 1440 px, 1280 px and 390 px (owner, login, landing): take Playwright screenshots into `docs/screenshots/after/`, **look at each one yourself**, and fix: misalignments, inconsistent spacing, truncated text, weak hierarchy, default-looking elements, empty or broken states, EN/RU overflow (Russian strings are longer). Repeat until no issues remain. Then run an automated accessibility check (`@axe-core/playwright`) on every page and fix all serious/critical violations.

---

## PHASE D — Bulletproof demo

1. `pnpm demo:check` — preflight that prints a green/red list: DB up, migrations current, demo data fresh, LLM provider and a 1-token test call, Telegram bot online, worker heartbeat, no CSP errors on key pages.
2. **Fallback switch** in the Demo control room: "Offline mode (mock AI)" that switches the provider at runtime without restart, for when the venue internet fails.
3. Update `docs/DEMO_SCRIPT.md` (Russian): minute-by-minute script matching the new UI, including keyboard shortcuts to use on stage and what to say at each step, plus plan B.
4. Final full run: `docker compose up --build` from a clean volume, all services healthy, golden path passes in e2e with screenshots.

---

## FINAL REPORT (print directly in the terminal, in Russian)

1. What changed in each phase, with ✅ / ⚠️ / ❌ and one line why.
2. Eval results table (real AI vs expected) and total LLM cost of the session.
3. Exact copy-paste commands to: start everything locally, run `pnpm demo:check`, run `pnpm eval`.
4. Exact manual steps for the one thing you could not do yourself: the live Telegram check (what to type in the group and what should appear, within how many seconds).
5. The path to the before/after screenshots and the 5 biggest visual improvements.
6. Exact commands to merge the branch when the team is happy: `git checkout master && git merge polish`, and how to roll back: `git checkout master` (branch untouched).
7. Remaining known issues and what to do before the stage.

Begin with rule 2 (create the branch), then Phase A. Do not ask for confirmation.
