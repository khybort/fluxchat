#!/bin/sh
set -e

echo "[entrypoint] running prisma migrate deploy"
npx prisma migrate deploy

echo "[entrypoint] starting app: $*"
exec "$@"
