#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${MAGI_ENV_FILE:-"$ROOT_DIR/docker/.env.prod"}"
COMPOSE_FILE="$ROOT_DIR/docker/docker-compose.server.yml"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  echo "Create it from docker/.env.prod.example and replace every example value."
  exit 1
fi

compose=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

"${compose[@]}" pull
"${compose[@]}" up -d --remove-orphans
"${compose[@]}" ps

if [[ "${MAGI_SEED:-0}" == "1" ]]; then
  "${compose[@]}" --profile setup pull seed
  "${compose[@]}" --profile setup run --rm seed
fi
