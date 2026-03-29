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
});
