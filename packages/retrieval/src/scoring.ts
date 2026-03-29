// packages/retrieval/src/scoring.ts
// Enhanced scoring: dynamic RRF k, lexical text scoring, z-score normalization,
// adaptive weights, MMR diversification.
// Ported from Context-Engine scripts/hybrid/ranking.py

import type { RetrievalResult, QueryStats, AdaptiveWeights } from './types.js';

// ─── Configuration ───────────────────────────────────────────────────────────

const LARGE_COLLECTION_THRESHOLD = 10_000;
const MAX_RRF_K_SCALE = 3.0;
const LEXICAL_TEXT_SAT = 12.0; // tanh saturation

// ─── Dynamic RRF K ───────────────────────────────────────────────────────────

/**
 * Scale RRF k for large collections.
 * Larger k spreads score distribution, preventing top-heavy ranking.
 */
export function scaleRrfK(baseK: number, collectionSize: number): number {
  if (collectionSize < LARGE_COLLECTION_THRESHOLD) return baseK;
  const scale = 1.0 + Math.log10(collectionSize / LARGE_COLLECTION_THRESHOLD);
  return Math.round(baseK * Math.min(scale, MAX_RRF_K_SCALE));
}

// ─── Lexical Text Scoring ────────────────────────────────────────────────────

/**
 * Score a result by lexical text matching against the query.
 * Higher scores for exact symbol matches, path matches, and code occurrences.
 */
export function lexicalTextScore(
  queryTokens: string[],
  metadata: { name?: string; file_path?: string; signature?: string; content?: string },
): number {
  let score = 0;
  const name = (metadata.name ?? '').toLowerCase();
  const filePath = (metadata.file_path ?? '').toLowerCase();
  const pathParts = filePath.split('/');
  const fileName = pathParts[pathParts.length - 1] ?? '';
  const signature = (metadata.signature ?? '').toLowerCase();
  const content = (metadata.content ?? '').toLowerCase().slice(0, 2000);

  for (const token of queryTokens) {
    const t = token.toLowerCase();

    // Exact symbol name match (highest weight)
    if (name === t || name.includes(t)) {
      score += 2.0;
    }

    // Path segment match
    if (pathParts.some((p) => p.includes(t))) {
      score += 0.8;
      // Filename bonus
      if (fileName.includes(t)) {
        score += 0.3;
      }
    }

    // Signature match
    if (signature.includes(t)) {
      score += 1.2;
    }

    // Content occurrence
    if (content.includes(t)) {
      score += 1.0;
    }
  }

  // Normalize via tanh saturation: bounded in [0, 1]
  return Math.tanh(score / LEXICAL_TEXT_SAT);
}

// ─── Score Normalization ─────────────────────────────────────────────────────

/**
 * Z-score + sigmoid normalization for large result sets.
 * Spreads compressed score distributions.
 */
export function normalizeScores(results: RetrievalResult[], collectionSize: number): RetrievalResult[] {
  if (collectionSize < LARGE_COLLECTION_THRESHOLD || results.length < 3) return results;

  const scores = results.map((r) => r.score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length;
  const std = Math.sqrt(variance);

  if (std < 1e-10) return results; // All scores identical

  return results.map((r) => {
    const z = (r.score - mean) / std;
    const normalized = 1.0 / (1.0 + Math.exp(-z * 0.5)); // Sigmoid with gentle slope
    return { ...r, score: normalized };
  });
}

// ─── Adaptive Weights ────────────────────────────────────────────────────────

/**
 * Compute query-adaptive weights for different scoring signals.
 * Adjusts based on query characteristics.
 */
export function computeQueryStats(query: string): QueryStats {
  const tokens = query.split(/\s+/).filter(Boolean);
  const identifierPattern = /^[A-Z][a-z]+[A-Z]|^[a-z]+[A-Z]|^[a-z]+_[a-z]+|^[a-z]+\.[a-z]+/;
  const identifierCount = tokens.filter((t) => identifierPattern.test(t)).length;

  const lower = query.toLowerCase();
  const narrativeHint = /\b(how|why|explain|describe|what is|what does|purpose)\b/.test(lower);
  const graphHint = /\b(who calls|callers?|depends|imports?|inherits?|references?|usages?)\b/.test(lower);

  return {
    totalTokens: tokens.length,
    identifierDensity: tokens.length > 0 ? identifierCount / tokens.length : 0,
    avgTokenLen: tokens.length > 0 ? tokens.reduce((sum, t) => sum + t.length, 0) / tokens.length : 0,
    narrativeHint,
    graphHint,
  };
}

export function adaptiveWeights(stats: QueryStats): AdaptiveWeights {
  // Base weights
  let denseWeight = 1.5;
  let lexicalVectorWeight = 0.2;
  let lexicalTextWeight = 0.2;

  // High identifier density → boost exact matching
  if (stats.identifierDensity > 0.5) {
    lexicalTextWeight += 0.15;
    lexicalVectorWeight += 0.1;
    denseWeight -= 0.2;
  }

  // Narrative questions → boost semantic/dense
  if (stats.narrativeHint) {
    denseWeight += 0.3;
    lexicalTextWeight -= 0.1;
  }

  // Graph queries → boost lexical (exact symbol names matter)
  if (stats.graphHint) {
    lexicalTextWeight += 0.2;
    lexicalVectorWeight += 0.15;
  }

  return { denseWeight, lexicalVectorWeight, lexicalTextWeight };
}

// ─── MMR Diversification ─────────────────────────────────────────────────────

/**
 * Maximal Marginal Relevance: reduce redundancy in results.
 * Uses path/symbol-based similarity to penalize near-duplicates.
 * Lambda controls relevance vs diversity trade-off (0.7 = favor relevance).
 */
export function mmrDiversify(
  ranked: RetrievalResult[],
  k: number = 60,
  lambda: number = 0.7,
): RetrievalResult[] {
  if (ranked.length <= 1) return ranked;
  k = Math.min(k, ranked.length);

  // Bound candidate set to top 200 by relevance to avoid O(n·k) blowup on large inputs
  const maxCandidates = Math.min(ranked.length, 200);

  // Pre-compute path parts for similarity (avoid repeated splitting)
  const pathPartsCache = ranked.slice(0, maxCandidates).map((r) => {
    const path = (r.metadata.file_path as string) ?? (r.metadata.name as string) ?? '';
    return new Set(path.split('/').filter(Boolean));
  });

  const selected: RetrievalResult[] = [];
  const selectedIndices: number[] = []; // Track indices explicitly for cache lookups
  const remaining = new Set(Array.from({ length: maxCandidates }, (_, i) => i));

  // Start with highest-relevance item
  let bestIdx = 0;
  let bestScore = -Infinity;
  for (const idx of remaining) {
    if (ranked[idx].score > bestScore) {
      bestScore = ranked[idx].score;
      bestIdx = idx;
    }
  }
  selected.push(ranked[bestIdx]);
  selectedIndices.push(bestIdx);
  remaining.delete(bestIdx);

  // Greedy selection with pre-computed similarity
  while (selected.length < k && remaining.size > 0) {
    let bestMmrIdx = -1;
    let bestMmrScore = -Infinity;

    for (const idx of remaining) {
      const relevance = ranked[idx].score;

      // Max similarity to any already-selected item (with early exit on perfect match)
      let maxSim = 0;
      for (let si = 0; si < selected.length; si++) {
        const selIdx = selectedIndices[si];
        const sim = fastSimilarity(ranked[idx], selected[si], pathPartsCache[idx], pathPartsCache[selIdx]);
        if (sim >= 1.0) { maxSim = 1.0; break; } // Same file — max penalty, no need to check more
        if (sim > maxSim) maxSim = sim;
      }

      const mmrScore = lambda * relevance - (1 - lambda) * maxSim;
      if (mmrScore > bestMmrScore) {
        bestMmrScore = mmrScore;
        bestMmrIdx = idx;
      }
    }

    if (bestMmrIdx === -1) break;
    selected.push(ranked[bestMmrIdx]);
    selectedIndices.push(bestMmrIdx);
    remaining.delete(bestMmrIdx);
  }

  // Append any remaining items beyond the bounded candidate set (already sorted by relevance)
  if (selected.length < k && ranked.length > maxCandidates) {
    for (let i = maxCandidates; i < ranked.length && selected.length < k; i++) {
      selected.push(ranked[i]);
    }
  }

  return selected;
}

/**
 * Fast similarity using pre-computed path part sets. Used by MMR.
 */
function fastSimilarity(
  a: RetrievalResult,
  b: RetrievalResult,
  partsA?: Set<string>,
  partsB?: Set<string>,
): number {
  const pathA = (a.metadata.file_path as string) ?? '';
  const pathB = (b.metadata.file_path as string) ?? '';

  if (pathA && pathB && pathA === pathB) return 1.0;

  const nameA = (a.metadata.name as string) ?? a.title;
  const nameB = (b.metadata.name as string) ?? b.title;

  if (nameA && nameB && nameA === nameB) return 0.8;

  // Jaccard similarity on pre-computed path parts
  const setA = partsA ?? new Set(pathA.split('/').filter(Boolean));
  const setB = partsB ?? new Set(pathB.split('/').filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const p of setA) {
    if (setB.has(p)) intersection++;
  }
  const union = setA.size + setB.size - intersection;

  return union > 0 ? 0.5 * (intersection / union) : 0;
}
