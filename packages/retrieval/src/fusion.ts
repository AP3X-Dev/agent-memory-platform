// packages/retrieval/src/fusion.ts
// Reciprocal Rank Fusion: merges multiple ranked lists into one.
// Enhanced with dynamic k scaling, normalization, and MMR diversification.

import type { RetrievalResult, BoostFactors } from './types.js';
import { scaleRrfK, normalizeScores, mmrDiversify, provenanceQualityMultiplier } from './scoring.js';

/**
 * Reciprocal Rank Fusion across N ranked lists.
 * score(d) = sum(1 / (k + rank_i(d))) for each list i where d appears.
 *
 * @param lists - Multiple ranked result lists from different retrieval strategies
 * @param limit - Maximum results to return
 * @param k - Base RRF constant (default 60, scaled dynamically for large collections)
 * @param boosts - Optional per-entity and per-source-type boost factors from feedback
 * @param collectionSize - Optional total collection size for dynamic k scaling and normalization
 * @param postBoost - Optional function to apply score boost after RRF but before MMR diversification
 */
export function rrfFusion(
  lists: RetrievalResult[][],
  limit: number,
  k = 60,
  boosts?: BoostFactors,
  collectionSize?: number,
  postBoost?: (result: RetrievalResult) => number,
): RetrievalResult[] {
  // Dynamic k scaling for large collections
  const effectiveK = collectionSize ? scaleRrfK(k, collectionSize) : k;

  const scores = new Map<string, { result: RetrievalResult; rrfScore: number }>();

  for (const list of lists) {
    for (let rank = 0; rank < list.length; rank++) {
      const result = list[rank];
      const rrfScore = 1 / (effectiveK + rank + 1);

      const existing = scores.get(result.id);
      if (existing) {
        existing.rrfScore += rrfScore;
        // Keep the result with more content
        if (result.content.length > existing.result.content.length) {
          existing.result = { ...result };
        }
      } else {
        scores.set(result.id, { result: { ...result }, rrfScore });
      }
    }
  }

  // Apply boost factors from feedback history
  if (boosts) {
    for (const entry of scores.values()) {
      for (const [entity, boost] of Object.entries(boosts.entity_boosts)) {
        if (entry.result.content.includes(entity) || entry.result.title.includes(entity)) {
          entry.rrfScore *= (1 + boost);
        }
      }

      const sourceBoost = boosts.source_type_boosts[entry.result.source_type];
      if (sourceBoost) {
        entry.rrfScore *= (1 + sourceBoost);
      }
    }
  }

  // Apply bounded provenance quality before normalization/MMR. This keeps the
  // rank-fusion shape intact while demoting invalidated/superseded memories and
  // lightly favoring high-confidence, source-backed results.
  for (const entry of scores.values()) {
    entry.rrfScore *= provenanceQualityMultiplier(entry.result);
  }

  // Sort by score
  let results = [...scores.values()]
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, limit * 2) // Over-fetch for MMR (diversification will trim)
    .map((entry) => ({ ...entry.result, score: entry.rrfScore }));

  // Z-score + sigmoid normalization for large collections
  if (collectionSize) {
    results = normalizeScores(results, collectionSize);
  }

  // Apply optional post-RRF boost (before MMR so diversity selection uses boosted scores)
  if (postBoost) {
    for (const result of results) {
      result.score = postBoost(result);
    }
    results.sort((a, b) => b.score - a.score);
  }

  // MMR diversification: reduce redundancy (operates on final boosted scores)
  results = mmrDiversify(results, limit, 0.7);

  return results;
}

/**
 * Dedup results by ID. Keeps the one with the highest score.
 */
export function dedup(results: RetrievalResult[]): RetrievalResult[] {
  const seen = new Map<string, RetrievalResult>();
  for (const r of results) {
    const existing = seen.get(r.id);
    if (!existing || r.score > existing.score) {
      seen.set(r.id, r);
    }
  }
  return [...seen.values()];
}
