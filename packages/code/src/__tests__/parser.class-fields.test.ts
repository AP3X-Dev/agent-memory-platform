import { mkdtemp, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { describe, expect, it } from 'vitest';
import { parseFile } from '../parser.js';

describe('parseFile class field function extraction', () => {
  it('indexes class property arrow and function expressions as contained methods', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'amp-parser-class-fields-'));
    const filePath = join(dir, 'class-fields.ts');
    await writeFile(
      filePath,
      [
        'function persist(value: string): string {',
        '  return value;',
        '}',
        '',
        'export class Worker {',
        '  run = (input: string): string => persist(input);',
        '',
        '  private format = function formatInner(input: string): string {',
        '    return persist(input);',
        '  };',
        '}',
      ].join('\n'),
      'utf-8',
    );

    try {
      const parsed = await parseFile(filePath, 'typescript');
      const worker = parsed.symbols.find((symbol) => symbol.name === 'Worker');
      const run = parsed.symbols.find((symbol) => symbol.name === 'run');
      const format = parsed.symbols.find((symbol) => symbol.name === 'format');

      expect(worker).toMatchObject({ kind: 'class' });
      expect(run).toMatchObject({ kind: 'method', parent_symbol: worker!.id });
      expect(format).toMatchObject({ kind: 'method', parent_symbol: worker!.id });
      expect(parsed.symbols.some((symbol) => symbol.name === 'input')).toBe(false);
      expect(parsed.symbols.some((symbol) => symbol.name === 'formatInner')).toBe(false);
      expect(parsed.relations).toContainEqual({
        from_symbol: worker!.id,
        to_symbol: run!.id,
        type: 'SYMBOL_CONTAINS',
      });
      expect(parsed.relations).toContainEqual({
        from_symbol: worker!.id,
        to_symbol: format!.id,
        type: 'SYMBOL_CONTAINS',
      });
      expect(parsed.relations).toContainEqual({
        from_symbol: run!.id,
        to_symbol: 'persist',
        type: 'SYMBOL_CALLS',
      });
      expect(parsed.relations).toContainEqual({
        from_symbol: format!.id,
        to_symbol: 'persist',
        type: 'SYMBOL_CALLS',
      });
      expect(parsed.relations).not.toContainEqual({
        from_symbol: worker!.id,
        to_symbol: 'persist',
        type: 'SYMBOL_CALLS',
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
