// packages/code/src/__tests__/search.language-filter.test.ts
// Regression test for the vector search language filter bug.
//
// The bug: vectorSearch() filtered with `file_path.includes(`.${options.language}`)`
// but language values are 'typescript', 'javascript', etc. — no file path
// contains '.typescript', so all language-filtered vector hits were dropped.
// The fix: filter on the symbol's `language` property, matching fulltext search.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CodeSearchResult } from '../types.js';

// ─── Mock helpers ───────────────────────────────────────────────────────────

function makeSymbolRecord(overrides: Partial<{
  id: string;
  name: string;
  kind: string;
  language: string;
  file_path: string;
  start_line: number;
  signature: string;
  doc_comment: string;
}> = {}) {
  const props = {
    id: overrides.id ?? `sym-${Math.random().toString(36).slice(2, 8)}`,
    name: overrides.name ?? 'someFunction',
    kind: overrides.kind ?? 'function',
    language: overrides.language ?? 'typescript',
    file_path: overrides.file_path ?? '/src/utils.ts',
    start_line: overrides.start_line ?? 1,
    signature: overrides.signature ?? 'function someFunction(): void',
    doc_comment: overrides.doc_comment ?? '',
  };
  return {
    get: (key: string) => {
      if (key === 's') return { properties: props };
      if (key === 'score') return 0.9;
      return undefined;
    },
  };
}

function makeDriverWithRecords(records: ReturnType<typeof makeSymbolRecord>[]) {
  const session = {
    run: vi.fn(async () => ({ records })),
    close: vi.fn(),
  };
  return {
    driver: { session: vi.fn(() => session) } as any,
    session,
  };
}

function makeEmbeddingProvider() {
  return {
    embed: vi.fn(async () => new Array(1536).fill(0)),
    embedBatch: vi.fn(async (texts: string[]) => texts.map(() => new Array(1536).fill(0))),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('vectorSearch language filter', () => {
  it('returns typescript symbols when language=typescript (the regression)', async () => {
    // This test covers the exact bug: TypeScript symbols have language='typescript'
    // and file_path like '/src/utils.ts'. The old filter checked
    // file_path.includes('.typescript') which never matches.

    const records = [
      makeSymbolRecord({ id: 'sym-1', language: 'typescript', file_path: '/src/utils.ts' }),
      makeSymbolRecord({ id: 'sym-2', language: 'typescript', file_path: '/src/index.tsx' }),
      makeSymbolRecord({ id: 'sym-3', language: 'javascript', file_path: '/src/legacy.js' }),
    ];

    const { driver } = makeDriverWithRecords(records);
    const embedding = makeEmbeddingProvider();

    const { CodeSearch } = await import('../search.js');
    const search = new CodeSearch(driver, embedding);

    // Access private method via any cast
    const results: CodeSearchResult[] = await (search as any).vectorSearch(
      'some query',
      20,
      { language: 'typescript' },
    );

    // Should include the 2 typescript symbols, not the javascript one
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.language === 'typescript')).toBe(true);
    expect(results.find((r) => r.id === 'sym-1')).toBeTruthy();
    expect(results.find((r) => r.id === 'sym-2')).toBeTruthy();
  });

  it('returns javascript symbols when language=javascript', async () => {
    const records = [
      makeSymbolRecord({ id: 'sym-ts', language: 'typescript', file_path: '/src/index.ts' }),
      makeSymbolRecord({ id: 'sym-js', language: 'javascript', file_path: '/src/utils.js' }),
      makeSymbolRecord({ id: 'sym-mjs', language: 'javascript', file_path: '/src/lib.mjs' }),
    ];

    const { driver } = makeDriverWithRecords(records);
    const embedding = makeEmbeddingProvider();

    const { CodeSearch } = await import('../search.js');
    const search = new CodeSearch(driver, embedding);

    const results: CodeSearchResult[] = await (search as any).vectorSearch(
      'some query',
      20,
      { language: 'javascript' },
    );

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.language === 'javascript')).toBe(true);
  });

  it('returns python symbols when language=python', async () => {
    const records = [
      makeSymbolRecord({ id: 'sym-py', language: 'python', file_path: '/src/main.py' }),
      makeSymbolRecord({ id: 'sym-ts', language: 'typescript', file_path: '/src/index.ts' }),
    ];

    const { driver } = makeDriverWithRecords(records);
    const embedding = makeEmbeddingProvider();

    const { CodeSearch } = await import('../search.js');
    const search = new CodeSearch(driver, embedding);

    const results: CodeSearchResult[] = await (search as any).vectorSearch(
      'some query',
      20,
      { language: 'python' },
    );

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('sym-py');
    expect(results[0].language).toBe('python');
  });

  it('returns all symbols when no language filter is set', async () => {
    const records = [
      makeSymbolRecord({ id: 'sym-1', language: 'typescript', file_path: '/src/a.ts' }),
      makeSymbolRecord({ id: 'sym-2', language: 'javascript', file_path: '/src/b.js' }),
      makeSymbolRecord({ id: 'sym-3', language: 'python', file_path: '/src/c.py' }),
    ];

    const { driver } = makeDriverWithRecords(records);
    const embedding = makeEmbeddingProvider();

    const { CodeSearch } = await import('../search.js');
    const search = new CodeSearch(driver, embedding);

    const results: CodeSearchResult[] = await (search as any).vectorSearch(
      'some query',
      20,
    );

    expect(results).toHaveLength(3);
  });

  it('filters kind independently of language', async () => {
    const records = [
      makeSymbolRecord({ id: 'sym-1', language: 'typescript', kind: 'function' }),
      makeSymbolRecord({ id: 'sym-2', language: 'typescript', kind: 'class' }),
      makeSymbolRecord({ id: 'sym-3', language: 'javascript', kind: 'function' }),
    ];

    const { driver } = makeDriverWithRecords(records);
    const embedding = makeEmbeddingProvider();

    const { CodeSearch } = await import('../search.js');
    const search = new CodeSearch(driver, embedding);

    const results: CodeSearchResult[] = await (search as any).vectorSearch(
      'some query',
      20,
      { language: 'typescript', kind: 'function' },
    );

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('sym-1');
    expect(results[0].language).toBe('typescript');
    expect(results[0].kind).toBe('function');
  });

  it('populates language field on all symbol results from fulltext search', async () => {
    // The fulltextSearch mapper should also include the language property
    const records = [
      makeSymbolRecord({ id: 'sym-1', language: 'typescript', file_path: '/src/a.ts' }),
    ];

    const { driver } = makeDriverWithRecords(records);
    const embedding = makeEmbeddingProvider();

    const { CodeSearch } = await import('../search.js');
    const search = new CodeSearch(driver, embedding);

    const results: CodeSearchResult[] = await (search as any).fulltextSearch(
      'some query',
      20,
    );

    expect(results).toHaveLength(1);
    expect(results[0].language).toBe('typescript');
  });
});

describe('vectorSearch language filter — verifies the old bug is gone', () => {
  it('would have returned 0 results with the old file_path.includes filter', async () => {
    // This test documents exactly why the old filter was wrong.
    // With language='typescript' and file_path='/src/utils.ts':
    //   old: '/src/utils.ts'.includes('.typescript') => false => DROPPED
    //   new: 'typescript' === 'typescript' => true => KEPT

    const records = [
      makeSymbolRecord({ id: 'sym-1', language: 'typescript', file_path: '/src/utils.ts' }),
    ];

    const { driver } = makeDriverWithRecords(records);
    const embedding = makeEmbeddingProvider();

    const { CodeSearch } = await import('../search.js');
    const search = new CodeSearch(driver, embedding);

    // Old behavior would return [] because '/src/utils.ts'.includes('.typescript') is false
    const filePath = '/src/utils.ts';
    expect(filePath.includes('.typescript')).toBe(false); // proves old bug

    // New behavior uses the language property
    const results: CodeSearchResult[] = await (search as any).vectorSearch(
      'some query',
      20,
      { language: 'typescript' },
    );

    expect(results).toHaveLength(1);
    expect(results[0].language).toBe('typescript');
  });

  it('go language also had the same problem', async () => {
    // '.go' would have accidentally worked with the old filter since
    // Go files have extension '.go' and the language is 'go'.
    // But the fix is still correct — it uses the language property consistently.
    const records = [
      makeSymbolRecord({ id: 'sym-go', language: 'go', file_path: '/src/main.go' }),
    ];

    const { driver } = makeDriverWithRecords(records);
    const embedding = makeEmbeddingProvider();

    const { CodeSearch } = await import('../search.js');
    const search = new CodeSearch(driver, embedding);

    const results: CodeSearchResult[] = await (search as any).vectorSearch(
      'some query',
      20,
      { language: 'go' },
    );

    expect(results).toHaveLength(1);
    expect(results[0].language).toBe('go');
  });
});
