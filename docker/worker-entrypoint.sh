#!/bin/sh
# Worker container start: apply migrations, seed the demo on an empty DB, then run the worker.
set -e
node dist/migrate.mjs
if [ "$DEMO_MODE" = "true" ]; then
  node dist/seed.mjs --if-empty
fi
exec node dist/worker.mjs
