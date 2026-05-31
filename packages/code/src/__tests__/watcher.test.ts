// packages/code/src/__tests__/watcher.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CodeWatcher, extractFilePaths } from '../watcher.js';
import type { IFileIndexer, ISymbolDeleter } from '../watcher.js';

// ─── extractFilePaths ───────────────────────────────────────────────────────

describe('extractFilePaths', () => {
  it('extracts paths from prose content', () => {
    const content = 'Modified packages/core/src/service.ts and packages/redis/src/cache.ts for the new feature';
    const paths = extractFilePaths(content);
    expect(paths).toContain('packages/core/src/service.ts');
    expect(paths).toContain('packages/redis/src/cache.ts');
  });

  it('extracts paths with various extensions', () => {
    const content = 'Updated src/index.ts, lib/utils.py, and cmd/server.go';
    const paths = extractFilePaths(content);
    expect(paths).toContain('src/index.ts');
    expect(paths).toContain('lib/utils.py');
    expect(paths).toContain('cmd/server.go');
  });

  it('extracts paths in quotes', () => {
    const content = 'File "packages/code/src/watcher.ts" was created';
    const paths = extractFilePaths(content);
    expect(paths).toContain('packages/code/src/watcher.ts');
  });

  it('deduplicates paths', () => {
    const content = 'Changed src/main.rs and then changed src/main.rs again';
    const paths = extractFilePaths(content);
    expect(paths).toHaveLength(1);
    expect(paths).toContain('src/main.rs');
  });

  it('returns empty for content without file paths', () => {
    const content = 'Decided to use event sourcing for the order pipeline.';
    const paths = extractFilePaths(content);
    expect(paths).toHaveLength(0);
  });

  it('does not match bare filenames without directory separators', () => {
    const content = 'The file index.ts was updated';
    const paths = extractFilePaths(content);
    expect(paths).toHaveLength(0);
  });

  it('extracts paths with @ in scoped package names', () => {
    const content = 'Refactored @amp/core/src/service.ts';
    const paths = extractFilePaths(content);
    expect(paths).toContain('@amp/core/src/service.ts');
  });

  it('handles tsx and jsx extensions', () => {
    const content = 'Updated components/App.tsx and views/Home.jsx';
    const paths = extractFilePaths(content);
    expect(paths).toContain('components/App.tsx');
    expect(paths).toContain('views/Home.jsx');
  });
});

// ─── CodeWatcher ────────────────────────────────────────────────────────────

describe('CodeWatcher', () => {
  let mockIndexer: IFileIndexer;
  let mockDeleter: ISymbolDeleter;
  let watcher: CodeWatcher;

  beforeEach(() => {
    mockIndexer = {
      indexFile: vi.fn().mockResolvedValue({ symbols_created: 1, symbols_updated: 0, relations_created: 0 }),
    };
    mockDeleter = {
      deleteByFile: vi.fn().mockResolvedValue(3),
    };
  });

  afterEach(() => {
    if (watcher) watcher.stopAll();
  });

  it('creates with default options', () => {
    watcher = new CodeWatcher(mockIndexer, mockDeleter);
    expect(watcher.getWatchedPaths()).toEqual([]);
    expect(watcher.getPendingCount()).toBe(0);
  });

  it('creates with custom options', () => {
    watcher = new CodeWatcher(mockIndexer, mockDeleter, {
      debounceMs: 100,
      extensions: ['.ts'],
      excludePatterns: ['dist'],
      skipTests: false,
    });
    expect(watcher.getWatchedPaths()).toEqual([]);
  });

  it('stopAll clears timers', () => {
    watcher = new CodeWatcher(mockIndexer, mockDeleter, { debounceMs: 100 });
    // Queue a re-index (via the public API)
    watcher.queueReindex('/tmp/test/src/foo.ts');
    expect(watcher.getPendingCount()).toBe(1);

    watcher.stopAll();
    expect(watcher.getPendingCount()).toBe(0);
  });

  it('queueReindex ignores unsupported extensions', () => {
    watcher = new CodeWatcher(mockIndexer, mockDeleter, { debounceMs: 100 });
    watcher.queueReindex('/tmp/test/README.md');
    expect(watcher.getPendingCount()).toBe(0);
  });

  it('queueReindex accepts supported extensions', () => {
    watcher = new CodeWatcher(mockIndexer, mockDeleter, { debounceMs: 100 });
    watcher.queueReindex('/tmp/test/src/service.ts');
    expect(watcher.getPendingCount()).toBe(1);
  });

  it('queueReindex ignores excluded directories like watcher file events', () => {
    watcher = new CodeWatcher(mockIndexer, mockDeleter, { debounceMs: 100 });

    watcher.queueReindex('/tmp/test/node_modules/pkg/index.ts');
    watcher.queueReindex('/tmp/test/dist/bundle.js');

    expect(watcher.getPendingCount()).toBe(0);
  });

  it('queueReindex ignores test files by default like watcher file events', () => {
    watcher = new CodeWatcher(mockIndexer, mockDeleter, { debounceMs: 100 });

    watcher.queueReindex('/tmp/test/src/service.test.ts');
    watcher.queueReindex('/tmp/test/src/__tests__/service.ts');

    expect(watcher.getPendingCount()).toBe(0);
  });

  it('queueReindex accepts test files when skipTests is disabled', () => {
    watcher = new CodeWatcher(mockIndexer, mockDeleter, { debounceMs: 100, skipTests: false });

    watcher.queueReindex('/tmp/test/src/service.test.ts');

    expect(watcher.getPendingCount()).toBe(1);
  });

  it('multiple rapid queueReindex calls for same file only produce one pending', () => {
    watcher = new CodeWatcher(mockIndexer, mockDeleter, { debounceMs: 500 });
    watcher.queueReindex('/tmp/test/src/service.ts');
    watcher.queueReindex('/tmp/test/src/service.ts');
    watcher.queueReindex('/tmp/test/src/service.ts');
    expect(watcher.getPendingCount()).toBe(1);
  });

  it('different files create separate pending entries', () => {
    watcher = new CodeWatcher(mockIndexer, mockDeleter, { debounceMs: 500 });
    watcher.queueReindex('/tmp/test/src/a.ts');
    watcher.queueReindex('/tmp/test/src/b.ts');
    watcher.queueReindex('/tmp/test/src/c.py');
    expect(watcher.getPendingCount()).toBe(3);
  });

  it('debounce fires after delay and calls indexer', async () => {
    watcher = new CodeWatcher(mockIndexer, mockDeleter, { debounceMs: 50 });

    // Create a real file so the stat check passes
    const { writeFileSync, mkdirSync, rmSync } = await import('fs');
    const tmpDir = '/tmp/amp-watcher-test-' + Date.now();
    mkdirSync(tmpDir + '/src', { recursive: true });
    const testFile = tmpDir + '/src/test.ts';
    writeFileSync(testFile, 'export const x = 1;');

    try {
      watcher.queueReindex(testFile);
      expect(watcher.getPendingCount()).toBe(1);

      // Wait for debounce to fire
      await new Promise((r) => setTimeout(r, 100));

      expect(watcher.getPendingCount()).toBe(0);
      expect(mockIndexer.indexFile).toHaveBeenCalledWith(
        expect.stringContaining('test.ts'),
        'typescript',
      );
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('handles deletion by calling symbolDeleter when file does not exist', async () => {
    watcher = new CodeWatcher(mockIndexer, mockDeleter, { debounceMs: 50 });

    // Queue a re-index for a file that does not exist
    watcher.queueReindex('/tmp/nonexistent-file-abc123.ts');

    // Wait for debounce to fire
    await new Promise((r) => setTimeout(r, 100));

    expect(mockDeleter.deleteByFile).toHaveBeenCalledWith(
      expect.stringContaining('nonexistent-file-abc123.ts'),
    );
    expect(mockIndexer.indexFile).not.toHaveBeenCalled();
  });
});
