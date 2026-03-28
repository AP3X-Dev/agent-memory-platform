// packages/retrieval/src/__tests__/expand.test.ts
import { describe, it, expect } from 'vitest';
import { expandQuery } from '../expand.js';

describe('expandQuery', () => {
  it('returns original query in expanded list', () => {
    const result = expandQuery('find user handler');
    expect(result.original).toBe('find user handler');
    expect(result.expanded).toContain('find user handler');
  });

  it('splits identifiers into tokens', () => {
    const result = expandQuery('getUserById');
    expect(result.tokens).toContain('get');
    expect(result.tokens).toContain('user');
    expect(result.tokens).toContain('by');
  });

  it('expands with code synonyms', () => {
    const result = expandQuery('find the function');
    // 'function' should expand to method, def, fn, etc.
    const allText = result.expanded.join(' ');
    expect(allText).toMatch(/method|def|fn/);
  });

  it('applies phrase synonyms', () => {
    const result = expandQuery('check the error handling');
    const allText = result.expanded.join(' ');
    expect(allText).toMatch(/catch|try|except|throw/);
  });

  it('caps expansion at 12 queries', () => {
    // A query with many synonymizable terms
    const result = expandQuery('create function to validate and update database record');
    expect(result.expanded.length).toBeLessThanOrEqual(12);
  });

  it('returns no expansion for IDENTIFIER intent', () => {
    const result = expandQuery('getUserById', 'IDENTIFIER');
    expect(result.expanded).toEqual(['getUserById']);
    expect(result.tokens.length).toBeGreaterThan(0);
  });

  it('returns minimal expansion for GRAPH intent', () => {
    const result = expandQuery('who calls validateToken', 'GRAPH');
    expect(result.expanded).toEqual(['who calls validateToken']);
    // But tokens are still split for fulltext
    expect(result.tokens).toContain('validate');
  });

  it('handles empty query', () => {
    const result = expandQuery('');
    expect(result.original).toBe('');
    expect(result.expanded).toContain('');
  });

  it('deduplicates expanded queries', () => {
    const result = expandQuery('test the test');
    const unique = new Set(result.expanded);
    expect(unique.size).toBe(result.expanded.length);
  });
});
