import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SymbolNode } from '../types.js';

const mocks = vi.hoisted(() => {
  const symbolStore = {
    getHashesByFile: vi.fn(),
    findByCompositeKey: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    getByFile: vi.fn(),
  };
  return {
    parseFile: vi.fn(),
    symbolStore,
    resolveImports: vi.fn(),
    linkAllSymbolsToEntities: vi.fn(),
  };
});

vi.mock('../parser.js', () => ({
  parseFile: mocks.parseFile,
}));

vi.mock('../symbol-store.js', () => ({
  SymbolStore: vi.fn(() => mocks.symbolStore),
}));

vi.mock('../resolver.js', () => ({
  ImportResolver: vi.fn(() => ({
    resolveImports: mocks.resolveImports,
    linkAllSymbolsToEntities: mocks.linkAllSymbolsToEntities,
  })),
}));

function makeSymbol(overrides: Partial<SymbolNode>): SymbolNode {
  return {
    id: 'sym-default',
    name: 'defaultSymbol',
    kind: 'function',
    language: 'typescript',
    file_path: '/repo/src/sample.ts',
    start_line: 1,
    end_line: 1,
    signature: 'function defaultSymbol() {}',
    doc_comment: '',
    content_hash: 'hash-default',
    parent_symbol: null,
    created_at: '2026-05-29T00:00:00.000Z',
    updated_at: '2026-05-29T00:00:00.000Z',
    ...overrides,
  };
}

describe('CodeIndexer relation resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveImports.mockResolvedValue(0);
    mocks.linkAllSymbolsToEntities.mockResolvedValue(0);
  });

  it('passes parsed symbol fallback metadata when resolving relations for unchanged symbols', async () => {
    const { CodeIndexer } = await import('../indexer.js');
    const run = makeSymbol({
      id: 'fresh-run-id',
      name: 'run',
      start_line: 5,
      end_line: 7,
      content_hash: 'hash-run',
    });
    const helper = makeSymbol({
      id: 'fresh-helper-id',
      name: 'helper',
      start_line: 1,
      end_line: 3,
      content_hash: 'hash-helper',
    });

    mocks.parseFile.mockResolvedValue({
      file_path: '/repo/src/sample.ts',
      language: 'typescript',
      symbols: [helper, run],
      imports: [],
      relations: [
        { from_symbol: run.id, to_symbol: 'helper', type: 'SYMBOL_CALLS' },
      ],
    });
    mocks.symbolStore.getHashesByFile.mockResolvedValue(new Set(['hash-run', 'hash-helper']));
    mocks.symbolStore.getByFile.mockResolvedValue([helper, run]);

    const runCalls: Array<{ query: string; params: Record<string, unknown> }> = [];
    const session = {
      run: vi.fn(async (query: string, params: Record<string, unknown> = {}) => {
        runCalls.push({ query, params });
        return { records: [{ get: () => 1 }] };
      }),
      close: vi.fn(),
    };
    const driver = { session: vi.fn(() => session) };

    const indexer = new CodeIndexer(driver as never);
    await indexer.indexFile('/repo/src/sample.ts', 'typescript');

    const relationCall = runCalls.find((call) => call.query.includes('SYMBOL_CALLS'));
    expect(relationCall).toBeDefined();
    expect(relationCall!.query).toContain('from.name = $fromName');
    expect(relationCall!.params).toMatchObject({
      fromRef: run.id,
      fromName: 'run',
      fromKind: 'function',
      fromStartLine: 5,
      toRef: 'helper',
    });
  });
});
