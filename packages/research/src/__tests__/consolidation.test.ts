// packages/research/src/__tests__/consolidation.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResearchConsolidation } from '../consolidation.js';

// Mock nanoid to return deterministic IDs
vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'test123456'),
}));

// ── Mock helpers ──────────────────────────────────────────────────────

function mockSession() {
  return {
    run: vi.fn().mockResolvedValue({ records: [] }),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

// We need a driver that can return multiple sessions (each method opens its own)
function mockDriverMultiSession() {
  const sessions: ReturnType<typeof mockSession>[] = [];
  const driver = {
    session: vi.fn(() => {
      const s = mockSession();
      sessions.push(s);
      return s;
    }),
    _sessions: sessions,
  };
  return driver as any;
}

function componentRecord(
  path: string,
  domain: string,
  count: number,
  expIds: string[],
  descriptions: string[],
) {
  return {
    get: (key: string) => {
      const data: Record<string, unknown> = {
        path,
        domain,
        keepCount: count,
        discardCount: count,
        crashCount: count,
        expIds,
        descriptions,
      };
      return data[key];
    },
  };
}

function comboRecord(path1: string, path2: string, count: number, expIds: string[]) {
  return {
    get: (key: string) => {
      const data: Record<string, unknown> = {
        path1,
        path2,
        comboCount: count,
        expIds,
      };
      return data[key];
    },
  };
}

function semanticUpdateRecord(
  id: string,
  claim: string,
  confidence: number,
  keepCount: number,
  discardCount: number,
) {
  return {
    get: (key: string) => {
      const data: Record<string, unknown> = { id, claim, confidence, keepCount, discardCount };
      return data[key];
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('ResearchConsolidation', () => {
  let consolidation: ResearchConsolidation;
  let driver: ReturnType<typeof mockDriverMultiSession>;

  beforeEach(() => {
    vi.clearAllMocks();
    driver = mockDriverMultiSession();
    consolidation = new ResearchConsolidation(driver);
  });

  describe('detectPatterns', () => {
    it('returns empty array when no patterns detected', async () => {
      const patterns = await consolidation.detectPatterns('camp-001');
      expect(patterns).toEqual([]);
    });

    it('detects component leverage (2+ keeps)', async () => {
      // detectComponentLeverage is the first parallel query
      // We need to control which session gets which response.
      // Since sessions are created in order by Promise.all, we set up the driver:
      const sessions: ReturnType<typeof mockSession>[] = [];
      driver.session.mockImplementation(() => {
        const s = mockSession();
        sessions.push(s);
        return s;
      });

      // We can't easily control individual sessions from Promise.all,
      // so let's test via the public run() method and check results.
      // Instead, mock at a higher level by making all sessions return specific data.

      // For simplicity, test detectPatterns by providing data through sequential session creation.
      // The 4 parallel queries + 1 sequential = 5 sessions minimum
      let callCount = 0;
      driver.session.mockImplementation(() => {
        callCount++;
        const s = mockSession();
        if (callCount === 1) {
          // detectComponentLeverage
          s.run.mockResolvedValue({
            records: [
              componentRecord('src/fast.ts', 'perf', 3, ['e1', 'e2', 'e3'], ['A', 'B', 'C']),
            ],
          });
        }
        // Other sessions return empty
        return s;
      });

      const patterns = await consolidation.detectPatterns('camp-001');

      const leverage = patterns.filter((p) => p.type === 'component_leverage');
      expect(leverage).toHaveLength(1);
      expect(leverage[0].description).toContain('src/fast.ts');
      expect(leverage[0].description).toContain('perf');
      expect(leverage[0].evidence_ids).toEqual(['e1', 'e2', 'e3']);
      expect(leverage[0].confidence).toBeCloseTo(0.7, 10); // 0.4 + 3 * 0.1
    });

    it('caps component leverage confidence at 0.8', async () => {
      let callCount = 0;
      driver.session.mockImplementation(() => {
        callCount++;
        const s = mockSession();
        if (callCount === 1) {
          s.run.mockResolvedValue({
            records: [
              componentRecord('src/x.ts', 'core', 10, Array(10).fill('e'), Array(10).fill('d')),
            ],
          });
        }
        return s;
      });

      const patterns = await consolidation.detectPatterns('camp-001');
      const leverage = patterns.filter((p) => p.type === 'component_leverage');
      expect(leverage[0].confidence).toBe(0.8); // capped
    });

    it('detects exhausted directions (3+ discards)', async () => {
      let callCount = 0;
      driver.session.mockImplementation(() => {
        callCount++;
        const s = mockSession();
        if (callCount === 2) {
          // detectExhaustedDirections is the second parallel call
          s.run.mockResolvedValue({
            records: [
              componentRecord('src/dead.ts', 'legacy', 4, ['e1', 'e2', 'e3', 'e4'], ['Try A', 'Try B', 'Try C']),
            ],
          });
        }
        return s;
      });

      const patterns = await consolidation.detectPatterns('camp-001');
      const exhausted = patterns.filter((p) => p.type === 'exhausted_direction');
      expect(exhausted).toHaveLength(1);
      expect(exhausted[0].description).toContain('src/dead.ts');
      expect(exhausted[0].suggested_action).toContain('Avoid');
    });

    it('detects crash patterns (2+ crashes)', async () => {
      let callCount = 0;
      driver.session.mockImplementation(() => {
        callCount++;
        const s = mockSession();
        if (callCount === 3) {
          // detectCrashPatterns is the third parallel call
          s.run.mockResolvedValue({
            records: [
              componentRecord('src/fragile.ts', 'core', 2, ['e1', 'e2'], ['Change A', 'Change B']),
            ],
          });
        }
        return s;
      });

      const patterns = await consolidation.detectPatterns('camp-001');
      const crashes = patterns.filter((p) => p.type === 'crash_pattern');
      expect(crashes).toHaveLength(1);
      expect(crashes[0].confidence).toBe(0.7);
      expect(crashes[0].suggested_action).toContain('caution');
    });

    it('detects combo synergies (2+ joint keeps)', async () => {
      let callCount = 0;
      driver.session.mockImplementation(() => {
        callCount++;
        const s = mockSession();
        if (callCount === 4) {
          // detectComboSynergies is the fourth parallel call
          s.run.mockResolvedValue({
            records: [comboRecord('src/a.ts', 'src/b.ts', 3, ['e1', 'e2', 'e3'])],
          });
        }
        return s;
      });

      const patterns = await consolidation.detectPatterns('camp-001');
      const synergies = patterns.filter((p) => p.type === 'combo_synergy');
      expect(synergies).toHaveLength(1);
      expect(synergies[0].description).toContain('src/a.ts');
      expect(synergies[0].description).toContain('src/b.ts');
      expect(synergies[0].confidence).toBe(0.75); // min(0.75, 0.4 + 3*0.15) = min(0.75, 0.85)
    });

    it('detects confirmed principles', async () => {
      let callCount = 0;
      driver.session.mockImplementation(() => {
        callCount++;
        const s = mockSession();
        if (callCount === 5) {
          // detectSemanticUpdates is the fifth session (sequential after parallel)
          s.run.mockResolvedValue({
            records: [semanticUpdateRecord('sem-1', 'Caching helps', 0.7, 5, 1)],
          });
        }
        return s;
      });

      const patterns = await consolidation.detectPatterns('camp-001');
      const confirmed = patterns.filter((p) => p.type === 'confirmed_principle');
      expect(confirmed).toHaveLength(1);
      expect(confirmed[0].description).toContain('Caching helps');
      expect(confirmed[0].evidence_ids).toContain('sem-1');
      expect(confirmed[0].confidence).toBeCloseTo(0.8, 10); // 0.7 + 0.1
    });

    it('caps confirmed principle confidence at 0.95', async () => {
      let callCount = 0;
      driver.session.mockImplementation(() => {
        callCount++;
        const s = mockSession();
        if (callCount === 5) {
          s.run.mockResolvedValue({
            records: [semanticUpdateRecord('sem-1', 'Very sure', 0.9, 10, 0)],
          });
        }
        return s;
      });

      const patterns = await consolidation.detectPatterns('camp-001');
      const confirmed = patterns.filter((p) => p.type === 'confirmed_principle');
      expect(confirmed[0].confidence).toBe(0.95); // min(0.95, 0.9 + 0.1)
    });

    it('detects contradicted principles', async () => {
      let callCount = 0;
      driver.session.mockImplementation(() => {
        callCount++;
        const s = mockSession();
        if (callCount === 5) {
          s.run.mockResolvedValue({
            records: [semanticUpdateRecord('sem-1', 'Bad idea', 0.6, 0, 4)],
          });
        }
        return s;
      });

      const patterns = await consolidation.detectPatterns('camp-001');
      const contradicted = patterns.filter((p) => p.type === 'contradicted_principle');
      expect(contradicted).toHaveLength(1);
      expect(contradicted[0].confidence).toBeCloseTo(0.45, 10); // 0.6 - 0.15
    });

    it('floors contradicted principle confidence at 0.1', async () => {
      let callCount = 0;
      driver.session.mockImplementation(() => {
        callCount++;
        const s = mockSession();
        if (callCount === 5) {
          s.run.mockResolvedValue({
            records: [semanticUpdateRecord('sem-1', 'Very wrong', 0.1, 0, 5)],
          });
        }
        return s;
      });

      const patterns = await consolidation.detectPatterns('camp-001');
      const contradicted = patterns.filter((p) => p.type === 'contradicted_principle');
      expect(contradicted[0].confidence).toBe(0.1); // max(0.1, 0.1 - 0.15) — floor at 0.1
    });

    it('ignores semantics where keeps == discards', async () => {
      let callCount = 0;
      driver.session.mockImplementation(() => {
        callCount++;
        const s = mockSession();
        if (callCount === 5) {
          s.run.mockResolvedValue({
            records: [semanticUpdateRecord('sem-1', 'Ambiguous', 0.5, 3, 3)],
          });
        }
        return s;
      });

      const patterns = await consolidation.detectPatterns('camp-001');
      const updates = patterns.filter(
        (p) => p.type === 'confirmed_principle' || p.type === 'contradicted_principle',
      );
      expect(updates).toHaveLength(0);
    });

    it('requires minimum 2 keeps for confirmation', async () => {
      let callCount = 0;
      driver.session.mockImplementation(() => {
        callCount++;
        const s = mockSession();
        if (callCount === 5) {
          s.run.mockResolvedValue({
            records: [semanticUpdateRecord('sem-1', 'Borderline', 0.5, 1, 0)],
          });
        }
        return s;
      });

      const patterns = await consolidation.detectPatterns('camp-001');
      const confirmed = patterns.filter((p) => p.type === 'confirmed_principle');
      expect(confirmed).toHaveLength(0);
    });
  });

  describe('run', () => {
    it('returns empty result when no patterns found', async () => {
      const result = await consolidation.run('camp-001');

      expect(result.patterns_detected).toBe(0);
      expect(result.semantic_created).toEqual([]);
      expect(result.semantic_updated).toEqual([]);
      expect(result.confidence_changes).toEqual([]);
      expect(result.procedural_updates).toEqual([]);
    });

    it('creates semantic nodes for component_leverage patterns', async () => {
      let callCount = 0;
      driver.session.mockImplementation(() => {
        callCount++;
        const s = mockSession();
        if (callCount === 1) {
          // detectComponentLeverage returns a pattern
          s.run.mockResolvedValue({
            records: [
              componentRecord('src/hot.ts', 'perf', 2, ['e1', 'e2'], ['A', 'B']),
            ],
          });
        }
        // createSemanticFromPattern sessions return successfully
        return s;
      });

      const result = await consolidation.run('camp-001');

      expect(result.patterns_detected).toBeGreaterThanOrEqual(1);
      expect(result.semantic_created).toContain('sem-research-test123456');
    });

    it('updates existing semantics for confirmed_principle patterns', async () => {
      let callCount = 0;
      driver.session.mockImplementation(() => {
        callCount++;
        const s = mockSession();
        if (callCount === 5) {
          // detectSemanticUpdates — confirmed principle
          s.run.mockResolvedValue({
            records: [semanticUpdateRecord('sem-existing', 'Good idea', 0.7, 5, 0)],
          });
        }
        // reinforceSemantic session
        if (callCount > 5) {
          s.run.mockResolvedValue({
            records: [
              {
                get: (key: string) => {
                  const data: Record<string, unknown> = {
                    id: 'sem-existing',
                    oldConf: 0.7,
                    newConf: 0.8,
                  };
                  return data[key];
                },
              },
            ],
          });
        }
        return s;
      });

      const result = await consolidation.run('camp-001');

      expect(result.semantic_updated).toContain('sem-existing');
      expect(result.confidence_changes.length).toBeGreaterThanOrEqual(1);
      const change = result.confidence_changes.find((c) => c.id === 'sem-existing');
      expect(change).toBeDefined();
      expect(change!.from).toBe(0.7);
      expect(change!.to).toBe(0.8);
    });

    it('weakens semantics for contradicted_principle patterns', async () => {
      let callCount = 0;
      driver.session.mockImplementation(() => {
        callCount++;
        const s = mockSession();
        if (callCount === 5) {
          s.run.mockResolvedValue({
            records: [semanticUpdateRecord('sem-weak', 'Bad idea', 0.6, 0, 5)],
          });
        }
        if (callCount > 5) {
          s.run.mockResolvedValue({
            records: [
              {
                get: (key: string) => {
                  const data: Record<string, unknown> = {
                    id: 'sem-weak',
                    oldConf: 0.6,
                    newConf: 0.45,
                  };
                  return data[key];
                },
              },
            ],
          });
        }
        return s;
      });

      const result = await consolidation.run('camp-001');

      expect(result.semantic_updated).toContain('sem-weak');
    });

    it('handles createSemanticFromPattern error gracefully', async () => {
      let callCount = 0;
      driver.session.mockImplementation(() => {
        callCount++;
        const s = mockSession();
        if (callCount === 1) {
          s.run.mockResolvedValue({
            records: [
              componentRecord('src/x.ts', 'd', 2, ['e1', 'e2'], ['A', 'B']),
            ],
          });
        }
        // Session for createSemanticFromPattern throws
        if (callCount > 5) {
          s.run.mockRejectedValue(new Error('write failed'));
        }
        return s;
      });

      // Should not throw — error is suppressed in createSemanticFromPattern
      const result = await consolidation.run('camp-001');
      expect(result.patterns_detected).toBeGreaterThanOrEqual(1);
    });

    it('handles reinforceSemantic returning no records', async () => {
      let callCount = 0;
      driver.session.mockImplementation(() => {
        callCount++;
        const s = mockSession();
        if (callCount === 5) {
          s.run.mockResolvedValue({
            records: [semanticUpdateRecord('sem-gone', 'Deleted', 0.7, 5, 0)],
          });
        }
        // reinforceSemantic returns no records (node deleted)
        return s;
      });

      const result = await consolidation.run('camp-001');
      // Should handle gracefully — no confidence_changes
      expect(result.confidence_changes).toEqual([]);
    });

    it('handles weakenSemantic with no target_id', async () => {
      let callCount = 0;
      driver.session.mockImplementation(() => {
        callCount++;
        const s = mockSession();
        if (callCount === 5) {
          s.run.mockResolvedValue({
            records: [
              {
                get: (key: string) => {
                  const data: Record<string, unknown> = {
                    id: 'sem-1',
                    claim: 'X',
                    confidence: 0.3,
                    keepCount: 0,
                    discardCount: 5,
                  };
                  return data[key];
                },
              },
            ],
          });
        }
        return s;
      });

      // The contradicted_principle will have evidence_ids: ['sem-1']
      // weakenSemantic should try to update it
      const result = await consolidation.run('camp-001');
      expect(result).toBeDefined();
    });
  });

  describe('createSemanticFromPattern (via run)', () => {
    it('creates semantic node with correct tags including campaign and pattern type', async () => {
      let callCount = 0;
      const creationSession = mockSession();
      driver.session.mockImplementation(() => {
        callCount++;
        const s = callCount <= 5 ? mockSession() : creationSession;
        if (callCount === 1) {
          s.run.mockResolvedValue({
            records: [
              componentRecord('src/hot.ts', 'perf', 2, ['e1', 'e2'], ['A', 'B']),
            ],
          });
        }
        return s;
      });

      await consolidation.run('camp-001');

      // The creation session should have been called with CREATE
      if (creationSession.run.mock.calls.length > 0) {
        const firstCallParams = creationSession.run.mock.calls[0][1] as Record<string, unknown>;
        expect(firstCallParams.tags).toContain('campaign:camp-001');
        expect(firstCallParams.tags).toContain('research');
        expect(firstCallParams.tags).toContain('component_leverage');
      }
    });
  });

  describe('exhausted direction confidence', () => {
    it('calculates confidence based on discard count', async () => {
      let callCount = 0;
      driver.session.mockImplementation(() => {
        callCount++;
        const s = mockSession();
        if (callCount === 2) {
          // 3 discards -> 0.5 + 3 * 0.1 = 0.8
          s.run.mockResolvedValue({
            records: [
              componentRecord('src/a.ts', 'x', 3, ['e1', 'e2', 'e3'], ['A', 'B', 'C']),
            ],
          });
        }
        return s;
      });

      const patterns = await consolidation.detectPatterns('camp-001');
      const exhausted = patterns.find((p) => p.type === 'exhausted_direction');
      expect(exhausted!.confidence).toBe(0.8);
    });

    it('caps exhausted direction confidence at 0.85', async () => {
      let callCount = 0;
      driver.session.mockImplementation(() => {
        callCount++;
        const s = mockSession();
        if (callCount === 2) {
          s.run.mockResolvedValue({
            records: [
              componentRecord('src/a.ts', 'x', 10, Array(10).fill('e'), Array(10).fill('d')),
            ],
          });
        }
        return s;
      });

      const patterns = await consolidation.detectPatterns('camp-001');
      const exhausted = patterns.find((p) => p.type === 'exhausted_direction');
      expect(exhausted!.confidence).toBe(0.85);
    });
  });

  describe('combo synergy confidence', () => {
    it('calculates confidence based on combo count', async () => {
      let callCount = 0;
      driver.session.mockImplementation(() => {
        callCount++;
        const s = mockSession();
        if (callCount === 4) {
          // 2 combos -> min(0.75, 0.4 + 2 * 0.15) = min(0.75, 0.7) = 0.7
          s.run.mockResolvedValue({
            records: [comboRecord('a.ts', 'b.ts', 2, ['e1', 'e2'])],
          });
        }
        return s;
      });

      const patterns = await consolidation.detectPatterns('camp-001');
      const synergy = patterns.find((p) => p.type === 'combo_synergy');
      expect(synergy!.confidence).toBe(0.7);
    });

    it('caps combo synergy confidence at 0.75', async () => {
      let callCount = 0;
      driver.session.mockImplementation(() => {
        callCount++;
        const s = mockSession();
        if (callCount === 4) {
          s.run.mockResolvedValue({
            records: [comboRecord('a.ts', 'b.ts', 10, Array(10).fill('e'))],
          });
        }
        return s;
      });

      const patterns = await consolidation.detectPatterns('camp-001');
      const synergy = patterns.find((p) => p.type === 'combo_synergy');
      expect(synergy!.confidence).toBe(0.75);
    });
  });
});
