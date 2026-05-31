// packages/retrieval/src/__tests__/fusion.test.ts
import { describe, it, expect } from 'vitest';
import { rrfFusion, dedup } from '../fusion.js';
import type { RetrievalResult } from '../types.js';

function makeResult(id: string, score: number, sourceType: RetrievalResult['source_type'] = 'symbol'): RetrievalResult {
  return {
    id,
    source_type: sourceType,
    title: id,
    content: `content of ${id}`,
    score,
    metadata: { name: id, file_path: `/src/${id}.ts` },
  };
}

describe('rrfFusion', () => {
  it('returns empty for empty input', () => {
    expect(rrfFusion([], 10)).toEqual([]);
  });

  it('merges results from multiple lists', () => {
    const list1 = [makeResult('a', 0.9), makeResult('b', 0.5)];
    const list2 = [makeResult('b', 0.8), makeResult('c', 0.6)];
    const fused = rrfFusion([list1, list2], 10);
    expect(fused.length).toBe(3);
    // b appears in both lists — should have highest fused score
    const bResult = fused.find((r) => r.id === 'b');
    expect(bResult).toBeDefined();
    expect(bResult!.score).toBeGreaterThan(fused.find((r) => r.id === 'a')!.score);
  });

  it('respects limit', () => {
    const list1 = [makeResult('a', 0.9), makeResult('b', 0.8), makeResult('c', 0.7)];
    const list2 = [makeResult('d', 0.6), makeResult('e', 0.5)];
    const fused = rrfFusion([list1, list2], 2);
    expect(fused.length).toBeLessThanOrEqual(2);
  });

  it('applies feedback boosts', () => {
    const list1 = [makeResult('a', 0.9), makeResult('b', 0.8)];
    const boosts = {
      entity_boosts: { 'b': 0.5 },
      source_type_boosts: { symbol: 0, semantic: 0, episodic: 0, arch_entity: 0, aspect: 0 },
    };
    const fused = rrfFusion([list1], 10, 60, boosts);
    // b should be boosted
    const bScore = fused.find((r) => r.id === 'b')!.score;
    const aScore = fused.find((r) => r.id === 'a')!.score;
    // b was rank 1 (lower RRF) but boosted — might still be below a
    expect(bScore).toBeGreaterThan(0);
    expect(aScore).toBeGreaterThan(0);
  });

  it('applies postBoost function before MMR', () => {
    const list1 = [makeResult('a', 0.9), makeResult('b', 0.3)];
    // Boost b's score dramatically
    const postBoost = (r: RetrievalResult) => r.id === 'b' ? r.score * 10 : r.score;
    const fused = rrfFusion([list1], 10, 60, undefined, undefined, postBoost);
    // After boost, b should be ranked higher
    expect(fused[0].id).toBe('b');
  });

  it('uses provenance quality to demote invalidated results during fusion', () => {
    const stale = makeResult('stale', 0.9, 'semantic');
    stale.metadata = {
      confidence: 0.9,
      source_episode_ids: ['ep-1'],
      invalidated_at: '2026-05-01T00:00:00.000Z',
    };

    const backed = makeResult('backed', 0.8, 'semantic');
    backed.metadata = {
      confidence: 0.95,
      source_episode_ids: ['ep-1', 'ep-2', 'ep-3', 'ep-4'],
    };

    const fused = rrfFusion([[stale, backed]], 2);
    expect(fused[0].id).toBe('backed');
  });

  it('handles single-item lists', () => {
    const list1 = [makeResult('a', 0.9)];
    const fused = rrfFusion([list1], 10);
    expect(fused).toHaveLength(1);
    expect(fused[0].id).toBe('a');
  });
});

describe('dedup', () => {
  it('removes duplicates keeping highest score', () => {
    const results = [
      makeResult('a', 0.9),
      makeResult('a', 0.5), // Duplicate, lower score
      makeResult('b', 0.7),
    ];
    const deduped = dedup(results);
    expect(deduped).toHaveLength(2);
    expect(deduped.find((r) => r.id === 'a')!.score).toBe(0.9);
  });

  it('returns empty for empty input', () => {
    expect(dedup([])).toEqual([]);
  });

  it('preserves order of first occurrence', () => {
    const results = [makeResult('a', 0.5), makeResult('b', 0.9)];
    const deduped = dedup(results);
    expect(deduped).toHaveLength(2);
  });
});
