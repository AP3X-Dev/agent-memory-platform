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
    const ageDays =
      (now.getTime() - new Date(memory.updated_at).getTime()) / (1000 * 60 * 60 * 24);
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
    if (used + item.tokens > maxTokens) break;
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
 * Rank facts by confidence, recency (using valid_at), and status.
 * Active facts get a base boost. Disputed facts get a penalty.
 */
export function rankFacts(
  facts: FactNode[],
  now: Date = new Date(),
): FactNode[] {
  const scored = facts.map((fact) => {
    const ageDays =
      (now.getTime() - new Date(fact.valid_at).getTime()) / (1000 * 60 * 60 * 24);
    const recencyScore = Math.exp(-ageDays / (RECENCY_DECAY_DAYS * FACT_DECAY_MULTIPLIER));
    const statusMultiplier = fact.status === 'disputed' ? 0.5 : 1.0;
    const score = fact.confidence * recencyScore * statusMultiplier;
    return { fact, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.fact);
}
