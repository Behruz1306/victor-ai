# Victor AI — project memory

AI control layer for client work in chats, segment: US trucking (carriers + brokers).
Reads team chats (Telegram groups, later email/calls), extracts **customer tasks**
(`received → acknowledged → in_progress → deadline_set → delivered`, plus `cancelled`),
raises **signals**, suggests the next message, learns **playbook rules** from human edits,
and shows the owner only what needs attention.

Source of truth for behavior: `BUILD_PROMPT.md` (engineering spec) and
`КОНТЕКСТ-ДЛЯ-РАЗРАБОТКИ-ДЕМО.md` (product brief). Progress: `docs/PROGRESS.md`.
Decisions: `docs/DECISIONS.md`. On restart: read those three first, continue from the first
unticked item in PROGRESS.

## Stack
- TypeScript strict, Node 22, pnpm. Next.js 15 (App Router) + Tailwind v4 + shadcn-style
  components (local, in `src/components/ui`), lucide-react, Recharts, TanStack Query (3 s polling).
- Postgres 16 + pgvector, Drizzle ORM + drizzle-kit. DB-backed job queue (`jobs`, `FOR UPDATE SKIP LOCKED`).
- Worker: `src/worker/main.ts` (tsx in dev, esbuild bundle in prod): Telegram long polling
  (grammY), job runner, SLA/scheduler loop.
- LLM: Vercel AI SDK 7 (`generateText` + `Output.object`), providers anthropic /
  openai-compatible / **mock** (default without keys). Only via `src/lib/llm/`.
- Auth: bcryptjs + iron-session cookie; RBAC guard in `src/lib/auth/guard.ts`.
- Tests: Vitest (unit + DB integration), Playwright (golden path + screenshots).

## Commands
```bash
docker compose up -d db        # Postgres 16 + pgvector on localhost:5433
pnpm db:migrate                # apply drizzle migrations
pnpm seed                      # demo company + raw messages + enqueue analysis
pnpm seed:reset                # wipe demo company
pnpm dev                       # web (3001) + worker together
pnpm dev:web / pnpm dev:worker # separately
pnpm typecheck && pnpm lint && pnpm test && pnpm build   # phase gate
pnpm test:e2e                  # Playwright golden path (needs db + seeded data)
```

## Layout
- `src/app` routes (UI + `/api`), `src/components` UI, `src/lib/{db,auth,llm,pipeline,security,ingest,i18n}`,
  `src/worker`, `seed/`, `tests/`, `docs/`, `drizzle/` (migrations).

## Conventions
- Business logic = pure functions with unit tests (`src/lib/pipeline/*`), DB glue separate.
- Every query filters by `company_id` (tenant isolation). Every route/action goes through `guard()`.
- Human-facing AI/code text is bilingual jsonb `{en, ru}` (`L10n`); UI strings via `t()`.
- Seed files contain raw messages only. Never show invented metrics; seeded history = "Demo data".
- Ported Iva files carry `// Adapted from iva-agent (MIT), see THIRD_PARTY_NOTICES.md`.
- No `any` without a comment. Prompts in `src/lib/llm/prompts/*.ts` (English).
- Commit at the end of each phase: `phase N: <summary>`. Never push, never deploy.
