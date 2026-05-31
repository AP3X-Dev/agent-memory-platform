import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerCodeTools, setCodeServiceInstances } from '../tools.js';
import type { SymbolNode } from '../types.js';

function makeSymbol(overrides: Partial<SymbolNode> = {}): SymbolNode {
  return {
    id: 'sym-helper',
    name: 'helper',
    kind: 'function',
    language: 'typescript',
    file_path: '/repo/packages/amp/src/helper.ts',
    start_line: 3,
    end_line: 9,
    signature: 'function helper() {}',
    doc_comment: '',
    content_hash: 'hash-helper',
    parent_symbol: null,
    created_at: '2026-05-29T00:00:00.000Z',
    updated_at: '2026-05-29T00:00:00.000Z',
    ...overrides,
  };
}

describe('amp_code_symbols tool', () => {
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

  it('forwards project/file/kind scope and bounded limits to symbol lookup', async () => {
    symbolStore.findSymbols.mockResolvedValue([makeSymbol()]);
    const registrations: Array<{ name: string; handler: (args: never) => Promise<{ content: Array<{ text: string }> }> }> = [];
    const server = {
      tool: vi.fn((name: string, _description: string, _schema: unknown, _annotations: unknown, handler: (args: never) => Promise<{ content: Array<{ text: string }> }>) => {
        registrations.push({ name, handler });
        return { name };
      }),
    };

    registerCodeTools(server as never);
    const symbols = registrations.find((registration) => registration.name === 'amp_code_symbols');
    expect(symbols).toBeDefined();

    const response = await symbols!.handler({
      name: 'helper',
      project_name: 'project:amp',
      file_path: 'packages/code',
      kind: 'function',
      limit: 5,
    } as never);

    expect(symbolStore.findSymbols).toHaveBeenCalledWith({
      name: 'helper',
      file_path: 'packages/code',
      kind: 'function',
      limit: 5,
    });
    expect(response.content[0].text).toContain('"name": "helper"');
  });
});
