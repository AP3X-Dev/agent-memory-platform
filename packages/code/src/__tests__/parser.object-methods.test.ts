import { mkdtemp, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { describe, expect, it } from 'vitest';
import { parseFile } from '../parser.js';

describe('parseFile object literal method extraction', () => {
  it('indexes function-valued object properties as contained methods', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'amp-parser-object-methods-'));
    const filePath = join(dir, 'object-methods.ts');
    await writeFile(
      filePath,
      [
        'function persist(value: string): string {',
        '  return value;',
        '}',
        '',
        'export const handlers = {',
        '  save(input: string): string {',
        '    return persist(input);',
        '  },',
        '  load: (input: string): string => persist(input),',
        '  format: function formatInner(input: string): string {',
        '    return persist(input);',
        '  },',
        '  status: "ready",',
        '};',
      ].join('\n'),
      'utf-8',
    );

    try {
      const parsed = await parseFile(filePath, 'typescript');
      const handlers = parsed.symbols.find((symbol) => symbol.name === 'handlers');
      const save = parsed.symbols.find((symbol) => symbol.name === 'save');
      const load = parsed.symbols.find((symbol) => symbol.name === 'load');
      const format = parsed.symbols.find((symbol) => symbol.name === 'format');

      expect(handlers).toMatchObject({ kind: 'variable' });
      expect(save).toMatchObject({ kind: 'method', parent_symbol: handlers!.id });
      expect(load).toMatchObject({ kind: 'method', parent_symbol: handlers!.id });
      expect(format).toMatchObject({ kind: 'method', parent_symbol: handlers!.id });
      expect(parsed.symbols.some((symbol) => symbol.name === 'status')).toBe(false);
      expect(parsed.symbols.some((symbol) => symbol.name === 'input')).toBe(false);
      expect(parsed.symbols.some((symbol) => symbol.name === 'formatInner')).toBe(false);
      for (const method of [save!, load!, format!]) {
        expect(parsed.relations).toContainEqual({
          from_symbol: handlers!.id,
          to_symbol: method.id,
          type: 'SYMBOL_CONTAINS',
        });
        expect(parsed.relations).toContainEqual({
          from_symbol: method.id,
          to_symbol: 'persist',
          type: 'SYMBOL_CALLS',
        });
      }
      expect(parsed.relations).not.toContainEqual({
        from_symbol: handlers!.id,
        to_symbol: 'persist',
        type: 'SYMBOL_CALLS',
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
