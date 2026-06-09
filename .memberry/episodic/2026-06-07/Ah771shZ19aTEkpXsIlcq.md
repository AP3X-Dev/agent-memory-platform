---
id: Ah771shZ19aTEkpXsIlcq
session_id: session-20260607-prodhardening
agent_id: mcp
task: [project:amp] Tenant isolation: chose hybrid model (D); shipped DI-threading foundation + tenant-isolation phase 1.
outcome: approved
created_at: "2026-06-07T20:25:31.646Z"
---

[project:amp] Per-tenant isolation decision: HYBRID (option D) — logical isolation as the default (one shared Neo4j+Redis, a tenant_id forced into every query) PLUS a per-session-container seam to graduate an individual tenant to its own dedicated stack later. Driver: Neo4j Community supports only one user DB, so DB-per-tenant (Enterprise) can't be the OSS default; logical + optional dedicated-stack works on Community.

Prereq DONE: DI threading through all 6 satellite tool packages (research/arch/code/retrieval/wiki/graph) — each has an injectable XServiceContainer + createXContainer + default; registerXTools/buildWikiToolHandlers take an optional container; setXServiceInstances writes the default (bootstrap/server unchanged). commit b302365.

Tenant isolation PHASE 1 DONE (commit e89e0bc), OPT-IN + inert by default: DEFAULT_TENANT='default'; new packages/neo4j/src/tenant.ts `tenantWhere(alias,tenantId)` primitive — default tenant matches legacy NULL tenant_id (ZERO migration), a named tenant matches strictly; tenant_id is always a bound param (injection-safe). store() stamps tenant_id (episodic.create persists it); load() threads tenantId into byScope + byVector (byVector over-fetches limit*5 then tenant-filters so a tenant isn't starved). Migration 0003 indexes tenant_id. Single-tenant behavior byte-for-byte unchanged.

REMAINING for D: phase 1b = MCP activation (MEMBERRY_TENANT_TOKENS token→tenant in server.ts + per-session container binding tenantId + handlers passing it + disable berry_query in multi-tenant mode). phase 2 = extend enforcement to facts/blocks/audit/grep/satellite queries + consolidation semantic-tenant propagation + Redis key namespacing + adversarial cross-tenant tests. phase 3 = graduation seam (tenant→dedicated connection) + per-tenant export/delete + SECURITY.md/THREAT-MODEL update. Also still open separately: JWT/OIDC, audit beyond store path.