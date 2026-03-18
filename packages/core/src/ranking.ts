// packages/core/src/ranking.ts
import type { SemanticNode } from './types.js';
import { RECENCY_DECAY_DAYS } from './types.js';

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
