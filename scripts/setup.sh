#!/usr/bin/env bash
#
# MemBerry one-command local bring-up.
#
# Brings up Docker infra (Neo4j + Redis), installs deps, builds all packages,
# and runs a smoke test. Idempotent — safe to re-run.
#
#   npm run setup
#
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

log()  { printf '\033[1;34m[setup]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[setup]\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[1;31m[setup]\033[0m %s\n' "$*" >&2; exit 1; }

# ── Preconditions ──────────────────────────────────────────────────────────────
log "Checking prerequisites..."

command -v node >/dev/null 2>&1 || fail "Node.js is required but was not found on PATH."
node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" -lt 20 ]; then
  fail "Node.js >= 20 required (found $(node --version))."
fi
log "Node $(node --version) OK"

command -v docker >/dev/null 2>&1 || fail "Docker is required but was not found on PATH."
if ! docker compose version >/dev/null 2>&1; then
  fail "The Docker Compose v2 plugin is required ('docker compose'). Install it and retry."
fi
log "Docker $(docker --version | awk '{print $3}' | tr -d ',') OK"

# ── Environment file ───────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  log "No .env found — creating one from .env.example."
  cp .env.example .env
  warn "Created .env. Set OPENAI_API_KEY in .env before using embeddings / extraction."
else
  log ".env already present — leaving it untouched."
fi

# Load passwords from .env (or fall back to the compose defaults) for the polls.
# shellcheck disable=SC1091
set -a
[ -f .env ] && . ./.env
set +a
: "${NEO4J_PASSWORD:=memberry-local-dev}"
: "${REDIS_PASSWORD:=memberry-local-dev}"

# ── Infrastructure ─────────────────────────────────────────────────────────────
log "Starting Docker infrastructure (Neo4j + Redis)..."
docker compose up -d

log "Waiting for Neo4j on http://localhost:7474 (up to ~60s)..."
neo4j_ready=0
for i in $(seq 1 30); do
  if wget -qO- http://localhost:7474 >/dev/null 2>&1 \
     || curl -fsS http://localhost:7474 >/dev/null 2>&1; then
    neo4j_ready=1
    break
  fi
  sleep 2
done
[ "$neo4j_ready" -eq 1 ] && log "Neo4j is up." || warn "Neo4j did not respond within ~60s — continuing; check 'docker compose logs neo4j'."

log "Waiting for Redis (up to ~30s)..."
redis_ready=0
for i in $(seq 1 15); do
  if docker compose exec -T redis redis-cli -a "$REDIS_PASSWORD" ping 2>/dev/null | grep -q PONG; then
    redis_ready=1
    break
  fi
  sleep 2
done
[ "$redis_ready" -eq 1 ] && log "Redis is up." || warn "Redis did not respond within ~30s — continuing; check 'docker compose logs redis'."

# ── Install + build ────────────────────────────────────────────────────────────
log "Installing dependencies (npm ci)..."
npm ci

log "Building all packages (npm run build)..."
npm run build

# ── Smoke test ─────────────────────────────────────────────────────────────────
log "Running smoke test..."
npm run smoke

# ── Done ───────────────────────────────────────────────────────────────────────
log "Setup complete."
cat <<'EOF'

Next steps:
  - Ensure OPENAI_API_KEY is set in .env (needed for embeddings + extraction).
  - Start the MCP server from compiled dist:   npm start
  - Health check:                              curl http://localhost:3101/healthz
  - Wiki viewer (if running):                  http://localhost:3200
EOF
