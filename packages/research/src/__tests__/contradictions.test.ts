// packages/research/src/__tests__/contradictions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContradictionDetector } from '../contradictions.js';

// ── Mock helpers ──────────────────────────────────────────────────────

function mockSession() {
  return {
    run: vi.fn().mockResolvedValue({ records: [] }),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function mockDriver(session: ReturnType<typeof mockSession>) {
  return { session: vi.fn(() => session) } as any;
}

function semanticRecord(id: string, content: string, confidence: number) {
  return {
    properties: { id, content, confidence },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('ContradictionDetector', () => {
  let detector: ContradictionDetector;
  let session: ReturnType<typeof mockSession>;

  describe('detect', () => {
    it('returns empty array when no contradictions found', async () => {
      session = mockSession();
      detector = new ContradictionDetector(mockDriver(session));

      const results = await detector.detect('camp-001');

      expect(results).toEqual([]);
      // Should have run 2 queries (explicit + conflicted)
      expect(session.run).toHaveBeenCalledTimes(2);
      expect(session.close).toHaveBeenCalledTimes(1);
    });

    it('detects explicit CONTRADICTS edges between semantics', async () => {
      session = mockSession();
      // First query (explicit contradicts) returns results
      session.run.mockResolvedValueOnce({
        records: [
          {
            get: (key: string) => {
              if (key === 'a') return semanticRecord('sem-1', 'X is good', 0.8);
              if (key === 'b') return semanticRecord('sem-2', 'X is bad', 0.6);
              return null;
            },
          },
        ],
      });
      // Second query (conflicted signals) returns nothing
      session.run.mockResolvedValueOnce({ records: [] });

      detector = new ContradictionDetector(mockDriver(session));

      const results = await detector.detect('camp-001');

      expect(results).toHaveLength(1);
      expect(results[0].principle_a.id).toBe('sem-1');
      expect(results[0].principle_a.claim).toBe('X is good');
      expect(results[0].principle_a.confidence).toBe(0.8);
      expect(results[0].principle_b.id).toBe('sem-2');
      expect(results[0].principle_b.claim).toBe('X is bad');
      expect(results[0].principle_b.confidence).toBe(0.6);
      expect(results[0].reason).toBe('Explicit contradiction edge');
    });

    it('detects self-contradicted semantics with both reinforcements and contradictions', async () => {
      session = mockSession();
      // First query (explicit) returns nothing
      session.run.mockResolvedValueOnce({ records: [] });
      // Second query (conflicted signals) returns a self-contradicted node
      session.run.mockResolvedValueOnce({
        records: [
          {
            get: (key: string) => {
              if (key === 's') return semanticRecord('sem-3', 'Caching helps', 0.7);
              if (key === 'reinforceCount') return 3;
              if (key === 'contradictCount') return 2;
              return null;
            },
          },
        ],
      });

      detector = new ContradictionDetector(mockDriver(session));

      const results = await detector.detect('camp-001');

      expect(results).toHaveLength(1);
      expect(results[0].principle_a.id).toBe('sem-3');
      expect(results[0].principle_a.claim).toBe('Caching helps');
      expect(results[0].principle_b.claim).toContain('[Self-contradicted]');
      expect(results[0].principle_b.claim).toContain('Caching helps');
      expect(results[0].reason).toBe('3 reinforcements vs 2 contradictions from experiments');
    });

    it('combines both patterns when both exist', async () => {
      session = mockSession();
      // First query returns explicit contradiction
      session.run.mockResolvedValueOnce({
        records: [
          {
            get: (key: string) => {
              if (key === 'a') return semanticRecord('sem-1', 'A', 0.9);
              if (key === 'b') return semanticRecord('sem-2', 'B', 0.5);
              return null;
            },
          },
        ],
      });
      // Second query returns conflicted signal
      session.run.mockResolvedValueOnce({
        records: [
          {
            get: (key: string) => {
              if (key === 's') return semanticRecord('sem-3', 'C', 0.6);
              if (key === 'reinforceCount') return 5;
              if (key === 'contradictCount') return 3;
              return null;
            },
          },
        ],
      });

      detector = new ContradictionDetector(mockDriver(session));

      const results = await detector.detect('camp-001');

      expect(results).toHaveLength(2);
      expect(results[0].reason).toBe('Explicit contradiction edge');
      expect(results[1].reason).toContain('reinforcements vs');
    });

    it('uses campaign tag for scoping queries', async () => {
      session = mockSession();
      detector = new ContradictionDetector(mockDriver(session));

      await detector.detect('my-campaign');

      // Both queries should use campaign tag
      for (let i = 0; i < 2; i++) {
        const params = session.run.mock.calls[i][1] as Record<string, unknown>;
        expect(params.campaignTag).toBe('campaign:my-campaign');
      }
    });

    it('passes campaignId to conflicted signals query', async () => {
      session = mockSession();
      detector = new ContradictionDetector(mockDriver(session));

      await detector.detect('camp-xyz');

      const params = session.run.mock.calls[1][1] as Record<string, unknown>;
      expect(params.campaignId).toBe('camp-xyz');
    });

    it('handles Neo4j integer objects in counts', async () => {
      session = mockSession();
      session.run.mockResolvedValueOnce({ records: [] });
      session.run.mockResolvedValueOnce({
        records: [
          {
            get: (key: string) => {
              if (key === 's') return semanticRecord('sem-1', 'X', 0.5);
              if (key === 'reinforceCount') return { toNumber: () => 4 };
              if (key === 'contradictCount') return { toNumber: () => 2 };
              return null;
            },
          },
        ],
      });

      detector = new ContradictionDetector(mockDriver(session));
      const results = await detector.detect('camp-001');

      expect(results).toHaveLength(1);
      expect(results[0].reason).toBe('4 reinforcements vs 2 contradictions from experiments');
    });

    it('closes session even on error', async () => {
      session = mockSession();
      session.run.mockRejectedValue(new Error('query failed'));
      detector = new ContradictionDetector(mockDriver(session));

      await expect(detector.detect('camp-001')).rejects.toThrow('query failed');
      expect(session.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('findUncertain', () => {
    it('returns uncertain semantic nodes below threshold', async () => {
      session = mockSession();
      session.run.mockResolvedValue({
        records: [
          {
            get: (key: string) => {
              const data: Record<string, unknown> = {
                id: 'sem-1',
                claim: 'Uncertain principle',
                confidence: 0.3,
                domain: 'testing',
              };
              return data[key];
            },
          },
        ],
      });
      detector = new ContradictionDetector(mockDriver(session));

      const results = await detector.findUncertain('camp-001');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('sem-1');
      expect(results[0].claim).toBe('Uncertain principle');
      expect(results[0].confidence).toBe(0.3);
      expect(results[0].domain).toBe('testing');
    });

    it('uses default maxConfidence of 0.5', async () => {
      session = mockSession();
      detector = new ContradictionDetector(mockDriver(session));

      await detector.findUncertain('camp-001');

      const params = session.run.mock.calls[0][1] as Record<string, unknown>;
      expect(params.maxConfidence).toBe(0.5);
    });

    it('accepts custom maxConfidence', async () => {
      session = mockSession();
      detector = new ContradictionDetector(mockDriver(session));

      await detector.findUncertain('camp-001', 0.3);

      const params = session.run.mock.calls[0][1] as Record<string, unknown>;
      expect(params.maxConfidence).toBe(0.3);
    });

    it('scopes query by campaign tag', async () => {
      session = mockSession();
      detector = new ContradictionDetector(mockDriver(session));

      await detector.findUncertain('my-camp');

      const params = session.run.mock.calls[0][1] as Record<string, unknown>;
      expect(params.campaignTag).toBe('campaign:my-camp');
    });

    it('returns empty array when no uncertain nodes', async () => {
      session = mockSession();
      detector = new ContradictionDetector(mockDriver(session));

      const results = await detector.findUncertain('camp-001');
      expect(results).toEqual([]);
    });

    it('queries confidence range above 0.1', async () => {
      session = mockSession();
      detector = new ContradictionDetector(mockDriver(session));

      await detector.findUncertain('camp-001');

      const query = session.run.mock.calls[0][0] as string;
      expect(query).toContain('s.confidence <= $maxConfidence');
      expect(query).toContain('s.confidence > 0.1');
    });

    it('orders results by confidence ASC', async () => {
      session = mockSession();
      detector = new ContradictionDetector(mockDriver(session));

      await detector.findUncertain('camp-001');

      const query = session.run.mock.calls[0][0] as string;
      expect(query).toContain('ORDER BY s.confidence ASC');
    });

    it('closes session on error', async () => {
      session = mockSession();
      session.run.mockRejectedValue(new Error('boom'));
      detector = new ContradictionDetector(mockDriver(session));

      await expect(detector.findUncertain('camp-001')).rejects.toThrow('boom');
      expect(session.close).toHaveBeenCalledTimes(1);
    });
  });
});
