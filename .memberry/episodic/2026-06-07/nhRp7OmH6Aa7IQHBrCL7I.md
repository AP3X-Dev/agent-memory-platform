---
id: nhRp7OmH6Aa7IQHBrCL7I
session_id: session-20260607-prodhardening
agent_id: mcp
task: [project:amp] Tenant isolation phase 1b shipped (activation + default-deny); phase 2 enforcement breadth is next.
outcome: approved
created_at: "2026-06-07T20:55:06.387Z"
---

[project:amp] Tenant isolation PHASE 1b DONE (commit b29e10c). MEMBERRY_TENANT_TOKENS="tenant:token,..." turns on multi-tenant mode and binds each request to its tenant (constant-time match in server.ts; tenant tokens are also valid auth tokens with actor=tenant). Per-session MCP server is registered with a tenant-bound ServiceContainer (new container.tenantId; coreContainerForTenant()). berry_load/berry_store thread tenantId into the already-tenant-filtered core path. DEFAULT-DENY: in a tenant session, every tool not in TENANT_SAFE_TOOLS (currently berry_load, berry_store, berry_tools) is replaced with a refusal, and the not-yet-scoped satellite + retrieval domains are not registered at all — so a not-yet-tenant-scoped path can NEVER serve cross-tenant data. Single-tenant unchanged. Full suite green.

PHASE 2 (remaining, the enforcement breadth — each item also ADDS the tool to TENANT_SAFE_TOOLS once scoped): tenant-scope berry_grep (rawCypher grep — add tenant filter per node-type branch), memory blocks (neo4j BlockStore + core MemoryBlockService: stamp tenant_id + filter reads, thread from container), facts (FactStore.getActive/findBySubjectPredicate/byFacts + propagate tenant from source episode during extraction), berry_context/berry_ask (UnifiedAssembler tenant threading), consolidation (Semantic nodes inherit tenant_id from source episodes so byScope/byVector filtering is meaningful for non-default tenants), Redis key namespacing per tenant (cache/dedup/embeddings/blocks), audit tenant stamp. Then ADVERSARIAL cross-tenant integration tests (tenant A never sees B across every path) — required before documenting multi-tenant as production-ready. Phase 3 = graduation seam (tenant→dedicated Neo4j/Redis connection via the per-session container) + per-tenant export/delete + SECURITY.md/THREAT-MODEL update. Also still open separately: JWT/OIDC, audit beyond store path.