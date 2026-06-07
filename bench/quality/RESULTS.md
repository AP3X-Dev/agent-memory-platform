# Memory-Quality Gate — Baseline & Thresholds

A deterministic, infra-free retrieval-quality benchmark used as a CI gate. It scores the
**real production ranking path** (`expandQuery` → `adaptiveWeights` → `rrfFusion` +
`lexicalTextScore` boost → MMR, exactly as `UnifiedAssembler.assembleRanked` composes it)
over a committed, human-labeled golden set, and reports the standard IR metrics:
**Recall@k, MRR, nDCG@k**, plus conflict / knowledge-update metrics (current truth must
outrank superseded facts).

It requires **no OpenAI key and no live Neo4j/Redis** — the ranking uses the lexical +
RRF + MMR path only (no vector embeddings), so it is fully reproducible and runs in the CI
`unit` job (which sets `NEO4J_URI="" REDIS_URL=""`).

## How it reuses existing work (no parallel system)

`bench/quality/eval.ts` is a thin wrapper. The golden corpus, golden queries, the ranking
pipeline, and the metric implementations already live in
`packages/retrieval/bench/quality-eval.ts` (and are also asserted by the vitest gate
`packages/retrieval/src/__tests__/quality.regression.test.ts`). The wrapper imports
`runQualityEval`, `runConflictEval`, and `QUALITY_THRESHOLDS` from there — it does **not**
duplicate the corpus, the labels, or the ranking. What it adds:

- a single **root-runnable** entry point (`npm run bench:quality`) that exits non-zero on
  any threshold failure, so CI can gate on it directly in the unit job;
- an explicit, consolidated **metrics report** (table + machine-readable
  `bench/quality/last-run.json`, gitignored);
- an explicit **Recall@5 floor** (`RECALL_AT_5_MIN`), which the package-level gate did not
  enforce (it gates Recall@10).

All gated thresholds except Recall@5 are sourced from `QUALITY_THRESHOLDS` in the package
eval, so there is one source of truth.

## Measured baseline

Golden set: **41 corpus docs · 12 golden queries · 3 conflict (knowledge-update) queries.**
Measured on 2026-06-07, identical across repeated runs (deterministic — no `Math.random`,
no `Date.now` affects ranking):

| Metric                 | Baseline | Gate (threshold) | Source of threshold |
|------------------------|---------:|------------------|---------------------|
| Recall@5               | 0.882    | ≥ 0.85 (min)     | `RECALL_AT_5_MIN` (this wrapper) |
| Recall@10              | 0.931    | ≥ 0.90 (min)     | `QUALITY_THRESHOLDS.recallAt10` |
| Precision@5            | 0.400    | — (reported)     | not gated |
| nDCG@10                | 0.847    | ≥ 0.84 (min)     | `QUALITY_THRESHOLDS.ndcgAt10` |
| MRR                    | 0.903    | ≥ 0.88 (min)     | `QUALITY_THRESHOLDS.mrr` |
| Intent accuracy        | 1.000    | ≥ 1.00 (min)     | `QUALITY_THRESHOLDS.intentAccuracy` |
| Current-above-stale    | 1.000    | ≥ 1.00 (min)     | `QUALITY_THRESHOLDS.currentAboveStaleRate` |
| Stale-leak (top-3)     | 0.000    | ≤ 0.00 (max)     | `QUALITY_THRESHOLDS.maxStaleLeakRate` |

Fusion-lift diagnostic (Recall@10, not gated): lexical-only 0.840 · dense-proxy-only 0.917
· **fused 0.931**.

### Threshold choice

Thresholds are set **slightly below the observed baseline** so the gate catches regressions
without being flaky on a deterministic input:

- Recall@5 floor 0.85 sits ~0.03 below the measured 0.882.
- Recall@10 / nDCG@10 / MRR reuse the package eval's locked-in floors (0.90 / 0.84 / 0.88),
  which already sit just under the measured 0.931 / 0.847 / 0.903.
- The currency gates (intent, current-above-stale, stale-leak) are hard correctness floors
  (1.0 / 1.0 / 0.0) — these are pass/fail properties, not noisy averages.

A note on `nDCG@k`: the package eval exposes nDCG@**10** (gated here) rather than nDCG@5,
because exposing nDCG@5 would require re-importing the per-query relevance labels and thus
duplicating the golden set. To honor "no parallel system / no duplicated labels", this gate
uses the nDCG@10 the eval already computes from the labels as its nDCG@k metric.

## Commands

```bash
# Run the gate (exits non-zero on any threshold failure)
npm run bench:quality

# Direct invocation
npx tsx bench/quality/eval.ts

# Emit the metrics report as JSON to stdout
npx tsx bench/quality/eval.ts --json
```

CI runs `npm run bench:quality` as a step in the `unit` job (`.github/workflows/ci.yml`)
with `NEO4J_URI=""` and `REDIS_URL=""`.

## Raising the bar

As the ranking pipeline improves, raise `QUALITY_THRESHOLDS` in
`packages/retrieval/bench/quality-eval.ts` (and `RECALL_AT_5_MIN` in `bench/quality/eval.ts`)
to lock in the gains. Re-run `npm run bench:quality` and update the table above.
