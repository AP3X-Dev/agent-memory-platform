import { mkdtemp, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { describe, expect, it } from 'vitest';
import { parseFile } from '../parser.js';

describe('parseFile module-anchor symbol for pure barrel files', () => {
  it('emits a synthetic module symbol when a file only re-exports', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'amp-parser-module-anchor-'));
    const filePath = join(dir, 'index.ts');
    await writeFile(
      filePath,
      ["export { TargetClass } from './target';", "export * as ns from './target';"].join('\n'),
      'utf-8',
    );

    try {
      const parsed = await parseFile(filePath, 'typescript');

      // Re-exports are still captured as module dependencies.
      expect(parsed.imports.map((imp) => imp.source).sort()).toEqual(['./target', './target']);

      // The file declares no symbols of its own, so a single module anchor is added
      // to give resolveImports a node to hang SYMBOL_IMPORTS edges on.
      expect(parsed.symbols).toHaveLength(1);
      const moduleSymbol = parsed.symbols[0];
      expect(moduleSymbol.kind).toBe('module');
      expect(moduleSymbol.name).toBe('index.ts');
      expect(moduleSymbol.file_path).toBe(filePath);
      expect(moduleSymbol.parent_symbol).toBeNull();
      expect(moduleSymbol.content_hash).toMatch(/^[0-9a-f]{16}$/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('does not add a module anchor when the file declares its own symbols', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'amp-parser-module-anchor-own-'));
    const filePath = join(dir, 'barrel.ts');
    await writeFile(
      filePath,
      [
        "export { targetFn } from './target';",
        'export function barrelOwn(): number {',
        '  return 42;',
        '}',
      ].join('\n'),
      'utf-8',
    );

    try {
      const parsed = await parseFile(filePath, 'typescript');

      // A real symbol exists, so no synthetic module anchor is created.
      expect(parsed.symbols.some((s) => s.kind === 'module')).toBe(false);
      expect(parsed.symbols).toContainEqual(
        expect.objectContaining({ name: 'barrelOwn', kind: 'function' }),
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('does not add a module anchor for an empty file with no imports', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'amp-parser-module-anchor-empty-'));
    const filePath = join(dir, 'empty.ts');
    await writeFile(filePath, '// just a comment, nothing else\n', 'utf-8');

    try {
      const parsed = await parseFile(filePath, 'typescript');
      expect(parsed.symbols).toHaveLength(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
