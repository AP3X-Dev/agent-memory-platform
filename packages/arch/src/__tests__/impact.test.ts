// packages/arch/src/__tests__/impact.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImpactAnalyzer } from '../impact.js';

// ─── Mock helpers ────────────────────────────────────────────────────────────

function mockRecord(data: Record<string, unknown>) {
  return { get: (key: string) => data[key] };
}

function mockResult(records: Array<Record<string, unknown>>) {
  return { records: records.map(mockRecord) };
}

function createMockDriver() {
  const mockSession = {
    run: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const mockDriver = {
    session: vi.fn().mockReturnValue(mockSession),
  };
  return { mockDriver, mockSession };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ImpactAnalyzer', () => {
  let mockSession: ReturnType<typeof createMockDriver>['mockSession'];
  let analyzer: ImpactAnalyzer;

  beforeEach(() => {
    const mocks = createMockDriver();
    mockSession = mocks.mockSession;
    analyzer = new ImpactAnalyzer(mocks.mockDriver as never);
  });

  it('returns blast radius with direct and transitive dependents', async () => {
    // Query 1: direct dependents
    mockSession.run.mockResolvedValueOnce(
      mockResult([{ name: 'ServiceA' }, { name: 'ServiceB' }]),
    );
    // Query 2: transitive dependents
    mockSession.run.mockResolvedValueOnce(
      mockResult([{ name: 'ServiceC' }]),
    );
    // Query 3: co-aspect entities
    mockSession.run.mockResolvedValueOnce(
      mockResult([{ name: 'ServiceD' }]),
    );
    // Query 4: affected aspects
    mockSession.run.mockResolvedValueOnce(
      mockResult([{ name: 'auth', tier: 'implementation' }]),
    );

    const result = await analyzer.blastRadius('TargetEntity');

    expect(result.entity).toBe('TargetEntity');
    expect(result.direct_dependents).toEqual(['ServiceA', 'ServiceB']);
    expect(result.transitive_dependents).toEqual(['ServiceC']);
    expect(result.co_aspect_entities).toEqual(['ServiceD']);
    expect(result.affected_aspects).toEqual(['auth']);
    expect(result.total_blast_radius).toBe(4); // 2 direct + 1 transitive + 1 co-aspect
  });

  it('closes session even on error', async () => {
    mockSession.run.mockRejectedValueOnce(new Error('Neo4j down'));

    await expect(analyzer.blastRadius('broken')).rejects.toThrow('Neo4j down');
    expect(mockSession.close).toHaveBeenCalled();
  });

  it('filters transitive dependents that already appear in direct dependents', async () => {
    // Direct dependents: A, B
    mockSession.run.mockResolvedValueOnce(
      mockResult([{ name: 'A' }, { name: 'B' }]),
    );
    // Transitive: A (duplicate), C (new)
    mockSession.run.mockResolvedValueOnce(
      mockResult([{ name: 'A' }, { name: 'C' }]),
    );
    // Co-aspect: empty
    mockSession.run.mockResolvedValueOnce(mockResult([]));
    // Aspects: empty
    mockSession.run.mockResolvedValueOnce(mockResult([]));

    const result = await analyzer.blastRadius('Target');

    expect(result.direct_dependents).toEqual(['A', 'B']);
    expect(result.transitive_dependents).toEqual(['C']); // A filtered out
    expect(result.total_blast_radius).toBe(3); // 2 direct + 1 transitive
  });

  // ─── Risk classification ──────────────────────────────────────────────

  describe('change risk classification', () => {
    async function runWithBlastAndTiers(
      directCount: number,
      transitiveCount: number,
      coAspectCount: number,
      tiers: string[],
    ) {
      const directNames = Array.from({ length: directCount }, (_, i) => ({ name: `d${i}` }));
      const transitiveNames = Array.from({ length: transitiveCount }, (_, i) => ({ name: `t${i}` }));
      const coAspectNames = Array.from({ length: coAspectCount }, (_, i) => ({ name: `c${i}` }));
      const aspectRecords = tiers.map((tier, i) => ({ name: `aspect-${i}`, tier }));

      mockSession.run.mockResolvedValueOnce(mockResult(directNames));
      mockSession.run.mockResolvedValueOnce(mockResult(transitiveNames));
      mockSession.run.mockResolvedValueOnce(mockResult(coAspectNames));
      mockSession.run.mockResolvedValueOnce(mockResult(aspectRecords));

      return analyzer.blastRadius('target');
    }

    it('returns "low" risk for small blast radius with no critical tiers', async () => {
      const result = await runWithBlastAndTiers(1, 0, 1, ['implementation']);
      expect(result.change_risk).toBe('low');
      expect(result.total_blast_radius).toBe(2);
    });

    it('returns "medium" risk for blast radius > 3', async () => {
      const result = await runWithBlastAndTiers(2, 1, 1, ['implementation']);
      expect(result.change_risk).toBe('medium');
      expect(result.total_blast_radius).toBe(4);
    });

    it('returns "high" risk for blast radius > 10', async () => {
      const result = await runWithBlastAndTiers(5, 4, 2, ['implementation']);
      expect(result.change_risk).toBe('high');
      expect(result.total_blast_radius).toBe(11);
    });

    it('returns "high" risk when protocol aspect is present', async () => {
      const result = await runWithBlastAndTiers(1, 0, 0, ['protocol']);
      expect(result.change_risk).toBe('high');
    });

    it('returns "critical" risk for blast radius > 20', async () => {
      const result = await runWithBlastAndTiers(10, 8, 4, ['implementation']);
      expect(result.change_risk).toBe('critical');
      expect(result.total_blast_radius).toBe(22);
    });

    it('returns "critical" risk when schema aspect is present', async () => {
      const result = await runWithBlastAndTiers(1, 0, 0, ['schema']);
      expect(result.change_risk).toBe('critical');
    });

    it('schema tier overrides blast radius count for risk', async () => {
      // Even with blast radius = 1, schema makes it critical
      const result = await runWithBlastAndTiers(1, 0, 0, ['schema']);
      expect(result.total_blast_radius).toBe(1);
      expect(result.change_risk).toBe('critical');
    });
  });

  // ─── Temporal (asOf) parameter ─────────────────────────────────────────

  describe('temporal filtering (asOf)', () => {
    it('passes asOf parameter to session.run when provided', async () => {
      mockSession.run.mockResolvedValue(mockResult([]));

      await analyzer.blastRadius('entity', '2025-01-01T00:00:00Z');

      // All 4 calls should have been made (direct, transitive, co-aspect, aspects)
      expect(mockSession.run).toHaveBeenCalledTimes(4);
      // First call (direct dependents) should include asOf param
      const firstCallParams = mockSession.run.mock.calls[0][1];
      expect(firstCallParams).toHaveProperty('asOf', '2025-01-01T00:00:00Z');
    });

    it('omits asOf parameter when not provided', async () => {
      mockSession.run.mockResolvedValue(mockResult([]));

      await analyzer.blastRadius('entity');

      const firstCallParams = mockSession.run.mock.calls[0][1];
      expect(firstCallParams).not.toHaveProperty('asOf');
    });
  });

  it('returns empty arrays when entity has no dependents', async () => {
    mockSession.run.mockResolvedValue(mockResult([]));

    const result = await analyzer.blastRadius('isolated');

    expect(result.direct_dependents).toEqual([]);
    expect(result.transitive_dependents).toEqual([]);
    expect(result.co_aspect_entities).toEqual([]);
    expect(result.affected_aspects).toEqual([]);
    expect(result.total_blast_radius).toBe(0);
    expect(result.change_risk).toBe('low');
  });
});
