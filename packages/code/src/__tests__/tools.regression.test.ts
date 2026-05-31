// packages/code/src/__tests__/tools.regression.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const TOOLS_SOURCE = fs.readFileSync(
  path.resolve(__dirname, '../tools.ts'),
  'utf-8',
);

describe('code tools.ts regression', () => {
  it('BUG-0045: amp_code_index validates path is within project root to prevent directory traversal', () => {
    // Before the fix, the amp_code_index MCP tool accepted any absolute
    // filesystem path with no restriction, allowing any MCP client to walk
    // and parse arbitrary directories (e.g. /, /etc) on the server.
    // The fix adds path.resolve + baseDir+sep prefix matching to reject
    // paths outside process.cwd().

    // Verify baseDir is set from process.cwd()
    expect(TOOLS_SOURCE).toContain('path.resolve(process.cwd())');

    // Verify the resolved path is checked against baseDir with separator
    expect(TOOLS_SOURCE).toContain('baseDir + path.sep');

    // Verify traversal attempts throw an error
    expect(TOOLS_SOURCE).toContain('Path must be within project root');

    // Verify validation happens before any indexing operation
    const validationIdx = TOOLS_SOURCE.indexOf('Path must be within project root');
    const indexFileIdx = TOOLS_SOURCE.indexOf('codeIndexer.indexFile');
    const indexProjectIdx = TOOLS_SOURCE.indexOf('codeIndexer.indexProject');
    expect(validationIdx).toBeLessThan(indexFileIdx);
    expect(validationIdx).toBeLessThan(indexProjectIdx);
  });

  it('amp_code_context exposes project and file path scoping for direct code context calls', () => {
    expect(TOOLS_SOURCE).toContain('project_name');
    expect(TOOLS_SOURCE).toContain('buildCodePathScope');
    expect(TOOLS_SOURCE).toContain('file_path: buildCodePathScope(args.file_path, args.project_name)');
  });

  it('amp_code_search exposes project and file path scoping for direct code search calls', () => {
    const scopedSearchCalls = TOOLS_SOURCE.match(/file_path: buildCodePathScope\(args\.file_path, args\.project_name\)/g) ?? [];

    expect(scopedSearchCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('amp_code_ast_grep exposes ast-grep structural search as a read-only code tool', () => {
    expect(TOOLS_SOURCE).toContain("'amp_code_ast_grep'");
    expect(TOOLS_SOURCE).toContain('structuralSearch(resolved');
    expect(TOOLS_SOURCE).toContain('readOnlyHint: true');
    expect(TOOLS_SOURCE).toContain('language: z.enum([\'javascript\', \'typescript\', \'tsx\'])');
  });

  it('amp_code_ast_grep exposes and forwards max_file_bytes for large-repo safety', () => {
    expect(TOOLS_SOURCE).toContain('max_file_bytes');
    expect(TOOLS_SOURCE).toContain('max_file_bytes: args.max_file_bytes');
  });
});
