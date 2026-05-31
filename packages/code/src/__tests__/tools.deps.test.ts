import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerCodeTools, setCodeServiceInstances } from '../tools.js';
import type { SymbolNode } from '../types.js';

function makeSymbol(overrides: Partial<SymbolNode> = {}): SymbolNode {
  return {
    id: 'sym-run',
    name: 'run',
    kind: 'function',
    language: 'typescript',
    file_path: '/repo/packages/amp/src/run.ts',
    start_line: 12,
    end_line: 18,
    signature: 'function run() {}',
    doc_comment: '',
    content_hash: 'hash-run',
    parent_symbol: null,
    created_at: '2026-05-29T00:00:00.000Z',
    updated_at: '2026-05-29T00:00:00.000Z',
    ...overrides,
  };
}

describe('amp_code_deps tool', () => {
  const symbolStore = {
    getByFile: vi.fn(),
    findByName: vi.fn(),
    findSymbols: vi.fn(),
    getCallers: vi.fn(),
    getCallees: vi.fn(),
    getImporters: vi.fn(),
    getInheritanceChain: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    setCodeServiceInstances({
      codeIndexer: {
        indexProject: vi.fn(),
        indexFile: vi.fn(),
      },
      codeSearch: {
        search: vi.fn(),
        buildContext: vi.fn(),
        renderContextMarkdown: vi.fn(),
      },
      symbolStore,
    });
  });

  it('forwards project/file/kind scope and bounded limits to dependency queries', async () => {
    symbolStore.getCallers.mockResolvedValue([makeSymbol()]);
    const registrations: Array<{ name: string; handler: (args: never) => Promise<{ content: Array<{ text: string }> }> }> = [];
    const server = {
      tool: vi.fn((name: string, _description: string, _schema: unknown, _annotations: unknown, handler: (args: never) => Promise<{ content: Array<{ text: string }> }>) => {
        registrations.push({ name, handler });
        return { name };
      }),
    };

    registerCodeTools(server as never);
    const deps = registrations.find((registration) => registration.name === 'amp_code_deps');
    expect(deps).toBeDefined();

    const response = await deps!.handler({
      symbol_name: 'helper',
      direction: 'callers',
      project_name: 'project:amp',
      file_path: 'packages/code',
      kind: 'function',
      limit: 7,
    } as never);

    expect(symbolStore.getCallers).toHaveBeenCalledWith('helper', {
      file_path: 'packages/code',
      kind: 'function',
      limit: 7,
    });
    expect(response.content[0].text).toContain('"count": 1');
  });
});
