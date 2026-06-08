---
id: b1ZRlMZYONz4yXwi8zCU9
session_id: session-20260607-prodhardening
agent_id: mcp
task: [project:amp] Ship v0.1.0: durable extraction queue, memory-quality CI gate, security docs, and a tagged GitHub release.
outcome: approved
created_at: "2026-06-07T12:04:42.201Z"
---

[project:amp] Second hardening round (same day), then released v0.1.0.

Durable fact-extraction: new Redis-Stream ExtractionQueue (packages/redis/src/extraction.ts) with consumer group, dead-letter queue, and XAUTOCLAIM crash recovery. AMPService.store() now enqueues a job (durable) when a queue is wired, with an in-process fallback when not (so unit tests/CLI keep working). A long-lived ExtractionConsumer (packages/core/src/extraction-consumer.ts) drains it, retrying with incremented attempt and dead-lettering after maxAttempts. Refactored the old _extractFactsBackground into a single-attempt _extractFactsOnce + a public processExtraction the consumer calls. Admin/observability via `memberry extraction status|replay`. Consumer started in MCP bootstrap, stopped on shutdown.

Memory-quality CI gate: an existing deterministic eval (packages/retrieval/bench/quality-eval.ts: 41 docs, 12 golden queries, lexical/RRF/MMR path, no embeddings) was surfaced as `npm run bench:quality` (bench/quality/eval.ts) and wired into the CI unit job. Baseline Recall@5 0.882, Recall@10 0.931, MRR 0.903, nDCG@10 0.847; thresholds set just below.

Security docs: SECURITY.md + THREAT-MODEL.md at repo ROOT. IMPORTANT: docs/ is gitignored on purpose ("never published" — planning material), so published docs must NOT go in docs/.

Released v0.1.0: all packages already at 0.1.0, so just CHANGELOG.md + annotated tag + GitHub release (AP3X-Dev/memberry). Four clean commits, no co-author/AI trailers (verified), then pushed master + tag.

Process note: the external reviewer's second pass reported the Docker/compose/embedding fixes as still-broken, but that was a stale/cached fetch of a non-master branch (rebrand/memberry + feat/honcho-enhancements still carry the OLD Dockerfile/compose). origin/master demonstrably has every fix; verified via git show origin/master. When a review contradicts a known-pushed change, verify against origin/<default-branch> before acting.