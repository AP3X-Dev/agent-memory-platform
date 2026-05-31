import { describe, it, expect, vi } from 'vitest';
import { CodeSearch } from '../search.js';
import type { CodeSearchResult } from '../types.js';

function makeResult(overrides: Partial<CodeSearchResult>): CodeSearchResult {
  return {
    id: overrides.id ?? 'sym',
    source_type: overrides.source_type ?? 'symbol',
    name: overrides.name ?? 'symbol',
    kind: overrides.kind ?? 'function',
    language: overrides.language ?? 'typescript',
    file_path: overrides.file_path ?? '/src/index.ts',
    start_line: overrides.start_line ?? 1,
    signature: overrides.signature ?? 'function symbol(): void',
    doc_comment: overrides.doc_comment ?? '',
    score: overrides.score ?? 0.5,
    content: overrides.content,
  };
}

describe('CodeSearch.buildContext token budgeting', () => {
  it('skips oversized results and keeps later results that fit the budget', async () => {
    const search = new CodeSearch({} as never, {} as never);
    vi.spyOn(search, 'search').mockResolvedValue([
      makeResult({
        id: 'oversized',
        signature: 'function oversized(): void',
        doc_comment: 'x'.repeat(2000),
        score: 0.99,
      }),
      makeResult({
        id: 'fitting',
        name: 'fitting',
        signature: 'function fitting(): void',
        doc_comment: 'small',
        score: 0.8,
      }),
    ]);

    const ctx = await search.buildContext('find useful symbol', 100);

    expect(ctx.symbols.map((s) => s.id)).toEqual(['fitting']);
    expect(ctx.token_count).toBeGreaterThan(0);
    expect(ctx.token_count).toBeLessThanOrEqual(100);
  });

  it('forwards code filters into the underlying search call', async () => {
    const search = new CodeSearch({} as never, {} as never);
    const spy = vi.spyOn(search, 'search').mockResolvedValue([
      makeResult({
        id: 'scoped',
        file_path: '/home/cerebro/projects/amp/packages/core/src/cli.ts',
      }),
    ]);

    await search.buildContext('find snapshot code', 1000, undefined, {
      file_path: 'AMP',
      language: 'typescript',
      kind: 'function',
    });

    expect(spy).toHaveBeenCalledWith(
      'find snapshot code',
      expect.objectContaining({
        file_path: 'AMP',
        language: 'typescript',
        kind: 'function',
        include_semantics: true,
      }),
    );
  });
});
