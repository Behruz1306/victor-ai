# Deploy

Victor AI runs anywhere that runs Docker containers: **Postgres 16 + pgvector**, a **web** process
(Next.js, port 3001) and a **worker** process (Telegram long polling, job queue, SLA loop).
Nothing needs a public webhook: the bot uses long polling.

The `Dockerfile` has three targets:

| Target          | Contents                                                                                                                                    | Used by                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `web`           | Next.js standalone server, non-root, healthcheck on `/api/health`                                                                           | docker compose                          |
| `worker`        | worker bundle + production `node_modules`; on start applies migrations and (if `DEMO_MODE=true` and the DB is empty) seeds the demo company | docker compose                          |
| `app` (default) | both of the above in one image; runs **web** by default, **worker** with start command `./worker-entrypoint.sh`                             | PaaS with "two services from one image" |

## Environment

Copy the template and fill it in: `cp env.example .env`. Every variable is documented there.

| Variable                                      | Required      | Notes                                                                                                                               |
| --------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                | yes (PaaS)    | compose sets it automatically for the bundled `db`                                                                                  |
| `SESSION_SECRET`                              | yes in prod   | 32+ random chars: `openssl rand -hex 32`. If missing, the web container generates a random one at start (sessions reset on restart) |
| `APP_URL`                                     | yes           | public URL; `https://…` makes session cookies `Secure`                                                                              |
| `ANTHROPIC_API_KEY`                           | no            | enables real AI (`claude-sonnet-5` main, `claude-haiku-4-5-20251001` fast). Empty = mock provider                                   |
| `LLM_BASE_URL` + `LLM_API_KEY`                | no            | OpenAI-compatible endpoint (e.g. OpenRouter) instead of Anthropic                                                                   |
| `LLM_MODEL`, `LLM_FAST_MODEL`, `LLM_PROVIDER` | no            | override models / force `mock`                                                                                                      |
| `TELEGRAM_BOT_TOKEN`                          | for live mode | from @BotFather, see below                                                                                                          |
| `TELEGRAM_COMPANY_ID`                         | no            | company the bot belongs to; default = first company                                                                                 |
| `TELEGRAM_BUSINESS_ENABLED`                   | no            | ingest Telegram Business 1:1 chats                                                                                                  |
| `SEND_MODE`                                   | no            | default for new companies: `copy` (human pastes) or `bot`                                                                           |
| `DEMO_MODE`                                   | no            | `true` = demo logins, `/demo` control room, demo seed on an empty DB. **Set `false` for real customers**                            |
| `DATA_RETENTION_DAYS`                         | no            | default 90                                                                                                                          |
| `POSTGRES_PASSWORD`                           | compose only  | password of the bundled database                                                                                                    |

## (a) Any Ubuntu VPS with Docker Compose

```bash
# 1. Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker

# 2. Code + config
git clone <your-repo-url> victor-ai && cd victor-ai
cp env.example .env
sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$(openssl rand -hex 32)|" .env
sed -i "s|^APP_URL=.*|APP_URL=https://victor.example.com|" .env
echo "POSTGRES_PASSWORD=$(openssl rand -hex 16)" >> .env
nano .env        # ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN, DEMO_MODE=false for production

# 3. Start (migrations run automatically in the worker container)
docker compose up -d --build
docker compose ps                     # db, worker, web → healthy
curl -s localhost:3001/api/health     # {"ok":true,"db":"up",...}

# 4. Logs / updates
docker compose logs -f worker
git pull && docker compose up -d --build
```

HTTPS: put a reverse proxy in front of port 3001, e.g. Caddy:

```bash
sudo apt install -y caddy
echo 'victor.example.com { reverse_proxy 127.0.0.1:3001 }' | sudo tee /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Postgres is published only on `127.0.0.1:5433` (not to the internet). Backups:
`docker compose exec db pg_dump -U pulse pulse | gzip > victor-ai-$(date +%F).sql.gz`
(the database user/name stay `pulse` — renaming them would orphan the existing volume).

To use a **managed Postgres** instead of the bundled one, set `DATABASE_URL` in `.env`, remove the
`db` service and the `depends_on: db` entries. The first migration runs
`CREATE EXTENSION IF NOT EXISTS vector` — enable pgvector on the provider if it requires it.

## (b) PaaS that builds from a Dockerfile and provides Postgres

Create **one Postgres** and **two services from the same repository / Dockerfile** (default target `app`):

| Service        | Start command                     | Port                     | Health check      |
| -------------- | --------------------------------- | ------------------------ | ----------------- |
| `victor-worker` | `./worker-entrypoint.sh`          | none (background worker) | —                 |
| `victor-web`    | _(default)_ `./web-entrypoint.sh` | 3001 (HTTP)              | `GET /api/health` |

Set on **both** services: `DATABASE_URL` (from the provider's Postgres), `SESSION_SECRET`,
`APP_URL`, `ANTHROPIC_API_KEY` (optional), `TELEGRAM_BOT_TOKEN` (optional), `DEMO_MODE`.

Order: deploy **worker first** (it applies migrations and seeds the demo DB), then web.
Run **exactly one** worker instance — Telegram long polling allows a single consumer per bot token.
Web can scale horizontally (the login rate limiter is per instance, see SECURITY.md).

If the platform can pick a Docker build target, you can use `--target web` / `--target worker`
instead (smaller images, same commands as in compose).

## (c) Local demo laptop (fallback, works offline)

```bash
cd victor-ai
cp env.example .env                      # leave ANTHROPIC_API_KEY empty → mock provider, no internet needed
docker compose up -d db                  # Postgres on localhost:5433
pnpm install
pnpm db:migrate
pnpm seed                                # demo company + raw "yesterday" messages
pnpm dev                                 # web on :3001 + worker
open http://localhost:3001/login         # Enter as Owner / Team lead / Dispatcher
```

Everything in Docker instead: `docker compose up -d --build` → http://localhost:3001.

If the venue has no internet, the mock provider keeps the whole golden path working
(`LLM_PROVIDER=mock` forces it even with a key set). See `docs/DEMO_SCRIPT.md` → «План Б».

## Telegram bot

1. In Telegram open **@BotFather** → `/newbot` → name (`Victor AI`) → username ending in `bot`
   (the demo uses `@victorai5_bot`). Copy the token into `.env` as `TELEGRAM_BOT_TOKEN=...`.
2. **Disable group privacy** so the bot receives every group message, not only commands:
   `/setprivacy` → choose the bot → **Disable**. (Settings → Telegram shows "Reads all group
   messages: Yes" when this is right. If you change it after adding the bot, remove and re-add the
   bot to the group.)
3. Optional, for 1:1 chats: `/mybots` → bot → **Bot Settings → Business Mode → Turn on**, then in the
   Telegram app of the business account: **Settings → Telegram Business → Chatbots** → add the bot.
   Set `TELEGRAM_BUSINESS_ENABLED=true`.
4. Restart the worker (`docker compose restart worker` or `pnpm dev:worker`). Its log prints
   `[telegram] long polling as @victorai5_bot`.
5. Add the bot to a work group (group → **Add members** → search the bot username).
6. In Victor AI: **Sources → Unmapped chats** — the group appears with an AI proposal. Pick the customer
   and chat type → **Map**. From now on every message is analyzed.
7. Optional: **Post consent notice** in Sources sends the monitoring notice into the group.

Live test: write `Need a reefer PU tomorrow 7am Dallas → Atlanta, can you cover?` in a group mapped
as a customer chat of Apex Logistics — within ~15 s the Dispatcher screen shows the new task and a
suggested reply.
