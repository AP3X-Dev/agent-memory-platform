---
id: 9aT2vHVO5RBzzFy0izRee
session_id: session-20260607-115500
agent_id: mcp
task: [project:amp] Stand up an infra-free memory-quality benchmark (Recall/MRR/nDCG) as a CI gate, reusing existing work
outcome: approved
created_at: "2026-06-07T11:52:59.451Z"
---

[project:amp] Added a root-level memory-quality CI gate without duplicating the existing system. Key discovery: packages/retrieval/bench/quality-eval.ts ALREADY implements a complete deterministic, infra-free Recall@k/MRR/nDCG@k eval over a committed 41-doc / 12-query golden set using the REAL production ranking path (expandQuery -> adaptiveWeights -> rrfFusion + lexicalTextScore + MMR, NO vector embeddings), exports runQualityEval/runConflictEval/QUALITY_THRESHOLDS, has its own CLI exit-non-zero, and is already asserted by packages/retrieval/src/__tests__/quality.regression.test.ts. The retrieval package even already has a package-scoped `bench:quality` script.

Decision: rather than build a parallel system, I created bench/quality/eval.ts as a THIN wrapper that imports those exports, emits a consolidated metrics report (table + gitignored bench/quality/last-run.json), enforces thresholds, and exits non-zero. Added an explicit Recall@5 floor (RECALL_AT_5_MIN=0.85) since the package gate only gates Recall@10; all other thresholds reuse QUALITY_THRESHOLDS (single source of truth). nDCG@k uses nDCG@10 (the eval doesn't expose per-query relevance labels, so computing nDCG@5 would require duplicating the golden set — explicitly avoided).

Measured baseline (deterministic, identical across runs): Recall@5=0.882, Recall@10=0.931, Precision@5=0.400, nDCG@10=0.847, MRR=0.903, intent=1.0, current-above-stale=1.0, stale-leak=0.0. Thresholds set just below: R@5>=0.85, R@10>=0.90, nDCG@10>=0.84, MRR>=0.88, plus hard correctness floors for currency.

Wiring: root package.json gained `bench:quality: tsx bench/quality/eval.ts`; .github/workflows/ci.yml gained a "Memory-quality gate" step in the fast `unit` job with REDIS_URL="" NEO4J_URI="". Gotcha confirmed: bench/ is outside the npm workspaces AND outside tsconfig.build references, so it is never type-checked by `npm run build` and bench vitest tests are NOT auto-discovered by `npm test` — the CI step runs the tsx script directly as the gate (the in-workspace quality.regression.test.ts remains the vitest-level assertion). last-run.json is gitignored (carries a generatedAt timestamp; not a metric). FILE SCOPE respected: only bench/, ci.yml, root package.json touched; packages/* read-only. Verified: bench:quality exits 0 under empty-infra env, npm run build exits 0, quality.regression test 6/6 pass.