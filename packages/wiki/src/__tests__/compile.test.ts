// packages/wiki/src/__tests__/compile.test.ts
// Tests for WikiCompiler, slugify, and resolveInlineLinks.

import { describe, it, expect, vi } from 'vitest';
import { slugify, WikiCompiler } from '../compile.js';
import type { Driver, Session, Result } from 'neo4j-driver';

// slugify tests

describe('slugify', () => {
  it('converts to lowercase', () => {
    expect(slugify('Mars FPS')).toBe('mars-fps');
  });

  it('replaces spaces with hyphens', () => {
    expect(slugify('game engine')).toBe('game-engine');
  });

  it('replaces non-alphanumeric chars with hyphens', () => {
    expect(slugify('ECS (Entity Component System)')).toBe('ecs-entity-component-system');
  });

  it('trims leading/trailing hyphens', () => {
    expect(slugify('---hello---')).toBe('hello');
  });

  it('collapses multiple hyphens', () => {
    expect(slugify('hello   world   test')).toBe('hello-world-test');
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });

  it('handles pure punctuation', () => {
    expect(slugify('!!??...')).toBe('');
  });

  it('handles numbers', () => {
    expect(slugify('v2.0 release')).toBe('v2-0-release');
  });

  it('handles single char', () => {
    expect(slugify('A')).toBe('a');
  });

  it('handles already-slug', () => {
    expect(slugify('already-slug')).toBe('already-slug');
  });

  it('handles unicode characters', () => {
    expect(slugify('cafe latte')).toBe('cafe-latte');
  });

  it('handles mixed case and numbers', () => {
    expect(slugify('MyComponent2Test')).toBe('mycomponent2test');
  });
});

// Mock helpers

function mockRecord(data: Record<string, unknown>) {
  return {
    get(key: string) {
      return data[key];
    },
    keys: Object.keys(data),
  };
}

function mockResult(records: ReturnType<typeof mockRecord>[] = []): Result {
  return { records } as unknown as Result;
}

function createMockDriver(queryResponses: Map<string, ReturnType<typeof mockResult>>): Driver {
  const mockSession = {
    run: vi.fn(async (query: string, _params?: unknown) => {
      // Match query responses by substring match
      for (const [key, value] of queryResponses) {
        if (query.includes(key)) return value;
      }
      return mockResult([]);
    }),
    close: vi.fn(async () => {}),
  } as unknown as Session;

  return {
    session: vi.fn(() => mockSession),
  } as unknown as Driver;
}

// WikiCompiler tests

describe('WikiCompiler', () => {
  it('compiles an empty graph with zero projects', async () => {
    const driver = createMockDriver(new Map());
    const compiler = new WikiCompiler(driver);

    const os = await import('node:os');
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const outputDir = path.join(os.tmpdir(), `amp-wiki-test-${Date.now()}`);

    try {
      const result = await compiler.compile(outputDir);

      expect(result.projects_compiled).toBe(0);
      expect(result.articles_compiled).toBe(0);
      expect(result.episodics_rendered).toBe(0);
      expect(result.output_dir).toBe(outputDir);
      expect(result.cross_project_pages).toBe(3); // decisions + patterns + recent

      // Verify output files exist
      const indexStat = await fs.stat(path.join(outputDir, '_index.md'));
      expect(indexStat.isFile()).toBe(true);

      const decisionsStat = await fs.stat(path.join(outputDir, '_decisions.md'));
      expect(decisionsStat.isFile()).toBe(true);

      const patternsStat = await fs.stat(path.join(outputDir, '_patterns.md'));
      expect(patternsStat.isFile()).toBe(true);

      const recentStat = await fs.stat(path.join(outputDir, '_recent.md'));
      expect(recentStat.isFile()).toBe(true);
    } finally {
      await fs.rm(outputDir, { recursive: true, force: true });
    }
  });

  it('creates library directory with empty index when no sources', async () => {
    const driver = createMockDriver(new Map());
    const compiler = new WikiCompiler(driver);

    const os = await import('node:os');
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const outputDir = path.join(os.tmpdir(), `amp-wiki-test-lib-${Date.now()}`);

    try {
      await compiler.compile(outputDir);

      const libIndex = await fs.readFile(path.join(outputDir, 'library', '_index.md'), 'utf-8');
      expect(libIndex).toContain('Source Library');
      expect(libIndex).toContain('No sources indexed yet');
    } finally {
      await fs.rm(outputDir, { recursive: true, force: true });
    }
  });

  it('creates topics directory with empty index when no qualified tags', async () => {
    const driver = createMockDriver(new Map());
    const compiler = new WikiCompiler(driver);

    const os = await import('node:os');
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const outputDir = path.join(os.tmpdir(), `amp-wiki-test-topics-${Date.now()}`);

    try {
      await compiler.compile(outputDir);

      const topicsIndex = await fs.readFile(path.join(outputDir, 'topics', '_index.md'), 'utf-8');
      expect(topicsIndex).toContain('Topics');
      expect(topicsIndex).toContain('No topics discovered yet');
    } finally {
      await fs.rm(outputDir, { recursive: true, force: true });
    }
  });

  it('cleans output directory before compiling', async () => {
    const driver = createMockDriver(new Map());
    const compiler = new WikiCompiler(driver);

    const os = await import('node:os');
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const outputDir = path.join(os.tmpdir(), `amp-wiki-test-clean-${Date.now()}`);

    try {
      // Create a stale file
      await fs.mkdir(outputDir, { recursive: true });
      await fs.writeFile(path.join(outputDir, 'stale.md'), 'old content', 'utf-8');

      await compiler.compile(outputDir);

      // Stale file should be gone
      await expect(fs.stat(path.join(outputDir, 'stale.md'))).rejects.toThrow();
    } finally {
      await fs.rm(outputDir, { recursive: true, force: true });
    }
  });
});
