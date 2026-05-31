// packages/arch/src/__tests__/drift.regression.test.ts
import { describe, it, expect, vi } from 'vitest';
import { DriftDetector } from '../drift.js';

describe('DriftDetector regression', () => {
  it('BUG-0044: checkFreshness rejects path traversal attempts from Neo4j data', async () => {
    // Before the fix, file paths from Neo4j (e.file_paths) were passed directly
    // to stat() and readFile() with no validation. An attacker with Neo4j write
    // access could set file_paths to ../../etc/passwd to read arbitrary files.
    // The fix adds validateFilePath that rejects paths escaping baseDir.

    const mockSession = {
      run: vi.fn().mockResolvedValue({
        records: [{
          get: (key: string) => {
            if (key === 'paths') return ['../../etc/passwd'];
            if (key === 'hashes') return '{}';
            if (key === 'lastIndexed') return null;
            return null;
          },
        }],
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const mockDriver = {
      session: vi.fn().mockReturnValue(mockSession),
    };

    const detector = new DriftDetector(mockDriver as never, '/app/project');

    await expect(detector.checkFreshness('malicious-entity')).rejects.toThrow(
      'Path traversal detected',
    );
  });

  it('scopes single-entity freshness checks to the requested project containment tree', async () => {
    const runs: Array<{ query: string; params?: Record<string, unknown> }> = [];
    const mockSession = {
      run: vi.fn().mockImplementation(async (query: string, params?: Record<string, unknown>) => {
        runs.push({ query, params });
        return { records: [] };
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const mockDriver = {
      session: vi.fn().mockReturnValue(mockSession),
    };
    const detector = new DriftDetector(mockDriver as never, '/app/project');

    await detector.checkFreshness('AuthService', 'project:AMP');

    expect(runs[0].params?.projectName).toBe('AMP');
    expect(runs[0].query).toContain('$projectName IS NULL');
    expect(runs[0].query).toContain('CONTAINS*0..');
  });

  it('checkAll marks stale by entity id, not name (no cross-project contamination)', async () => {
    const runs: Array<{ query: string; params?: Record<string, unknown> }> = [];
    const mockSession = {
      run: vi.fn().mockImplementation(async (query: string, params?: Record<string, unknown>) => {
        runs.push({ query, params });
        if (query.includes('file_paths IS NOT NULL')) {
          return {
            records: [{
              get: (key: string) => ({
                id: 'ent-123', name: 'auth',
                paths: ['does-not-exist.ts'], hashes: '{}', lastIndexed: null,
              } as Record<string, unknown>)[key],
            }],
          };
        }
        return { records: [] };
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const detector = new DriftDetector({ session: () => mockSession } as never, '/app/project');

    const results = await detector.checkAll('project:AMP');
    expect(results[0].stale).toBe(true); // missing file → stale

    const updateRun = runs.find((r) => r.query.includes('SET e.stale = true'));
    expect(updateRun?.query).toContain('e.id IN $ids');
    expect(updateRun?.query).not.toContain('e.name IN');
    expect(updateRun?.params?.ids).toEqual(['ent-123']);
  });

  it('scopes single-entity markFresh to the requested project containment tree', async () => {
    const runs: Array<{ query: string; params?: Record<string, unknown> }> = [];
    const mockSession = {
      run: vi.fn().mockImplementation(async (query: string, params?: Record<string, unknown>) => {
        runs.push({ query, params });
        return { records: [] };
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const mockDriver = {
      session: vi.fn().mockReturnValue(mockSession),
    };
    const detector = new DriftDetector(mockDriver as never, '/app/project');

    await detector.markFresh('AuthService', 'project:AMP');

    expect(runs[0].params?.projectName).toBe('AMP');
    expect(runs[0].query).toContain('$projectName IS NULL');
    expect(runs[0].query).toContain('CONTAINS*0..');
  });
});
