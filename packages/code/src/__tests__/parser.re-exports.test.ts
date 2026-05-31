import { mkdtemp, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { describe, expect, it } from 'vitest';
import { parseFile } from '../parser.js';

describe('parseFile re-export import extraction', () => {
  it('treats re-exports as module dependencies but ignores local-only exports', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'amp-parser-re-exports-'));
    const filePath = join(dir, 're-exports.ts');
    await writeFile(
      filePath,
      [
        "export { reexported } from './re';",
        "export { local as pub } from './re2';",
        "export * from './all';",
        "export * as ns from './all2';",
        '',
        '// Local-only export --- not a cross-file dependency.',
        'export { plainLocal };',
        'const plainLocal = 1;',
        '',
        '// Default export of a named declaration is still a symbol, not an import.',
        'export default function mainEntry(): number {',
        '  return 1;',
        '}',
      ].join('\n'),
      'utf-8',
    );

    try {
      const parsed = await parseFile(filePath, 'typescript');

      const sources = parsed.imports.map((imp) => imp.source).sort();
      expect(sources).toEqual(['./all', './all2', './re', './re2']);

      const named = parsed.imports.find((imp) => imp.source === './re');
      expect(named?.specifiers.join(' ')).toContain('reexported');

      const aliased = parsed.imports.find((imp) => imp.source === './re2');
      expect(aliased?.specifiers.join(' ')).toContain('local');

      // `export * from` is a namespace re-export --- no named specifiers, so the
      // resolver treats it as "all symbols in the target file".
      const star = parsed.imports.find((imp) => imp.source === './all');
      expect(star?.specifiers).toEqual([]);

      // A plain `export { plainLocal }` with no `from` is not a module edge.
      expect(parsed.imports.some((imp) => imp.source === 'plainLocal')).toBe(false);
      expect(parsed.imports.some((imp) => imp.source.includes('plainLocal'))).toBe(false);

      // Default-exported named declaration is still indexed as a callable symbol.
      expect(parsed.symbols).toContainEqual(
        expect.objectContaining({ name: 'mainEntry', kind: 'function' }),
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
