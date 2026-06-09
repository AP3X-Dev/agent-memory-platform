---
id: RHcdPqpDmN4xrUodKPT0i
session_id: session-20260607-prodhardening
agent_id: mcp
task: [project:amp] Multi-tenancy Phase 3 complete + per-actor audit identity; only JWT/OIDC remains (needs a provider decision).
outcome: approved
created_at: "2026-06-07T21:54:28.612Z"
---

[project:amp] Multi-tenancy is now FULLY complete (commits c03d06b, b3a9ae9 + earlier phases). Phase 3 landed: (1) berry_context/berry_ask are tenant-scoped (UnifiedAssembler threads tenantId into ampService.load + the arch fulltext query) and exposed to tenant sessions bound to the session tenant; context forces the 'ranked' strategy for named tenants because the deterministic path queries un-tenant-stamped Entity nodes. (2) Redis block cache is tenant-namespaced (amp:block:<tenant>:scope:name) so the non-default-tenant cache bypass was removed. (3) Graduation seam: MEMBERRY_TENANT_DATASTORES (JSON tenant→{neo4jUri,neo4jPassword,redisUrl,...}) routes a tenant to its OWN Neo4j/Redis via a per-tenant ServiceContainer registry (setTenantContainer/coreContainerForTenant in mcp/tools.ts); dedicated cores are migrated at boot + closed on shutdown. (4) Per-tenant admin: neo4j TenantAdmin (stats/export/delete — delete refuses 'default', batched DETACH DELETE) + `memberry tenant stats|export|delete --tenant <name> [--out f] [--yes]` CLI. (5) Per-actor audit: ServiceContainer.actor bound from the session token (actorFor); berry_store stamps episode agent_id with the real actor instead of the hardcoded 'mcp'.

Verified: full suite exit 0; LIVE adversarial tests pass (tenant-isolation.regression.test.ts: A never sees B across semantics/blocks/facts; tenant-admin.test.ts: delete only the named tenant + refuse default). Done via 5 parallel sub-agents across the phases + my integration.

ONLY genuinely-remaining roadmap item: JWT/OIDC auth — needs a PRODUCT DECISION (self-issued JWT with claims/expiry/revocation vs delegate to Auth0/Okta/Clerk) before building; current auth is static bearer + per-actor named tokens + per-tenant tokens. Optional small follow-up: extend audit append (currently store path) to block/consolidation/bootstrap mutations (per-actor identity already wired). DeterministicAssembler + Entity nodes are not tenant-stamped (so deterministic context is ranked-forced for tenants — safe, not leaked).