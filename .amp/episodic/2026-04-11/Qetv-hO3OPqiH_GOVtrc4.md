---
id: Qetv-hO3OPqiH_GOVtrc4
session_id: dead-imports-cleanup-20260410
agent_id: mcp
task: [project:amp] Remove dead/unused imports across arch, code, and retrieval packages
outcome: approved
created_at: "2026-04-11T04:47:20.103Z"
---

[project:amp] Audited all source files in packages/arch/src/, packages/code/src/, and packages/retrieval/src/ for unused imports. Found and removed 5 dead imports across 5 files: (1) StabilityTier from arch/context.ts, (2) neo4j default import from arch/entity-store.ts, (3) invalidateRelationship from arch/relation-store.ts, (4) readFile from code/indexer.ts, (5) RetrievalResult from retrieval/deterministic.ts. All other imports were verified as genuinely used. Barrel index.ts files and test files were excluded from the audit.