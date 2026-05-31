import { mkdtemp, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { describe, expect, it } from 'vitest';
import { parseFile } from '../parser.js';

describe('parseFile default export extraction', () => {
  it('indexes default-exported functions as callable symbols with their call edges', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'amp-parser-default-fn-'));
    const filePath = join(dir, 'default-fn.ts');
    await writeFile(
      filePath,
      [
        'function helper(): number {',
        '  return 1;',
        '}',
        '',
        'export default function mainEntry(): number {',
        '  return helper();',
        '}',
      ].join('\n'),
      'utf-8',
    );

    try {
      const parsed = await parseFile(filePath, 'typescript');
      const main = parsed.symbols.find((symbol) => symbol.name === 'mainEntry');

      expect(main).toMatchObject({ kind: 'function', parent_symbol: null });
      expect(parsed.relations).toContainEqual({
        from_symbol: main!.id,
        to_symbol: 'helper',
        type: 'SYMBOL_CALLS',
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('indexes default-exported classes with contained methods and call edges', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'amp-parser-default-class-'));
    const filePath = join(dir, 'default-class.ts');
    await writeFile(
      filePath,
      [
        'function helper(): number {',
        '  return 1;',
        '}',
        '',
        'export default class Service {',
        '  run(): number {',
        '    return helper();',
        '  }',
        '}',
      ].join('\n'),
      'utf-8',
    );

    try {
      const parsed = await parseFile(filePath, 'typescript');
      const service = parsed.symbols.find((symbol) => symbol.name === 'Service');
      const run = parsed.symbols.find((symbol) => symbol.name === 'run');

      expect(service).toMatchObject({ kind: 'class', parent_symbol: null });
      expect(run).toMatchObject({ kind: 'method', parent_symbol: service!.id });
      expect(parsed.relations).toContainEqual({
        from_symbol: service!.id,
        to_symbol: run!.id,
        type: 'SYMBOL_CONTAINS',
      });
      expect(parsed.relations).toContainEqual({
        from_symbol: run!.id,
        to_symbol: 'helper',
        type: 'SYMBOL_CALLS',
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
