import { mkdtemp, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { describe, expect, it } from 'vitest';
import { parseFile } from '../parser.js';

describe('parseFile assigned function extraction', () => {
  it('indexes const-assigned arrow and function expressions as callable symbols', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'amp-parser-assigned-'));
    const filePath = join(dir, 'assigned.ts');
    await writeFile(
      filePath,
      [
        'function helper(value: string): string {',
        '  return value;',
        '}',
        '',
        'export const normalize = (input: string): string => helper(input);',
        '',
        'export const buildRunner = function buildRunnerFactory(input: string): string {',
        '  return normalize(input);',
        '};',
      ].join('\n'),
      'utf-8',
    );

    try {
      const parsed = await parseFile(filePath, 'typescript');
      const normalize = parsed.symbols.find((symbol) => symbol.name === 'normalize');
      const buildRunner = parsed.symbols.find((symbol) => symbol.name === 'buildRunner');

      expect(normalize).toMatchObject({ kind: 'function' });
      expect(buildRunner).toMatchObject({ kind: 'function' });
      expect(parsed.symbols.some((symbol) => symbol.name === 'input')).toBe(false);
      expect(parsed.symbols.some((symbol) => symbol.name === 'buildRunnerFactory')).toBe(false);
      expect(parsed.relations).toContainEqual({
        from_symbol: normalize!.id,
        to_symbol: 'helper',
        type: 'SYMBOL_CALLS',
      });
      expect(parsed.relations).toContainEqual({
        from_symbol: buildRunner!.id,
        to_symbol: 'normalize',
        type: 'SYMBOL_CALLS',
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
