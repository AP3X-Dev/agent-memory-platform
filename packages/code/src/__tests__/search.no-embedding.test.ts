// packages/code/src/__tests__/search.no-embedding.test.ts
//
// Memory-quality guarantee: "no-embedding mode avoids random context".
//
// When no OpenAI key is configured the embedding provider is `available: false`.
// In that mode CodeSearch must NOT issue dense vector queries (querying a vector
// index with zero vectors yields uniform cosine scores → arbitrary ordering).
// It must instead rely on fulltext + the deterministic lexical-vector index, and
// produce identical results across repeated calls.

import { describe, it, expect, vi } from 'vitest';
import type { EmbeddingProvider } from '@memberry/core';

function symbolRecord(id: string, score: number) {
  const props = {
    id,
    name: `fn_${id}`,
    kind: 'function',
    language: 'typescript',
    file_path: `/src/${id}.ts`,
    start_line: 1,
    signature: `function fn_${id}(): void`,
    doc_comment: '',
  };
  return {
    get: (key: string) => (key === 's' ? { properties: props } : key === 'score' ? score : undefined),
  };
}

/** A driver that records every Cypher string run and serves deterministic fulltext hits. */
function makeRecordingDriver() {
  const queries: string[] = [];
  const session = {
    run: vi.fn(async (cypher: string) => {
      queries.push(cypher);
      // Only the fulltext index yields hits; everything else returns empty.
      if (cypher.includes("db.index.fulltext.queryNodes")) {
        return { records: [symbolRecord('a', 0.9), symbolRecord('b', 0.7)] };
      }
      return { records: [] };
    }),
    close: vi.fn(),
  };
  return { driver: { session: vi.fn(() => session) } as any, queries };
}

function disabledEmbedding(): EmbeddingProvider {
  return {
    available: false,
    embed: vi.fn(async () => new Array(1536).fill(0)),
    embedBatch: vi.fn(async (t: string[]) => t.map(() => new Array(1536).fill(0))),
  };
}

function availableEmbedding(): EmbeddingProvider {
  return {
    available: true,
    embed: vi.fn(async () => new Array(1536).fill(0.01)),
    embedBatch: vi.fn(async (t: string[]) => t.map(() => new Array(1536).fill(0.01))),
  };
}

describe('CodeSearch no-embedding mode', () => {
  it('skips dense vector queries when embeddings are unavailable', async () => {
    const { driver, queries } = makeRecordingDriver();
    const embedding = disabledEmbedding();
    const { CodeSearch } = await import('../search.js');
    const search = new CodeSearch(driver, embedding);

    const results = await search.search('find the parser', { limit: 10 });

    // embed() must never be called for query vectors in disabled mode.
    expect((embedding.embed as any)).not.toHaveBeenCalled();
    // No dense semantic/symbol vector index queries were issued…
    expect(queries.some((q) => q.includes("queryNodes('symbol_embedding'"))).toBe(false);
    expect(queries.some((q) => q.includes("queryNodes('semantic_embedding'"))).toBe(false);
    // …but fulltext and the deterministic lexical-vector index still ran.
    expect(queries.some((q) => q.includes('db.index.fulltext.queryNodes'))).toBe(true);
    expect(queries.some((q) => q.includes("queryNodes('symbol_lexical'"))).toBe(true);
    // And we still get the fulltext-sourced results back.
    expect(results.length).toBeGreaterThan(0);
  });

  it('produces identical results across repeated calls (deterministic, not random)', async () => {
    const { driver } = makeRecordingDriver();
    const { CodeSearch } = await import('../search.js');
    const search = new CodeSearch(driver, disabledEmbedding());

    const first = await search.search('find the parser', { limit: 10 });
    const second = await search.search('find the parser', { limit: 10 });

    expect(first.map((r) => r.id)).toEqual(second.map((r) => r.id));
    expect(first.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('DOES issue dense vector queries when embeddings are available (control)', async () => {
    const { driver, queries } = makeRecordingDriver();
    const embedding = availableEmbedding();
    const { CodeSearch } = await import('../search.js');
    const search = new CodeSearch(driver, embedding);

    await search.search('find the parser', { limit: 10 });

    expect((embedding.embed as any)).toHaveBeenCalled();
    expect(queries.some((q) => q.includes("queryNodes('symbol_embedding'"))).toBe(true);
    expect(queries.some((q) => q.includes("queryNodes('semantic_embedding'"))).toBe(true);
  });
});
