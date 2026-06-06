import { describe, it, expect } from 'vitest';
import { rankFacts } from '../ranking.js';
import type { FactNode, InferenceType } from '../types.js';

const NOW = '2026-06-06T00:00:00.000Z';

function fact(id: string, inference_type: InferenceType | undefined): FactNode {
  return {
    id,
    subject: 'mod',
    predicate: 'uses',
    object: id,
    entity_id: null,
    source_episode_ids: [],
    valid_at: NOW,
    invalid_at: null,
    confidence: 0.8,
    status: 'active',
    ...(inference_type ? { inference_type } : {}),
    supersedes_fact_id: null,
    scope: 'project',
    tags: [],
    created_at: NOW,
    updated_at: NOW,
  };
}

describe('rankFacts inference-type weighting', () => {
  it('ranks deductive above inductive above abductive at equal confidence/recency', () => {
    const ranked = rankFacts(
      [fact('abductive', 'abductive'), fact('deductive', 'deductive'), fact('inductive', 'inductive')],
      new Date(NOW),
    );
    expect(ranked.map((f) => f.id)).toEqual(['deductive', 'inductive', 'abductive']);
  });

  it('treats a legacy fact with no inference_type as deductive', () => {
    const ranked = rankFacts([fact('abductive', 'abductive'), fact('legacy', undefined)], new Date(NOW));
    // legacy (defaulted deductive, weight 1.0) must outrank the abductive (0.5).
    expect(ranked[0]!.id).toBe('legacy');
  });
});
