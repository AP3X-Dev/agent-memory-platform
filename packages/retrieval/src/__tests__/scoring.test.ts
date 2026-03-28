// packages/retrieval/src/__tests__/scoring.test.ts
import { describe, it, expect } from 'vitest';
import {
  scaleRrfK,
  lexicalTextScore,
  normalizeScores,
  computeQueryStats,
  adaptiveWeights,
  mmrDiversify,
} from '../scoring.js';
import type { RetrievalResult } from '../types.js';

// ─── scaleRrfK ──────────────────────────────────────────────────────────────

describe('scaleRrfK', () => {
  it('returns base k for small collections', () => {
    expect(scaleRrfK(60, 1000)).toBe(60);
    expect(scaleRrfK(60, 9999)).toBe(60);
  });

  it('scales k for large collections', () => {
    const scaled = scaleRrfK(60, 100_000);
    expect(scaled).toBeGreaterThan(60);
    expect(scaled).toBeLessThanOrEqual(180); // 3x cap
  });

  it('caps at 3x', () => {
    const scaled = scaleRrfK(60, 1_000_000_000);
    expect(scaled).toBeLessThanOrEqual(180);
  });

  it('returns exact base at threshold boundary', () => {
    expect(scaleRrfK(60, 10_000)).toBe(60);
  });
});

// ─── lexicalTextScore ────────────────────────────────────────────────────────

describe('lexicalTextScore', () => {
  it('returns 0 for no matches', () => {
    const score = lexicalTextScore(['xyz'], { name: 'abc', file_path: '/foo/bar.ts' });
    expect(score).toBe(0);
  });

  it('scores higher for exact name match', () => {
    const nameMatch = lexicalTextScore(['auth'], { name: 'auth', file_path: '/src/auth.ts' });
    const noMatch = lexicalTextScore(['auth'], { name: 'database', file_path: '/src/db.ts' });
    expect(nameMatch).toBeGreaterThan(noMatch);
  });

  it('scores higher for path segment match', () => {
    const pathMatch = lexicalTextScore(['auth'], { name: 'handler', file_path: '/src/auth/handler.ts' });
    const noPath = lexicalTextScore(['auth'], { name: 'handler', file_path: '/src/db/handler.ts' });
    expect(pathMatch).toBeGreaterThan(noPath);
  });

  it('returns bounded values (tanh saturation)', () => {
    // Even with many matches, tanh bounds to [0, 1]
    const score = lexicalTextScore(
      ['auth', 'user', 'handler', 'validate', 'token'],
      { name: 'auth user handler', file_path: '/auth/user/validate/token/handler.ts', signature: 'auth user validate token' },
    );
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

// ─── normalizeScores ─────────────────────────────────────────────────────────

describe('normalizeScores', () => {
  it('returns unchanged for small collections', () => {
    const results = makeResults([0.8, 0.5, 0.3]);
    const normalized = normalizeScores(results, 100);
    expect(normalized.map((r) => r.score)).toEqual([0.8, 0.5, 0.3]);
  });

  it('normalizes for large collections', () => {
    const results = makeResults([0.9, 0.5, 0.1]);
    const normalized = normalizeScores(results, 50_000);
    // All scores should be in (0, 1) after sigmoid
    for (const r of normalized) {
      expect(r.score).toBeGreaterThan(0);
      expect(r.score).toBeLessThan(1);
    }
  });

  it('handles all-identical scores', () => {
    const results = makeResults([0.5, 0.5, 0.5]);
    const normalized = normalizeScores(results, 50_000);
    // std = 0, should return unchanged
    expect(normalized.map((r) => r.score)).toEqual([0.5, 0.5, 0.5]);
  });

  it('returns unchanged for fewer than 3 results', () => {
    const results = makeResults([0.8, 0.3]);
    const normalized = normalizeScores(results, 50_000);
    expect(normalized.map((r) => r.score)).toEqual([0.8, 0.3]);
  });
});

// ─── computeQueryStats ───────────────────────────────────────────────────────

describe('computeQueryStats', () => {
  it('detects narrative hints', () => {
    const stats = computeQueryStats('how does authentication work');
    expect(stats.narrativeHint).toBe(true);
    expect(stats.graphHint).toBe(false);
  });

  it('detects graph hints', () => {
    const stats = computeQueryStats('who calls validateToken');
    expect(stats.graphHint).toBe(true);
  });

  it('computes identifier density', () => {
    const stats = computeQueryStats('getUserById processOrder');
    expect(stats.identifierDensity).toBeGreaterThan(0);
  });

  it('handles empty query', () => {
    const stats = computeQueryStats('');
    expect(stats.totalTokens).toBe(0);
    expect(stats.narrativeHint).toBe(false);
    expect(stats.graphHint).toBe(false);
  });
});

// ─── adaptiveWeights ─────────────────────────────────────────────────────────

describe('adaptiveWeights', () => {
  it('boosts lexical for identifier-heavy queries', () => {
    const stats = computeQueryStats('getUserById processOrder validateInput');
    const weights = adaptiveWeights(stats);
    expect(weights.lexicalTextWeight).toBeGreaterThan(0.2); // Base is 0.2
  });

  it('boosts dense for narrative queries', () => {
    const stats = computeQueryStats('explain how the authentication system works');
    const weights = adaptiveWeights(stats);
    expect(weights.denseWeight).toBeGreaterThan(1.5); // Base is 1.5
  });

  it('returns base weights for generic queries', () => {
    const stats = computeQueryStats('find code');
    const weights = adaptiveWeights(stats);
    expect(weights.denseWeight).toBe(1.5);
    expect(weights.lexicalTextWeight).toBe(0.2);
  });
});

// ─── mmrDiversify ────────────────────────────────────────────────────────────

describe('mmrDiversify', () => {
  it('returns empty for empty input', () => {
    expect(mmrDiversify([], 10)).toEqual([]);
  });

  it('returns single item unchanged', () => {
    const results = makeResults([0.9]);
    expect(mmrDiversify(results, 10)).toHaveLength(1);
  });

  it('selects highest-relevance item first', () => {
    const results = makeResults([0.3, 0.9, 0.5]);
    const diversified = mmrDiversify(results, 3);
    expect(diversified[0].score).toBe(0.9);
  });

  it('respects k limit', () => {
    const results = makeResults([0.9, 0.8, 0.7, 0.6, 0.5]);
    const diversified = mmrDiversify(results, 3);
    expect(diversified).toHaveLength(3);
  });

  it('penalizes same-file results', () => {
    const results: RetrievalResult[] = [
      makeResult('a', 0.9, '/src/auth.ts'),
      makeResult('b', 0.85, '/src/auth.ts'), // Same file
      makeResult('c', 0.8, '/src/db.ts'),    // Different file
    ];
    const diversified = mmrDiversify(results, 3);
    // c (different file) should rank above b (same file as a) despite lower raw score
    const cIdx = diversified.findIndex((r) => r.id === 'c');
    const bIdx = diversified.findIndex((r) => r.id === 'b');
    expect(cIdx).toBeLessThan(bIdx);
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeResults(scores: number[]): RetrievalResult[] {
  return scores.map((score, i) => makeResult(`r${i}`, score, `/src/file${i}.ts`));
}

function makeResult(id: string, score: number, filePath: string): RetrievalResult {
  return {
    id,
    source_type: 'symbol',
    title: id,
    content: `content of ${id}`,
    score,
    metadata: { file_path: filePath, name: id },
  };
}
