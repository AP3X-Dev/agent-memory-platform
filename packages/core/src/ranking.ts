// packages/core/src/ranking.ts
import type { SemanticNode, FactNode } from './types.js';
import { RECENCY_DECAY_DAYS } from './types.js';

/** Facts decay 4x slower than semantics — they represent consolidated truth */
const FACT_DECAY_MULTIPLIER = 4;

export function rankMemories(
  memories: Array<SemanticNode & { relevanceScore?: number }>,
  now: Date = new Date(),
): Array<SemanticNode & { score: number }> {
  const scored = memories.map((memory) => {
    const ageDays = ageInDays(memory.updated_at, now);
    const recencyScore = Math.exp(-ageDays / RECENCY_DECAY_DAYS);
    const relevance = memory.relevanceScore ?? 0.5;
    const score = memory.confidence * recencyScore * relevance;
    return { ...memory, score };
  });

  return scored.sort((a, b) => b.score - a.score);
}

export function budgetTokens<T extends { tokens: number }>(items: T[], maxTokens: number): T[] {
  if (maxTokens <= 0) return [];

  const result: T[] = [];
  let used = 0;

  for (const item of items) {
    if (item.tokens > maxTokens || used + item.tokens > maxTokens) continue;
    result.push(item);
    used += item.tokens;
  }

  return result;
}

export function estimateTokens(text: string): number {
  // ~4 chars per token
  return Math.ceil(text.length / 4);
}

/**
 * Per-status ranking multiplier for facts. In historical/interval/evolution temporal
 * modes, fact sets can include non-active facts, so ranking MUST demote them — a
 * superseded fact must never rank alongside the current truth ("what is true now").
 *   active      — current truth, full weight
 *   tentative   — observed once, not yet confirmed; ranks below active
 *   disputed    — contradicted but not resolved; penalized
 *   invalidated — superseded by a newer fact; strongly demoted (kept for history, not trusted)
 */
const FACT_STATUS_MULTIPLIER: Record<FactNode['status'], number> = {
  active: 1.0,
  tentative: 0.7,
  disputed: 0.5,
  invalidated: 0.15,
};

/**
 * Per-inference-type ranking multiplier. Guesses must rank below knowns so the
 * dream pass's abductive hypotheses never crowd out explicit facts:
 *   deductive — explicit/derived, full weight
 *   inductive — generalized from patterns, slightly demoted
 *   abductive — a hypothesis, strongly demoted (still surfaced, clearly secondary)
 */
const FACT_INFERENCE_MULTIPLIER: Record<NonNullable<FactNode['inference_type']>, number> = {
  deductive: 1.0,
  inductive: 0.85,
  abductive: 0.5,
};

/**
 * Rank facts by confidence, recency (using valid_at), status, and inference type.
 * Current (active, deductive) facts rank above tentative/disputed/abductive ones.
 */
export function rankFacts(
  facts: FactNode[],
  now: Date = new Date(),
): FactNode[] {
  const scored = facts.map((fact) => {
    const ageDays = ageInDays(fact.valid_at, now);
    const recencyScore = Math.exp(-ageDays / (RECENCY_DECAY_DAYS * FACT_DECAY_MULTIPLIER));
    const statusMultiplier = FACT_STATUS_MULTIPLIER[fact.status] ?? 1.0;
    const inferenceMultiplier = FACT_INFERENCE_MULTIPLIER[fact.inference_type ?? 'deductive'] ?? 1.0;
    const score = fact.confidence * recencyScore * statusMultiplier * inferenceMultiplier;
    return { fact, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.fact);
}

function ageInDays(timestamp: string, now: Date): number {
  const parsed = new Date(timestamp).getTime();
  if (!Number.isFinite(parsed)) return 0;

  const ageMs = now.getTime() - parsed;
  if (!Number.isFinite(ageMs) || ageMs < 0) return 0;

  return ageMs / (1000 * 60 * 60 * 24);
}
