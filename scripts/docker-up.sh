#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${MAGI_ENV_FILE:-"$ROOT_DIR/docker/.env"}"

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ROOT_DIR/docker/.env.example" "$ENV_FILE"
fi

docker compose -f "$ROOT_DIR/docker/docker-compose.yml" --env-file "$ENV_FILE" up postgres redis -d
