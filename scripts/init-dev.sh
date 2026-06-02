#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/docker/.env"
ENV_EXAMPLE="$ROOT_DIR/docker/.env.example"

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ENV_EXAMPLE" "$ENV_FILE"
fi

if grep -q "^BETTER_AUTH_SECRET=change-me-to-a-random-32-char-string$" "$ENV_FILE"; then
  if command -v openssl >/dev/null 2>&1; then
    secret="$(openssl rand -base64 32)"
  else
    secret="dev-better-auth-secret-change-before-production"
  fi
  perl -0pi -e "s|^BETTER_AUTH_SECRET=.*$|BETTER_AUTH_SECRET=$secret|m" "$ENV_FILE"
fi

if grep -q "^MAGI_ADMIN_PASSWORD=$" "$ENV_FILE"; then
  perl -0pi -e "s|^MAGI_ADMIN_PASSWORD=$|MAGI_ADMIN_PASSWORD=zxcv1234|m" "$ENV_FILE"
fi

"$ROOT_DIR/scripts/docker-up.sh"

pnpm --filter @magi/api db:migrate
pnpm --filter @magi/api seed

echo
echo "MAGI dev environment is ready."
echo "Web: http://localhost:3000"
echo "API: http://localhost:3001"
echo "Default admin username: admin"
echo "Default admin password: zxcv1234"
