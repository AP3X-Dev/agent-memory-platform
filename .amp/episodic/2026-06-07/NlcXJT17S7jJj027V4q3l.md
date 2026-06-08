---
id: NlcXJT17S7jJj027V4q3l
session_id: session-20260607-prodhardening
agent_id: mcp
task: [project:amp] Tenant isolation Phase 2 complete: full enforcement across the memory surface + adversarial cross-tenant gate passing live.
outcome: approved
created_at: "2026-06-07T21:34:41.159Z"
---

[project:amp] Tenant isolation PHASE 2 COMPLETE (commits 3894bd5, 2a6e2f3, 22ad211). Enforcement is now applied on every EXPOSED memory path, verified by an adversarial cross-tenant test against LIVE Neo4j (packages/neo4j/src/__tests__/tenant-isolation.regression.test.ts: tenant A never sees B across semantics/blocks/facts; default tenant still sees legacy NULL rows).

What landed: reads filter by tenant via tenantWhere — semantics (byScope/byVector over-fetch+filter), facts (getActive/findBySubjectPredicate/timeline/diff/byFacts), blocks (get/list/delete), grep (every node-type subquery). Writes stamp tenant_id — episodes, facts (extraction propagates the source episode's tenant through the durable Redis queue: ExtractionJob.tenantId → consumer → processExtraction → _extractFactsOnce), blocks, and consolidation-promoted semantics (tenant derived from source episodes). Cache key (hashScope) + store dedup are tenant-namespaced. Schema: MemoryBlock uniqueness widened to (scope,name,tenant_id) — fixed in schema.ts AND migration 0004 (drop legacy memblock_scope_name constraint + backfill existing blocks to 'default'). KEY GOTCHA found+fixed: schema.ts initSchema kept RE-CREATING the legacy (scope,name) constraint (schema.test.ts runs initSchema), which blocked cross-tenant same-name blocks — schema.ts now declares memblock_scope_name_tenant instead. TENANT_SAFE_TOOLS expanded to load/store/grep/memory_*/timeline/fact_diff; default-deny withholds berry_query + not-yet-scoped satellite/retrieval (berry_context/berry_ask) from tenant sessions. Docs updated (SECURITY.md multi-tenant section, THREAT-MODEL residual risk, .env.example MEMBERRY_TENANT_TOKENS). Full suite green; neo4j 175/175 live.

Done via 3 parallel sub-agents (blocks, facts, consolidation) + my integration (grep, extraction chain, cache/dedup, schema, MCP threading, adversarial test). SINGLE-TENANT behavior unchanged throughout (tenant defaults to 'default' which matches legacy NULL).

Safe-withheld (Phase 3 follow-ups, NOT leaks — they're default-denied): berry_context/berry_ask (UnifiedAssembler tenant threading), Redis block-cache namespacing (currently bypassed for non-default tenants), the graduation seam (route a tenant to its own Neo4j/Redis via the per-session ServiceContainer), per-tenant export/delete. Also still open: JWT/OIDC, audit beyond store path.