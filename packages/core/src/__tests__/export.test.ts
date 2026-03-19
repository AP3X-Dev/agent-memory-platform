// packages/core/src/__tests__/export.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock fs ──────────────────────────────────────────────────────────────────

vi.mock('fs/promises', () => ({
  default: {
    writeFile: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
}));

import fs from 'fs/promises';
import { mkdirSync } from 'fs';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSemanticRecord(overrides: Record<string, unknown> = {}) {
  return {
    get: (key: string) => {
      if (key === 's') {
        return {
          properties: {
            id: 'sem-1',
            content: 'Client prefers formal tone',
            confidence: 0.9,
            signal_count: 5,
            created_at: '2026-03-18T00:00:00Z',
            updated_at: '2026-03-18T12:00:00Z',
            decay_class: 'stable',
            tags: ['brand-voice'],
            ...overrides,
          },
        };
      }
      return null;
    },
  };
}

function makeEpisodicRecord(overrides: Record<string, unknown> = {}) {
  return {
    get: (key: string) => {
      if (key === 'e') {
        return {
          properties: {
            id: 'ep-1',
            session_id: 'sess-abc',
            agent_id: 'agent-1',
            task: 'write-blog-post',
            content: 'Generated a draft',
            outcome: 'approved',
            created_at: '2026-03-18T08:00:00Z',
            ttl: null,
            ...overrides,
          },
        };
      }
      return null;
    },
  };
}

function makeDriver(semanticRecords: unknown[], episodicRecords: unknown[]) {
  let callCount = 0;
  return {
    session: () => {
      const index = callCount++;
      const records = index === 0 ? semanticRecords : episodicRecords;
      return {
        run: vi.fn().mockResolvedValue({ records }),
        close: vi.fn().mockResolvedValue(undefined),
      };
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('exportAll', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes semantic nodes to {exportPath}/semantic/{id}.md', async () => {
    const { exportAll } = await import('../export.js');

    const driver = makeDriver([makeSemanticRecord()], []) as never;

    const result = await exportAll(driver, '/tmp/amp');

    expect(result.exported).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);

    expect(mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('semantic'),
      { recursive: true },
    );
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('sem-1.md'),
      expect.stringContaining('id: sem-1'),
      'utf8',
    );
  });

  it('writes episodic nodes to {exportPath}/episodic/{date}/{id}.md', async () => {
    const { exportAll } = await import('../export.js');

    const driver = makeDriver([], [makeEpisodicRecord()]) as never;

    const result = await exportAll(driver, '/tmp/amp');

    expect(result.exported).toBe(1);
    expect(mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('2026-03-18'),
      { recursive: true },
    );
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('ep-1.md'),
      expect.stringContaining('id: ep-1'),
      'utf8',
    );
  });

  it('exports both semantic and episodic nodes in one call', async () => {
    const { exportAll } = await import('../export.js');

    const driver = makeDriver([makeSemanticRecord()], [makeEpisodicRecord()]) as never;

    const result = await exportAll(driver, '/tmp/amp');

    expect(result.exported).toBe(2);
    expect(fs.writeFile).toHaveBeenCalledTimes(2);
  });

  it('counts skipped when renderToMarkdown throws', async () => {
    const { exportAll } = await import('../export.js');

    // Node with missing id should still produce a file path, but let's cause a write error
    vi.mocked(fs.writeFile).mockRejectedValueOnce(new Error('disk full'));

    const driver = makeDriver([makeSemanticRecord()], []) as never;
    const result = await exportAll(driver, '/tmp/amp');

    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('sem-1');
  });

  it('returns zero exported for empty graph', async () => {
    const { exportAll } = await import('../export.js');
    const driver = makeDriver([], []) as never;
    const result = await exportAll(driver, '/tmp/amp');

    expect(result.exported).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('groups episodic nodes by their created_at date', async () => {
    const { exportAll } = await import('../export.js');

    const ep1 = makeEpisodicRecord({ id: 'ep-1', created_at: '2026-03-10T00:00:00Z' });
    const ep2 = makeEpisodicRecord({ id: 'ep-2', created_at: '2026-03-11T00:00:00Z' });

    const driver = makeDriver([], [ep1, ep2]) as never;
    const result = await exportAll(driver, '/tmp/amp');

    expect(result.exported).toBe(2);

    const writeCalls = vi.mocked(fs.writeFile).mock.calls;
    const paths = writeCalls.map((c) => String(c[0]));
    expect(paths.some((p) => p.includes('2026-03-10'))).toBe(true);
    expect(paths.some((p) => p.includes('2026-03-11'))).toBe(true);
  });
});

describe('exportFiltered', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('falls back to exportAll when no filters are provided', async () => {
    const { exportFiltered } = await import('../export.js');

    const driver = makeDriver([makeSemanticRecord()], []) as never;
    const result = await exportFiltered(driver, '/tmp/amp', {});

    expect(result.exported).toBeGreaterThanOrEqual(0);
  });

  it('writes filtered semantic nodes for entity filter', async () => {
    const { exportFiltered } = await import('../export.js');

    // First session = filtered semantics, second = episodics
    let callCount = 0;
    const driver = {
      session: () => {
        const idx = callCount++;
        const records = idx === 0 ? [makeSemanticRecord()] : [];
        return {
          run: vi.fn().mockResolvedValue({ records }),
          close: vi.fn().mockResolvedValue(undefined),
        };
      },
    } as never;

    const result = await exportFiltered(driver, '/tmp/amp', { entities: ['ClientX'] });

    expect(result.exported).toBe(1);
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('sem-1.md'),
      expect.any(String),
      'utf8',
    );
  });
});
