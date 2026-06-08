---
id: g__xxJEWuvSGMzLg4uSg-
session_id: session-20260607-packaging
agent_id: mcp
task: [project:amp] Completed packaging/release hardening
outcome: approved
created_at: "2026-06-07T10:05:49.477Z"
---

[project:amp] Packaging hardening done: mcp/package.json now main=dist/server.js + bin memberry-mcp + start:dist script; Dockerfile rewritten as 2-stage (builder npm ci -> build -> prune --omit=dev; runtime non-root user, COPY node_modules+packages, HEALTHCHECK wget /healthz, CMD node packages/mcp/dist/server.js) — KEY FIX: must COPY scripts/ before npm run build because root build runs node scripts/clean-build-artifacts.mjs (forgetting it breaks the image build). docker-compose.yml made self-contained: env-driven NEO4J_AUTH and redis --requirepass defaulting to memberry-local-dev, added redis:7-alpine service with appendonly + redis-cli healthcheck, all three volumes (neo4j_data/neo4j_plugins/redis_data) now compose-managed (removed external:true + hardcoded names). Added root scripts setup/smoke/start; scripts/setup.sh (idempotent bring-up) and scripts/smoke.mjs (checks 10 dist entries + best-effort /healthz). systemd unit ExecStart -> /usr/bin/node packages/mcp/dist/server.js. README quick-start collapsed to cp .env.example .env + npm run setup. Verified: npm run build exit 0, docker compose config exit 0, docker build exit 0, smoke PASS 11/11 only when wiki dist present. OUTSTANDING (out of scope): wiki dist missing from root build — tsconfig.build.json omits packages/wiki, and wiki/package.json exports.import points at src not dist; both block node-from-dist runtime of @memberry/wiki.