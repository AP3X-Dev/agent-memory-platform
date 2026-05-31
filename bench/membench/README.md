# MemBench — an agent-memory benchmark

Most "memory benchmarks" measure chatbot-style fact recall. For a **coding/agent** memory
layer that's necessary but not sufficient. The winning memory system is not the one that
remembers the most — it's the one that surfaces the **smallest amount of high-leverage
context at the right moment**: current truth, in-scope, low-noise, **without** leaking
stale assumptions or contaminating across projects.

MemBench measures those agent-relevant properties, and it does so through a thin adapter
so the **same suite scores any memory system** — AMP, a naive baseline, or an external
system (Zep, Letta, Mem0, …) once an adapter is written.

## Run

```bash
npx tsx bench/membench/run.ts
```

## Dimensions

| Dimension | Question | Maps to |
|---|---|---|
| **recall** | Did the right memories surface at all? | MemoryAgentBench retrieval |
| **precision** | Was the context mostly signal, not padding? | "smallest high-leverage context" |
| **conflict** | Does current truth outrank a superseded fact? (Jest→Vitest) | LongMemEval knowledge-update / MemoryAgentBench conflict-resolution |
| **stale** | Do invalidated facts stay OUT of the top context? | stale-assumption avoidance |
| **contamination** | Does a project-scoped query avoid cross-project bleed? | project-memory isolation |

Each metric is normalized to `[0,1]` (1 = ideal) so dimensions are comparable and combine
into a single **composite** effectiveness score.

## Current results

```
system          recall  precis  conflic stale   contami  COMPOSITE
AMP             1.00    1.00    1.00    1.00    1.00     1.000
Keyword(BM25)   1.00    1.00    0.25    0.42    0.75     0.683
NaiveRecency    0.17    0.00    0.75    0.42    0.50     0.367
```

Reading: BM25 retrieval (the common "vector/keyword memory") matches AMP on recall and
precision but **fails the agent-specific dimensions** — it surfaces superseded facts
(conflict 0.25, stale 0.42) and bleeds across projects (contamination 0.75). NaiveRecency
aces *implicit* conflict (newest = current) but is useless at recall/precision — showing a
good system needs BOTH relevance and currency, which only AMP combines.

AMP scores 1.0 across all five — including the hard **implicit-conflict-inference**
scenario (a newer fact silently supersedes an older one with *no* stale flag). It earns
that via subject-similarity supersession, a faithful proxy for AMP's fact layer
(`findBySubjectPredicate` → invalidate-old-on-different-object), NOT a recency hack — a
global recency tiebreaker was tried and reverted because it traded multi-hop recall for
conflict. AMP's recall stays 1.0 because supersession fires only for same-subject
near-duplicates, leaving distinct facts alone.

**What 1.0 here does and does not prove:** it proves AMP's architecture *covers* these
five quality dimensions while the baselines structurally cannot. It does NOT prove
downstream task superiority on a coding benchmark — and note that a public coding
benchmark with a strong agent is a poor test of memory value, because the model already
knows public codebases (memory of public knowledge is redundant). Memory's value is on
knowledge the agent LACKS: project-specific conventions, current truth, prior failures —
which is exactly what these five dimensions probe. Further headroom: external-system
(Zep/Letta) adapters for a head-to-head, and harder scenarios (partial staleness, noisy
near-dup contamination, cost budgets).

## Adding a system

Implement `MemorySystemAdapter` (`types.ts`) — `reset()`, `remember(item)`,
`recall(query, {k, project})` — and add it to `REFERENCE_ADAPTERS` in `adapters.ts`.
For an external service, the adapter wraps its store/query API. Then `run.ts` scores it
head-to-head on the same suite.

## Files

- `types.ts` — the adapter contract + scenario/probe model
- `scenarios.ts` — the suite (one scenario per dimension; ground truth is human-judged)
- `scorer.ts` — pure, normalized metric computation
- `adapters.ts` — NaiveRecency / Keyword(BM25) / AMP reference adapters
- `run.ts` — runner + comparison report (`runMemBench()` is importable for tests)
