---
id: TgZ1rf7AEEzd3V636TFxz
session_id: session-20260607-prodhardening
agent_id: mcp
task: [project:amp] Production-hardening sprint addressing the external engineering review (targets: architecture, engineering execution, production readiness, ship-to-customers).
outcome: approved
created_at: "2026-06-07T10:39:40.142Z"
---

[project:amp] Completed a production-hardening sprint on MemBerry. Key decisions and outcomes:

1. No-key embeddings: added `available?: boolean` to EmbeddingProvider; the no-OPENAI_API_KEY provider is now `disabledEmbedding` (available:false) instead of a silent zero-vector provider. Core load (_vectorSearch), code search (vectorSearch/semanticVectorSearch), and retrieval intent classification now SKIP vector queries when unavailable and fall back to deterministic lexical/fulltext — eliminating the "random results" failure mode. EMBEDDING_DIM is env-configurable via MEMBERRY_EMBEDDING_DIM.

2. Schema migrations: new packages/neo4j/src/migrations.ts with a forward-only runner (SchemaVersion node, ordered Migration[], idempotent, records progress per-migration). Baseline=0001 (existing initSchema), 0002=AuditLog indexes. bootstrap now calls runMigrations + checkVectorIndexDimensions (drift warning). Design principle documented: neutral node IDs make schema additive/backward-compatible.

3. Raw Cypher: validateReadOnlyCypher now NFKC-normalizes (folds fullwidth homoglyphs), rejects stacked statements (embedded ;), and rawCypher executes in a server-enforced READ transaction (defaultAccessMode READ) — defense in depth so it can never mutate even if validation is bypassed. The reviewer's "arbitrary Cypher" claim was already mostly mitigated (read-only validation + admin-domain gating).

4. Read/write separation + safety: MEMBERRY_READONLY rejects all writes (AMPService.store + MemoryBlockService writes). MEMBERRY_REDACT_ON_INGEST redacts secrets (new core/redact.ts) before persistence. Append-only audit trail (neo4j AuditLogStore) records store mutations with actor.

5. Service container: replaced the 8 module-level singleton globals in mcp/tools.ts with a single typed ServiceContainer; buildToolHandlers(container)/registerTools(server,registry,container) accept an explicit container (per-instance/multi-tenant isolation now possible). setServiceInstances kept as back-compat populating a default container. Fixed a latent bug: bootstrap's 2nd setServiceInstances call omitted provenance and nulled it, silently disabling berry_provenance.

6. Per-actor auth: MEMBERRY_API_TOKENS (name:token,...) multiple named tokens with constant-time comparison (timingSafeEqual) for individual revocation; back-compat with single MEMBERRY_API_TOKEN.

7. Packaging: fixed Dockerfile (all 10 workspace manifests; multi-stage build), self-contained docker-compose (Redis service added, env-driven passwords, managed volumes), one-command `npm run setup` + `npm run smoke`. CRITICAL fix: tsconfig.build.json omitted packages/wiki so it was never compiled; added it. Created 3 missing node_modules/@memberry symlinks (research/retrieval/wiki).

IMPORTANT runtime finding: the monorepo MUST run on tsx (not `node dist`) because core<->neo4j have a type-level circular dependency, so cross-package runtime resolution is wired through src ("exports" point to src). Attempting dist-based exports breaks tsc -b project references (circular). tsx is therefore the supported runtime and is now a real (non-dev) dependency so it survives Docker prune.

Added explicit memory-quality regression tests for all 7 reviewer guarantees (no-embedding determinism, load-excludes-invalidated, correction>reinforcement, scope isolation, etc.). Full suite green across all 10 packages (1300+ tests, exit 0).