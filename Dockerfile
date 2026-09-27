# syntax=docker/dockerfile:1
# Two targets from one build: `web` (Next.js standalone, port 3001) and `worker`
# (Telegram long polling + job runner + scheduler; also applies migrations on start).

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
ENV NEXT_OUTPUT=standalone
RUN pnpm build

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod

# ── web ────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS web
WORKDIR /app
ENV NODE_ENV=production PORT=3001 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S victor && adduser -S victor -G victor
COPY --from=build --chown=victor:victor /app/.next/standalone ./
COPY --from=build --chown=victor:victor /app/.next/static ./.next/static
COPY --from=build --chown=victor:victor /app/public ./public
COPY --chown=victor:victor docker/web-entrypoint.sh ./entrypoint.sh
USER victor
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3001/api/health >/dev/null || exit 1
CMD ["./entrypoint.sh"]

# ── worker ─────────────────────────────────────────────────────────────────
FROM node:22-alpine AS worker
WORKDIR /app
ENV NODE_ENV=production MIGRATIONS_DIR=/app/drizzle
RUN addgroup -S victor && adduser -S victor -G victor
COPY --from=prod-deps --chown=victor:victor /app/node_modules ./node_modules
COPY --from=build --chown=victor:victor /app/dist ./dist
COPY --from=build --chown=victor:victor /app/drizzle ./drizzle
COPY --from=build --chown=victor:victor /app/seed ./seed
COPY --chown=victor:victor package.json ./
COPY --chown=victor:victor docker/worker-entrypoint.sh ./entrypoint.sh
USER victor
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
  CMD test -f /tmp/victor-worker-heartbeat && [ $(( $(date +%s) - $(stat -c %Y /tmp/victor-worker-heartbeat) )) -lt 120 ] || exit 1
CMD ["./entrypoint.sh"]

# ── app (default target): one image for PaaS — runs web by default, worker with
#    the start command "./worker-entrypoint.sh".
FROM worker AS app
ENV PORT=3001 HOSTNAME=0.0.0.0 WEB_DIR=/app/standalone
COPY --from=build --chown=victor:victor /app/.next/standalone ./standalone
COPY --from=build --chown=victor:victor /app/.next/static ./standalone/.next/static
COPY --from=build --chown=victor:victor /app/public ./standalone/public
COPY --chown=victor:victor docker/web-entrypoint.sh ./web-entrypoint.sh
COPY --chown=victor:victor docker/worker-entrypoint.sh ./worker-entrypoint.sh
EXPOSE 3001
HEALTHCHECK NONE
CMD ["./web-entrypoint.sh"]
