---
id: 7PEIYtmWSGJmhdULB6hRz
session_id: audit-build-pipeline-2026-04-09
agent_id: mcp
task: [project:amp] Full build pipeline and configuration health audit of AMP monorepo on Cerebro
outcome: approved
created_at: "2026-04-09T09:12:47.069Z"
---

[project:amp] Comprehensive audit of AMP monorepo build pipeline and configuration on Cerebro (2026-04-09).

BUILD PIPELINE: CRITICAL FAILURE. `npm run build` fails with TS5055 errors — stale .d.ts files in packages/core/dist/ are treated as inputs because the root tsconfig.json sets declarationMap:true and the composite build sees the dist/ output as overlapping. The fix is to either clean dist/ before builds or ensure the root tsconfig does not include dist/ paths. Additionally, no package-level tsconfig.json files declare TypeScript project references to their workspace dependencies — this means incremental builds cannot track cross-package changes correctly.

PACKAGE.JSON HEALTH: Mostly healthy but with issues. All 9 packages have their own package.json. Inter-workspace deps use bare "*" instead of "workspace:*" — this works with npm workspaces but is less explicit. The @amp/core package has @amp/redis and @amp/neo4j as devDependencies, creating a circular-ish pattern. The @amp/mcp package uses "build": "tsc" (not "tsc -b") unlike the other 8 packages. The "main" fields point to src/index.ts (source) instead of dist/index.js (built), which is fine for tsx runtime but incorrect for compiled usage.

DEPENDENCY VERSIONS: 8 vulnerabilities (7 moderate, 1 high). High: path-to-regexp ReDoS. Moderate: hono and vite issues. All fixable via `npm audit fix`. Dependencies are well-deduped — neo4j-driver and zod resolve to single versions.

ENVIRONMENT HANDLING: CRITICAL SECURITY ISSUE — /etc/amp/env contains plaintext OPENAI_API_KEY and AMP_API_TOKEN with production values. The .env and .env.example are out of sync: .env is missing AMP_API_TOKEN and REDIS_PASSWORD vars that are in .env.example. Code references AMP_API_TOKEN, AMP_EXPORT_PATH, MCP_PORT, PORT, and AMP_ALLOW_UNAUTHENTICATED, but only AMP_API_TOKEN and AMP_EXPORT_PATH are in .env.example; PORT and AMP_ALLOW_UNAUTHENTICATED are not documented.

DOCKER COMPOSE: Out of sync with reality. docker-compose.yml defines 3 services (redis, neo4j, amp-service), but the containers are NOT running via compose — they were started standalone with different configs. Running Neo4j is neo4j:5-community (not 5.26-community as in compose). Running Redis has no password (compose specifies --requirepass). The amp-service container is not running at all. Dockerfile is missing the wiki package COPY step.

SYSTEMD: Healthy with minor issues. amp-mcp.service has Restart=always with RestartSec=5 — crash recovery works. amp-wiki.service also restarts. The HOST=0.0.0.0 env var set in systemd is never read by the server code. Two timers (snapshot nightly, wiki-compile every 6h) are active.

GIT HEALTH: Mostly healthy. .env is properly gitignored and never committed. dist/ is not tracked. No secrets in repo history. However, docs/superpowers/plans/ files ARE tracked despite docs/superpowers/ being in .gitignore — they were committed before the gitignore rule was added. The packages/oni/ directory exists on disk but is not in workspaces and is gitignored. Git repo is small at 3.1MB.