# Victor AI

**We read your team's chats for you and drive every customer task to completion.**
AI control layer for customer work in Telegram chats, built for US trucking carriers and brokers.

- Dispatcher: one screen with chats sorted by urgency, a merged cross-chat timeline and one suggested
  next message (Approve / Edit / Dismiss). Edits with a reason become learned playbook rules.
- Team lead: which dispatcher is not coping and where; handoff brief when someone leaves.
- Owner: 3 KPIs and at most 5 things that need attention. Nothing else.

Tasks, signals and suggestions are produced by the pipeline from raw messages — the seed contains
raw chat messages only. Without API keys the deterministic **mock** provider runs the whole demo offline.

## Quick start

```bash
cp env.example .env
docker compose up -d db
pnpm install && pnpm db:migrate && pnpm seed
pnpm dev                     # http://localhost:3001/login → one-click demo logins
```

Everything in Docker: `docker compose up -d --build`.

| Doc                                          | What                                                      |
| -------------------------------------------- | --------------------------------------------------------- |
| [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md)   | 5-minute presenter script (RU) + fallback plan            |
| [docs/DEPLOY.md](docs/DEPLOY.md)             | VPS, PaaS and laptop recipes; Telegram bot setup          |
| [docs/SECURITY.md](docs/SECURITY.md)         | threat model and mitigations                              |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | ingestion → pipeline → signals → screens                  |
| [docs/IVA_REUSE.md](docs/IVA_REUSE.md)       | what was ported from iva-agent (MIT)                      |
| [docs/screenshots/](docs/screenshots/)       | every screen, produced by the Playwright golden-path test |

Checks: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`; end-to-end: `pnpm test:e2e`.
