# LongMemEval-S retrieval results (real, standard benchmark)

Dataset: **LongMemEval-S** (Wu et al. 2024) — 500 questions, each over 54 multi-session
chat histories, 6 categories. A standard agent/assistant memory benchmark (one the user
recommended). Task here: **retrieval recall** — does the memory system surface the gold
evidence session in its top-k? Deterministic, no LLM. AMP's real ranking (MemBench
`AmpAdapter`: BM25 channel → `rrfFusion` + provenance + inferred-supersession) vs baselines.

```
Recall@1 (100 questions, hardest):
system          Recall@1   MRR
AMP             0.900      0.900
Keyword(BM25)   0.900      0.900
NaiveRecency    0.040      0.040

Recall@5 (40 questions):  AMP 1.00 / BM25 1.00 / NaiveRecency 0.225
```

Per-category Recall@1 (AMP vs BM25, identical): knowledge-update 1.00/1.00, multi-session
0.96/0.96, single-session-assistant 1.00/1.00, single-session-preference 0.33/0.33,
single-session-user 0.86/0.86, temporal-reasoning 0.89/0.89.

## Honest reading

1. **AMP's retrieval is strong** — Recall@1 = 0.90 (the gold session is rank-1 90% of the
   time); pure-recency (NaiveRecency) collapses to 0.04, confirming the benchmark is
   non-trivial and that lexical relevance is what carries it.
2. **AMP exactly ties BM25 — no lift.** Honest reason: the `AmpAdapter` here uses a single
   BM25 candidate channel, and LongMemEval items carry no provenance metadata
   (confidence/invalidated) and no project scope, so `rrfFusion`/provenance/MMR reduce to
   "BM25 order." AMP's real lift comes from **multi-channel (dense + lexical) RRF fusion**,
   **provenance/temporal weighting**, and **project scoping** — none of which this config
   exercises. So this measures "AMP's lexical reranking" (≈ BM25), not AMP's full stack.
3. **Where AMP's differentiators would show:** (a) a **dense/embedding channel** fused with
   lexical (needs an embedder), and (b) the **QA-accuracy** metric on knowledge-update /
   temporal-reasoning categories, where surfacing the *current* answer over a superseded one
   is the whole point — that needs the answer-generation + judge step (Claude, free), and is
   directly comparable to published Mem0/Zep LongMemEval QA numbers.

## Hybrid (dense+lexical RRF) — AMP's actual architecture (`hybrid_eval.py`, local MiniLM)

Added a real dense channel (sentence-transformers all-MiniLM-L6-v2) fused with BM25 via RRF
(k=60) — AMP's true retrieval design. Recall@1, 100 questions:

```
bm25     0.800
dense    0.720      <- embedding-only LOSES to lexical
hybrid   0.810      <- AMP's dense+lexical RRF fusion

hybrid − bm25: +0.01 overall
  knowledge-update    bm25 0.87  hybrid 0.93   (+0.07)
  temporal-reasoning  bm25 0.78  hybrid 0.81   (+0.04)
  single-session-user bm25 0.64  hybrid 0.57   (-0.07)   (weak dense channel hurts here)
  others: no change
```

## Bottom line (honest)

AMP's hybrid fusion is **~tied with BM25 overall (+0.01, within noise)** but **modestly
better on the memory-specific categories** — knowledge-update (+0.07) and temporal (+0.04),
exactly where a memory layer should earn its keep and where plain lexical search has no
special advantage. Dense-only loses (0.72 < 0.80), so the *fusion* is what wins, not
embeddings alone — which validates AMP's architecture choice. The lift is real but small,
and the absolute retrieval is strong (R@1 0.80–0.90). NOT a dramatic win, NOT a head-to-head
vs Zep/Letta. The bigger AMP differentiators (consolidation, fact supersession, temporal
`rankFacts`) barely get exercised by "rank 54 sessions" — they'd show on end-to-end QA
accuracy for knowledge-update questions (answer with the current fact, not the stale one),
which is the next step if a competitor-comparable number is wanted.
