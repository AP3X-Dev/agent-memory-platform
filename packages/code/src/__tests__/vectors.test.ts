// packages/code/src/__tests__/vectors.test.ts
import { describe, it, expect } from 'vitest';
import {
  splitIdentifier,
  tokenizeForVectors,
  generateLexicalVector,
  generateMiniVector,
  generateSparseVector,
} from '../vectors.js';

// ─── splitIdentifier ─────────────────────────────────────────────────────────

describe('splitIdentifier', () => {
  it('splits camelCase', () => {
    expect(splitIdentifier('getUserName')).toEqual(['get', 'user', 'name']);
  });

  it('splits PascalCase', () => {
    expect(splitIdentifier('AuthService')).toEqual(['auth', 'service']);
  });

  it('splits snake_case (filters stop words like "by")', () => {
    expect(splitIdentifier('get_user_by_id')).toEqual(['get', 'user', 'id']);
  });

  it('splits UPPER_SNAKE', () => {
    const tokens = splitIdentifier('HTTP_STATUS_CODE');
    expect(tokens).toContain('http');
    expect(tokens).toContain('status');
    expect(tokens).toContain('code');
  });

  it('splits kebab-case', () => {
    expect(splitIdentifier('get-user-name')).toEqual(['get', 'user', 'name']);
  });

  it('filters stop words', () => {
    const tokens = splitIdentifier('theUserOfSystem');
    expect(tokens).not.toContain('the');
    expect(tokens).not.toContain('of');
    expect(tokens).toContain('user');
    expect(tokens).toContain('system');
  });

  it('handles empty string', () => {
    expect(splitIdentifier('')).toEqual([]);
  });

  it('handles single word', () => {
    expect(splitIdentifier('authenticate')).toEqual(['authenticate']);
  });

  it('handles numbers', () => {
    const tokens = splitIdentifier('getUser2Factor');
    expect(tokens).toContain('get');
    expect(tokens).toContain('user');
    expect(tokens).toContain('factor');
  });
});

// ─── tokenizeForVectors ──────────────────────────────────────────────────────

describe('tokenizeForVectors', () => {
  it('splits multi-word text', () => {
    const tokens = tokenizeForVectors('validate user input');
    expect(tokens).toContain('validate');
    expect(tokens).toContain('user');
    expect(tokens).toContain('input');
  });

  it('splits identifiers within text', () => {
    const tokens = tokenizeForVectors('call getUserById from handler');
    expect(tokens).toContain('call');
    expect(tokens).toContain('get');
    expect(tokens).toContain('user');
    expect(tokens).toContain('handler');
  });
});

// ─── generateLexicalVector ───────────────────────────────────────────────────

describe('generateLexicalVector', () => {
  it('returns vector of correct dimension', () => {
    const vec = generateLexicalVector('hello world');
    expect(vec).toHaveLength(4096);
  });

  it('returns L2-normalized vector', () => {
    const vec = generateLexicalVector('test function');
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    expect(norm).toBeCloseTo(1.0, 3);
  });

  it('returns zero vector for empty input', () => {
    const vec = generateLexicalVector('');
    const sum = vec.reduce((s, v) => s + Math.abs(v), 0);
    expect(sum).toBe(0);
  });

  it('produces different vectors for different inputs', () => {
    const vec1 = generateLexicalVector('authentication handler');
    const vec2 = generateLexicalVector('database query');
    // They should differ
    let diffCount = 0;
    for (let i = 0; i < vec1.length; i++) {
      if (Math.abs(vec1[i] - vec2[i]) > 0.001) diffCount++;
    }
    expect(diffCount).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    const vec1 = generateLexicalVector('same input');
    const vec2 = generateLexicalVector('same input');
    expect(vec1).toEqual(vec2);
  });

  it('respects custom dimension', () => {
    const vec = generateLexicalVector('test', 256);
    expect(vec).toHaveLength(256);
  });
});

// ─── generateMiniVector ──────────────────────────────────────────────────────

describe('generateMiniVector', () => {
  it('returns vector of correct dimension (default 64)', () => {
    const dense = new Array(1536).fill(0).map((_, i) => Math.sin(i));
    const mini = generateMiniVector(dense);
    expect(mini).toHaveLength(64);
  });

  it('returns L2-normalized vector', () => {
    const dense = new Array(1536).fill(0).map((_, i) => Math.sin(i));
    const mini = generateMiniVector(dense);
    const norm = Math.sqrt(mini.reduce((sum, v) => sum + v * v, 0));
    expect(norm).toBeCloseTo(1.0, 3);
  });

  it('is deterministic (same seed)', () => {
    const dense = new Array(1536).fill(0).map((_, i) => Math.cos(i));
    const mini1 = generateMiniVector(dense);
    const mini2 = generateMiniVector(dense);
    expect(mini1).toEqual(mini2);
  });

  it('produces different outputs for different inputs', () => {
    const dense1 = new Array(1536).fill(0).map((_, i) => Math.sin(i));
    const dense2 = new Array(1536).fill(0).map((_, i) => Math.cos(i));
    const mini1 = generateMiniVector(dense1);
    const mini2 = generateMiniVector(dense2);
    expect(mini1).not.toEqual(mini2);
  });

  it('handles zero vector input', () => {
    const dense = new Array(1536).fill(0);
    const mini = generateMiniVector(dense);
    // All zeros in, all zeros out (can't normalize zero)
    const sum = mini.reduce((s, v) => s + Math.abs(v), 0);
    expect(sum).toBe(0);
  });
});

// ─── generateSparseVector ────────────────────────────────────────────────────

describe('generateSparseVector', () => {
  it('returns indices and values arrays of same length', () => {
    const sparse = generateSparseVector('hello world test');
    expect(sparse.indices.length).toBe(sparse.values.length);
  });

  it('returns non-negative values', () => {
    const sparse = generateSparseVector('function validate input');
    for (const v of sparse.values) {
      expect(v).toBeGreaterThan(0);
    }
  });

  it('accumulates repeated tokens', () => {
    const sparse = generateSparseVector('test test test');
    // 'test' appears 3x — its value should be 3.0
    // (plus possible bigram contributions)
    const maxVal = Math.max(...sparse.values);
    expect(maxVal).toBeGreaterThanOrEqual(3.0);
  });

  it('is deterministic', () => {
    const s1 = generateSparseVector('same input');
    const s2 = generateSparseVector('same input');
    expect(s1.indices).toEqual(s2.indices);
    expect(s1.values).toEqual(s2.values);
  });

  it('returns empty for empty input', () => {
    const sparse = generateSparseVector('');
    expect(sparse.indices).toHaveLength(0);
    expect(sparse.values).toHaveLength(0);
  });

  it('includes bigram features', () => {
    const withBigrams = generateSparseVector('hello world');
    const singleToken = generateSparseVector('hello');
    // With bigrams, 'hello world' should have more entries than just 'hello'
    expect(withBigrams.indices.length).toBeGreaterThan(singleToken.indices.length);
  });
});
