# bench/quality — memory-quality CI gate

Deterministic, infra-free retrieval-quality benchmark. Scores MemBerry's real ranking path
(lexical + RRF + MMR, no vector embeddings) over a committed golden set and reports
**Recall@k, MRR, nDCG@k** plus conflict / knowledge-update metrics. Exits non-zero on any
threshold failure, so it gates in CI's `unit` job (no OpenAI key, no live Neo4j/Redis).

- `eval.ts` — the runnable gate. Thin wrapper over
  `packages/retrieval/bench/quality-eval.ts` (reuses its corpus, labels, ranking, and
  metrics — no duplication). Run with `npm run bench:quality`.
- `RESULTS.md` — measured baseline numbers, the thresholds, the threshold rationale, and
  the exact commands.
- `last-run.json` — runtime metrics snapshot (gitignored; written on each run).

```bash
npm run bench:quality          # run the gate
npx tsx bench/quality/eval.ts  # direct
npx tsx bench/quality/eval.ts --json
```
