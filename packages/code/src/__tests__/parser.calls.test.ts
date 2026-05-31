import { mkdtemp, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { describe, expect, it } from 'vitest';
import { parseFile } from '../parser.js';

describe('parseFile call relationship extraction', () => {
  it('emits SYMBOL_CALLS only for called local or imported code symbols', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'amp-parser-calls-'));
    const filePath = join(dir, 'sample.ts');
    await writeFile(
      filePath,
      [
        "import { externalHelper } from './external';",
        '',
        'function helper(value: string): string {',
        '  return value.trim();',
        '}',
        '',
        'export function run(input: string): string {',
        '  const normalized = input.trim();',
        '  return externalHelper(helper(normalized)).toUpperCase();',
        '}',
      ].join('\n'),
      'utf-8',
    );

    try {
      const parsed = await parseFile(filePath, 'typescript');
      const run = parsed.symbols.find((symbol) => symbol.name === 'run');

      expect(run).toBeDefined();
      expect(parsed.relations).toContainEqual({
        from_symbol: run!.id,
        to_symbol: 'helper',
        type: 'SYMBOL_CALLS',
      });
      expect(parsed.relations).toContainEqual({
        from_symbol: run!.id,
        to_symbol: 'externalHelper',
        type: 'SYMBOL_CALLS',
      });
      expect(parsed.relations).not.toContainEqual({
        from_symbol: run!.id,
        to_symbol: 'trim',
        type: 'SYMBOL_CALLS',
      });
      expect(parsed.relations).not.toContainEqual({
        from_symbol: run!.id,
        to_symbol: 'toUpperCase',
        type: 'SYMBOL_CALLS',
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
