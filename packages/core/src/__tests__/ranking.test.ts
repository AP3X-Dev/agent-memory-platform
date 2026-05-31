// packages/core/src/__tests__/ranking.test.ts
import { describe, it, expect } from 'vitest';
import { rankMemories, budgetTokens, estimateTokens } from '../ranking.js';
import type { SemanticNode } from '../types.js';

function makeNode(
  overrides: Partial<SemanticNode> & { relevanceScore?: number },
): SemanticNode & { relevanceScore?: number } {
  const base: SemanticNode = {
    id: 'node-1',
    content: 'Test content',
    confidence: 0.5,
    signal_count: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    decay_class: 'stable',
    tags: [],
  };
  return { ...base, ...overrides };
}

describe('rankMemories', () => {
  it('high confidence + recent node ranks before low confidence + old node', () => {
    const now = new Date('2025-01-10T00:00:00Z');

    const recent = makeNode({
      id: 'recent',
      confidence: 0.9,
      updated_at: '2025-01-09T00:00:00Z', // 1 day old
    });

    const old = makeNode({
      id: 'old',
      confidence: 0.2,
      updated_at: '2024-12-01T00:00:00Z', // ~40 days old
    });

    const ranked = rankMemories([old, recent], now);

    expect(ranked[0].id).toBe('recent');
    expect(ranked[1].id).toBe('old');
  });

  it('low confidence + old node ranks last', () => {
    const now = new Date('2025-01-10T00:00:00Z');

    const highConf = makeNode({
      id: 'high',
      confidence: 0.95,
      updated_at: '2025-01-09T00:00:00Z',
    });

    const midConf = makeNode({
      id: 'mid',
      confidence: 0.5,
      updated_at: '2025-01-08T00:00:00Z',
    });

    const lowOld = makeNode({
      id: 'low-old',
      confidence: 0.1,
      updated_at: '2024-11-01T00:00:00Z', // ~70 days old
    });

    const ranked = rankMemories([lowOld, midConf, highConf], now);

    expect(ranked[0].id).toBe('high');
    expect(ranked[ranked.length - 1].id).toBe('low-old');
  });

  it('high relevance score boosts a low-confidence item above default-relevance item', () => {
    const now = new Date('2025-01-10T00:00:00Z');
    const updatedAt = '2025-01-09T00:00:00Z'; // same age for both

    const lowConfHighRel = makeNode({
      id: 'low-conf-high-rel',
      confidence: 0.3,
      updated_at: updatedAt,
      relevanceScore: 0.99,
    });

    const midConfDefaultRel = makeNode({
      id: 'mid-conf-default-rel',
      confidence: 0.5,
      updated_at: updatedAt,
      // relevanceScore not set → defaults to 0.5
    });

    // low-conf-high-rel score = 0.3 * recency * 0.99
    // mid-conf-default-rel score = 0.5 * recency * 0.5
    // 0.3 * 0.99 = 0.297 > 0.5 * 0.5 = 0.25 → low-conf-high-rel wins
    const ranked = rankMemories([midConfDefaultRel, lowConfHighRel], now);

    expect(ranked[0].id).toBe('low-conf-high-rel');
  });

  it('missing relevanceScore defaults to 0.5', () => {
    const now = new Date('2025-01-10T00:00:00Z');
    const updatedAt = now.toISOString();

    const node = makeNode({ id: 'n1', confidence: 1.0, updated_at: updatedAt });
    const ranked = rankMemories([node], now);

    // score = 1.0 * exp(0) * 0.5 = 0.5
    expect(ranked[0].score).toBeCloseTo(0.5, 5);
  });

  it('returns nodes with a score property attached', () => {
    const now = new Date();
    const node = makeNode({ id: 'n1' });
    const ranked = rankMemories([node], now);

    expect(ranked[0]).toHaveProperty('score');
    expect(typeof ranked[0].score).toBe('number');
  });

  it('keeps a finite score when updated_at is invalid', () => {
    const node = makeNode({
      id: 'bad-date',
      confidence: 0.8,
      updated_at: 'not-a-date',
      relevanceScore: 0.7,
    });

    const ranked = rankMemories([node], new Date('2025-01-10T00:00:00Z'));

    expect(Number.isFinite(ranked[0].score)).toBe(true);
  });

  it('returns empty array for empty input', () => {
    expect(rankMemories([], new Date())).toEqual([]);
  });
});

describe('budgetTokens', () => {
  it('takes items in order until budget is exceeded', () => {
    const items = [
      { tokens: 100, label: 'a' },
      { tokens: 200, label: 'b' },
      { tokens: 300, label: 'c' },
    ];

    const result = budgetTokens(items, 350);

    expect(result).toHaveLength(2);
    expect(result[0].label).toBe('a');
    expect(result[1].label).toBe('b');
  });

  it('includes all items when budget is large enough', () => {
    const items = [{ tokens: 50 }, { tokens: 50 }, { tokens: 50 }];
    const result = budgetTokens(items, 200);
    expect(result).toHaveLength(3);
  });

  it('zero budget returns empty array', () => {
    const items = [{ tokens: 10 }, { tokens: 20 }];
    expect(budgetTokens(items, 0)).toEqual([]);
  });

  it('negative budget returns empty array', () => {
    const items = [{ tokens: 10 }];
    expect(budgetTokens(items, -5)).toEqual([]);
  });

  it('stops before an item that would exceed budget', () => {
    const items = [{ tokens: 100 }, { tokens: 100 }, { tokens: 100 }];
    // budget = 150 → takes first (100), second would push total to 200 > 150, stops
    const result = budgetTokens(items, 150);
    expect(result).toHaveLength(1);
    expect(result[0].tokens).toBe(100);
  });

  it('returns empty array when first item already exceeds budget', () => {
    const items = [{ tokens: 500 }];
    expect(budgetTokens(items, 100)).toEqual([]);
  });

  it('skips oversized items and continues filling the remaining budget', () => {
    const items = [
      { tokens: 500, label: 'oversized' },
      { tokens: 40, label: 'first-fit' },
      { tokens: 70, label: 'too-large-after-first-fit' },
      { tokens: 30, label: 'second-fit' },
    ];

    const result = budgetTokens(items, 100);

    expect(result.map((item) => item.label)).toEqual(['first-fit', 'second-fit']);
  });
});

describe('estimateTokens', () => {
  it('returns ceil(length / 4)', () => {
    expect(estimateTokens('abcd')).toBe(1); // 4/4 = 1
    expect(estimateTokens('abcde')).toBe(2); // ceil(5/4) = 2
    expect(estimateTokens('')).toBe(0); // ceil(0/4) = 0
    expect(estimateTokens('a')).toBe(1); // ceil(1/4) = 1
  });

  it('handles longer strings', () => {
    const text = 'a'.repeat(100);
    expect(estimateTokens(text)).toBe(25); // 100/4 = 25
  });
});
