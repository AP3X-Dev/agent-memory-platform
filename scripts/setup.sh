#!/usr/bin/env bash
#
# MemBerry guided setup.
#
# Stands up the whole stack — Neo4j, Redis, and the MemBerry MCP server — in
# Docker with a single command. Only Docker is required; Node is optional (the
# server image builds itself).
#
#   ./setup.sh                 # guided (prompts when run in a terminal)
#   ./setup.sh --yes           # non-interactive, accept all defaults
#   ./setup.sh --db-only       # start only Neo4j + Redis (run the server yourself)
#   ./setup.sh --reconfigure   # re-run the wizard even if .env already exists
#
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

# ── Pretty output ───────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  B=$'\033[1m'; BLUE=$'\033[1;34m'; YEL=$'\033[1;33m'; RED=$'\033[1;31m'; GRN=$'\033[1;32m'; DIM=$'\033[2m'; R=$'\033[0m'
else
  B=''; BLUE=''; YEL=''; RED=''; GRN=''; DIM=''; R=''
fi
log()  { printf '%s[setup]%s %s\n' "$BLUE" "$R" "$*"; }
ok()   { printf '%s[setup]%s %s\n' "$GRN" "$R" "$*"; }
warn() { printf '%s[setup]%s %s\n' "$YEL" "$R" "$*" >&2; }
fail() { printf '%s[setup]%s %s\n' "$RED" "$R" "$*" >&2; exit 1; }

# ── Flags ───────────────────────────────────────────────────────────────────────
ASSUME_YES=0; DB_ONLY=0; RECONFIGURE=0
for arg in "$@"; do
  case "$arg" in
    --yes|-y) ASSUME_YES=1 ;;
    --db-only) DB_ONLY=1 ;;
    --reconfigure) RECONFIGURE=1 ;;
    -h|--help) grep -E '^#( |$)' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) fail "Unknown option: $arg (try --help)" ;;
  esac
done

INTERACTIVE=0
if [ "$ASSUME_YES" -eq 0 ] && [ -t 0 ] && [ -t 1 ]; then INTERACTIVE=1; fi

# ── Helpers ─────────────────────────────────────────────────────────────────────
gen_secret() {
  # N random bytes as hex; fall back to /dev/urandom if openssl is missing.
  if command -v openssl >/dev/null 2>&1; then openssl rand -hex "${1:-24}"
  else LC_ALL=C tr -dc 'a-f0-9' </dev/urandom | head -c "$(( ${1:-24} * 2 ))"; fi
}

# set_env KEY VALUE — update KEY=… in .env (handles values with / : @), else append.
set_env() {
  local key="$1" val="$2" file=".env"
  touch "$file"
  if grep -qE "^${key}=" "$file"; then
    KEY="$key" VAL="$val" awk '
      BEGIN { k=ENVIRON["KEY"]; v=ENVIRON["VAL"] }
      $0 ~ "^"k"=" { print k"="v; next }
      { print }
    ' "$file" >"$file.tmp" && mv "$file.tmp" "$file"
  else
    printf '%s=%s\n' "$key" "$val" >>"$file"
  fi
}

prompt() { # prompt VAR "question" "default"  (reads only when INTERACTIVE)
  local __var="$1" __q="$2" __def="${3:-}" __ans=''
  if [ "$INTERACTIVE" -eq 1 ]; then
    if [ -n "$__def" ]; then printf '%s[setup]%s %s %s[%s]%s ' "$BLUE" "$R" "$__q" "$DIM" "$__def" "$R" >&2
    else printf '%s[setup]%s %s ' "$BLUE" "$R" "$__q" >&2; fi
    read -r __ans || __ans=''
  fi
  printf -v "$__var" '%s' "${__ans:-$__def}"
}

# ── Prerequisites ───────────────────────────────────────────────────────────────
printf '\n%s== MemBerry setup ==%s\n\n' "$B" "$R"
log "Checking prerequisites..."
command -v docker >/dev/null 2>&1 || fail "Docker is required but was not found on PATH. Install Docker, then re-run."
docker compose version >/dev/null 2>&1 || fail "The Docker Compose v2 plugin is required ('docker compose'). Install it and retry."
docker info >/dev/null 2>&1 || fail "Docker is installed but the daemon is not reachable. Start Docker and retry."
ok "Docker $(docker --version | awk '{print $3}' | tr -d ',') + Compose v2"

# ── Configure (.env) ────────────────────────────────────────────────────────────
if [ -f .env ] && [ "$RECONFIGURE" -eq 0 ]; then
  log ".env already present — reusing it (pass --reconfigure to redo)."
else
  [ -f .env.example ] || fail ".env.example is missing — cannot generate .env."
  cp -f .env.example .env
  log "Generating .env (secrets are random and saved only locally)..."

  OPENAI_KEY=''
  if [ "$INTERACTIVE" -eq 1 ]; then
    printf '%s         Embeddings & extraction use OpenAI. Without a key, MemBerry still runs\n' "$DIM"
    printf '         with deterministic lexical/fulltext retrieval (no random results).%s\n\n' "$R"
    prompt OPENAI_KEY "OpenAI API key (optional — press Enter to skip):" ""
  fi

  prompt PORT_VAL "MCP server port:" "3101"

  API_TOKEN="mbry_$(gen_secret 24)"
  NEO_PW="$(gen_secret 16)"
  REDIS_PW="$(gen_secret 16)"

  set_env OPENAI_API_KEY "$OPENAI_KEY"
  set_env MEMBERRY_API_TOKEN "$API_TOKEN"
  set_env NEO4J_PASSWORD "$NEO_PW"
  set_env REDIS_PASSWORD "$REDIS_PW"
  # Host-facing URLs (for running CLI/tools on the host); the container overrides
  # these with service-DNS URLs in docker-compose.yml.
  set_env REDIS_URL "redis://:${REDIS_PW}@localhost:6379"
  set_env MCP_PORT "$PORT_VAL"
  ok "Wrote .env (API token generated; DB passwords randomized)."
fi

# Load .env so we can report the token/port and poll health.
set -a; # shellcheck disable=SC1091
. ./.env; set +a
: "${MCP_PORT:=3101}"
: "${MEMBERRY_API_TOKEN:=}"

# ── Bring up the stack ──────────────────────────────────────────────────────────
if [ "$DB_ONLY" -eq 1 ]; then
  log "Starting databases (Neo4j + Redis)..."
  docker compose up -d
else
  log "Building and starting the full stack (Neo4j + Redis + MemBerry)..."
  log "The first build compiles all packages in Docker and may take a few minutes."
  docker compose --profile app up -d --build
fi

# ── Wait for health ─────────────────────────────────────────────────────────────
log "Waiting for services to become healthy..."
if [ "$DB_ONLY" -eq 1 ]; then
  for _ in $(seq 1 30); do
    if wget -qO- "http://localhost:7474" >/dev/null 2>&1 || curl -fsS "http://localhost:7474" >/dev/null 2>&1; then break; fi
    sleep 2
  done
  ok "Databases are up. Run the server on the host:  ${B}npm install && npm start${R}"
else
  health_ok=0
  for _ in $(seq 1 60); do
    if curl -fsS "http://localhost:${MCP_PORT}/healthz" >/dev/null 2>&1 \
       || wget -qO- "http://localhost:${MCP_PORT}/healthz" >/dev/null 2>&1; then
      health_ok=1; break
    fi
    sleep 2
  done
  if [ "$health_ok" -eq 1 ]; then ok "MemBerry is healthy at http://localhost:${MCP_PORT}/healthz"
  else warn "Server did not pass the health check in time. Check logs: ${B}docker compose --profile app logs mcp${R}"; fi
fi

# ── Done — connection details ────────────────────────────────────────────────────
printf '\n%s== Setup complete ==%s\n\n' "$GRN" "$R"
if [ "$DB_ONLY" -eq 0 ]; then
  cat <<EOF
${B}Your MemBerry MCP server is running:${R}
  URL:    http://localhost:${MCP_PORT}/mcp
  Token:  ${MEMBERRY_API_TOKEN:-<none — set MEMBERRY_API_TOKEN in .env>}

${B}Connect an agent${R} — add this to your MCP client config:
  {
    "mcpServers": {
      "memberry": {
        "url": "http://localhost:${MCP_PORT}/mcp",
        "headers": { "Authorization": "Bearer ${MEMBERRY_API_TOKEN}" }
      }
    }
  }

${B}Handy commands${R}
  Logs:    docker compose --profile app logs -f mcp
  Stop:    docker compose --profile app down
  Status:  curl http://localhost:${MCP_PORT}/healthz
EOF
fi
[ -z "${OPENAI_API_KEY:-}" ] && warn "No OPENAI_API_KEY set — running with lexical/fulltext retrieval only. Add one to .env and restart to enable embeddings."
exit 0
