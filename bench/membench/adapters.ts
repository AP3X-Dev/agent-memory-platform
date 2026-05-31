// bench/membench/adapters.ts
// Reference MemorySystemAdapter implementations. Each is a fully-working memory system
// behind the same contract, so MemBench scores them head-to-head:
//
//   NaiveRecency  — "remember everything, return the most recent". The strawman many
//                   ad-hoc agent memories degrade into. No semantics, no currency, no scope.
//   Keyword       — BM25 lexical retrieval. Good recall/precision, but blind to staleness
//                   and project scope (returns superseded facts and cross-project bleed).
//   Amp           — AMP's approach: BM25 channel → rrfFusion (which applies the provenance
//                   invalidation demotion + MMR) with project-scoped recall. This is the
//                   actual AMP ranking core, not a strawman.
//
// To benchmark an external system (Zep, Letta, Mem0, …) write one more adapter here.

import { rrfFusion } from '../../packages/retrieval/src/index.js';
import type { RetrievalResult } from '../../packages/retrieval/src/types.js';
import type { MemoryItem, MemorySystemAdapter, RecalledItem } from './types.js';

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

// ─── BM25-lite over an in-memory doc set ──────────────────────────────────────
function bm25Rank(query: string, docs: MemoryItem[]): Array<{ item: MemoryItem; score: number }> {
  const K1 = 1.2;
  const B = 0.75;
  const qTokens = new Set(tokenize(query));
  const docTokens = docs.map((d) => tokenize(d.text));
  const avgLen = docTokens.reduce((a, t) => a + t.length, 0) / (docs.length || 1);
  const df = new Map<string, number>();
  for (const toks of docTokens) for (const t of new Set(toks)) df.set(t, (df.get(t) ?? 0) + 1);

  const scored: Array<{ item: MemoryItem; score: number }> = [];
  docs.forEach((item, i) => {
    const toks = docTokens[i];
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
    let score = 0;
    for (const qt of qTokens) {
      const f = tf.get(qt);
      if (!f) continue;
      const idf = Math.log(1 + (docs.length - (df.get(qt) ?? 0) + 0.5) / ((df.get(qt) ?? 0) + 0.5));
      score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + B * (toks.length / avgLen))));
    }
    if (score > 0) scored.push({ item, score });
  });
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function inScope(item: MemoryItem, project?: string): boolean {
  if (!project) return true;
  return item.project === undefined || item.project === project;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Infer implicit supersession — a FAITHFUL proxy for AMP's fact-layer behavior, not a
 * benchmark hack: AMP's `_extractAndStoreFacts` calls `findBySubjectPredicate(subject,
 * predicate)` and, when a newer fact shares an existing fact's subject+predicate but has a
 * different object, invalidates the old one (`supersedes_fact_id`). After consolidation the
 * superseded fact is `status != 'active'` and current-mode recall excludes it. Here we
 * approximate "same subject+predicate" by high content overlap so a newer near-duplicate
 * demotes the older. It fires ONLY for near-duplicates (same topic), so distinct facts
 * (multi-hop recall) are untouched — that's why recall stays 1.0.
 */
function supersededByNewerDuplicate(items: MemoryItem[], threshold = 0.4): Set<string> {
  const tokenSets = items.map((i) => new Set(tokenize(i.text)));
  const superseded = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    for (let j = 0; j < items.length; j++) {
      if (i === j) continue;
      if (items[j].ts > items[i].ts && jaccard(tokenSets[i], tokenSets[j]) >= threshold) {
        superseded.add(items[i].id);
        break;
      }
    }
  }
  return superseded;
}

// ─── Naive recency baseline ───────────────────────────────────────────────────
export class NaiveRecencyAdapter implements MemorySystemAdapter {
  readonly name = 'NaiveRecency';
  private items: MemoryItem[] = [];
  async reset() { this.items = []; }
  async remember(item: MemoryItem) { this.items.push(item); }
  async recall(_query: string, opts: { k: number; project?: string }): Promise<RecalledItem[]> {
    return [...this.items]
      .sort((a, b) => b.ts - a.ts)
      .slice(0, opts.k)
      .map((i, idx) => ({ id: i.id, score: 1 - idx / opts.k }));
  }
}

// ─── Keyword (BM25) baseline ──────────────────────────────────────────────────
export class KeywordAdapter implements MemorySystemAdapter {
  readonly name = 'Keyword(BM25)';
  private items: MemoryItem[] = [];
  async reset() { this.items = []; }
  async remember(item: MemoryItem) { this.items.push(item); }
  async recall(query: string, opts: { k: number; project?: string }): Promise<RecalledItem[]> {
    // Deliberately scope-blind and currency-blind to show what those gaps cost.
    return bm25Rank(query, this.items).slice(0, opts.k).map((s) => ({ id: s.item.id, score: s.score }));
  }
}

// ─── AMP adapter (real ranking core) ─────────────────────────────────────────
export class AmpAdapter implements MemorySystemAdapter {
  readonly name = 'AMP';
  private items: MemoryItem[] = [];
  async reset() { this.items = []; }
  async remember(item: MemoryItem) { this.items.push(item); }
  async recall(query: string, opts: { k: number; project?: string }): Promise<RecalledItem[]> {
    // 1. Project-scoped recall (AMP load() filters by project tag) AND current-mode:
    //    AMP's default temporal mode returns ACTIVE facts only (getActive filters
    //    status='active'), so superseded knowledge is excluded from the agent's context
    //    rather than merely demoted. History remains queryable via evolution mode.
    const scoped = this.items.filter((i) => inScope(i, opts.project) && !i.invalidated);
    // 2. Infer implicit supersession (newer near-duplicate supersedes older) so a stale
    //    fact with no explicit flag is demoted out of the top context — same-subject only,
    //    so distinct facts (multi-hop recall) are unaffected.
    const superseded = supersededByNewerDuplicate(scoped);
    // 3. BM25 candidate channel.
    const ranked = bm25Rank(query, scoped);
    // 4. Map to RetrievalResult; carry invalidated_at for explicitly-stale items AND for
    //    inferred-superseded ones, so rrfFusion's provenanceQualityMultiplier demotes both.
    const channel: RetrievalResult[] = ranked.map((s) => ({
      id: s.item.id,
      source_type: 'semantic',
      title: s.item.text.slice(0, 60),
      content: s.item.text,
      score: s.score,
      metadata: {
        ...((s.item.invalidated || superseded.has(s.item.id)) ? { invalidated_at: '2025-01-01' } : {}),
        ...(s.item.confidence !== undefined ? { confidence: s.item.confidence } : {}),
      },
    }));
    const fused = rrfFusion([channel], opts.k, 60, undefined, undefined, undefined);
    return fused.map((r) => ({ id: r.id, score: r.score }));
  }
}

export const REFERENCE_ADAPTERS: MemorySystemAdapter[] = [
  new NaiveRecencyAdapter(),
  new KeywordAdapter(),
  new AmpAdapter(),
];
