// packages/code/src/__tests__/structural-search.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { structuralSearch } from '../structural-search.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'amp-structural-search-'));
  await mkdir(join(tempDir, 'src'), { recursive: true });
  await writeFile(
    join(tempDir, 'src', 'client.ts'),
    [
      'export async function loadUsers() {',
      '  return fetch("/api/users");',
      '}',
      '',
      'const textOnly = "fetch(\\"/api/users\\")";',
    ].join('\n'),
    'utf-8',
  );
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('structuralSearch', () => {
  it('finds TypeScript AST pattern matches and captures meta variables', async () => {
    const result = await structuralSearch(tempDir, {
      pattern: 'fetch($URL)',
      language: 'typescript',
      limit: 10,
    });

    expect(result.files_scanned).toBe(1);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({
      file_path: join(tempDir, 'src', 'client.ts'),
      language: 'typescript',
      kind: 'call_expression',
      start_line: 2,
      end_line: 2,
      text: 'fetch("/api/users")',
    });
    expect(result.matches[0].captures.URL.text).toBe('"/api/users"');
  });

  it('skips files larger than the configured byte limit before reading them', async () => {
    await writeFile(
      join(tempDir, 'src', 'large.ts'),
      `const oversized = "${'x'.repeat(256)}";\nfetch("/too-large");\n`,
      'utf-8',
    );

    const result = await structuralSearch(tempDir, {
      pattern: 'fetch($URL)',
      language: 'typescript',
      max_file_bytes: 128,
      limit: 10,
    });

    expect(result.files_scanned).toBe(1);
    expect(result.files_skipped).toBe(1);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].text).toBe('fetch("/api/users")');
    expect(result.errors).toEqual([]);
  });
});
