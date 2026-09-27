#!/bin/sh
# Web container start. Without SESSION_SECRET we generate a random one instead of using a
# known default: safe, but sessions reset whenever the container restarts.
if [ -z "$SESSION_SECRET" ]; then
  SESSION_SECRET=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
  export SESSION_SECRET
  echo "[web] SESSION_SECRET not set - generated a random one (set it in .env to keep sessions across restarts)"
fi
cd "${WEB_DIR:-/app}"
exec node server.js
