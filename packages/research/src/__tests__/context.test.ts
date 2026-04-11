// packages/research/src/__tests__/context.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CampaignNode } from '../types.js';

// ── Mock dependent modules before importing ResearchContextBuilder ───

const mockGetById = vi.fn();
const mockGetRecentKeeps = vi.fn().mockResolvedValue([]);
const mockGetDeadEnds = vi.fn().mockResolvedValue([]);
const mockGetStats = vi.fn().mockResolvedValue({
  total: 0, keeps: 0, discards: 0, crashes: 0, thoughts: 0, interesting: 0,
});
const mockDetect = vi.fn().mockResolvedValue([]);

vi.mock('../campaign.js', () => ({
  CampaignStore: vi.fn().mockImplementation(() => ({
    getById: mockGetById,
  })),
}));

vi.mock('../experiment.js', () => ({
  ExperimentStore: vi.fn().mockImplementation(() => ({
    getRecentKeeps: mockGetRecentKeeps,
    getDeadEnds: mockGetDeadEnds,
    getStats: mockGetStats,
  })),
}));

vi.mock('../contradictions.js', () => ({
  ContradictionDetector: vi.fn().mockImplementation(() => ({
    detect: mockDetect,
  })),
}));

// Import after mocks are set up
import { ResearchContextBuilder } from '../context.js';

// ── Helpers ───────────────────────────────────────────────────────────

function makeCampaign(overrides: Partial<CampaignNode> = {}): CampaignNode {
  const now = new Date().toISOString();
  return {
    id: 'camp-id-1',
    campaign_id: 'camp-001',
    name: 'perf-campaign',
    objective: 'Speed up tests',
    metric_name: 'duration_s',
    metric_direction: 'lower',
    run_command: 'npm test',
    measure_command: 'time npm test',
    scope_files: ['src/'],
    constraints: '',
    baseline_metric: 50,
    best_metric: 42,
    best_commit: 'abc',
    best_experiment_id: 'exp-3',
    total_experiments: 5,
    total_keeps: 3,
    total_discards: 2,
    consolidation_count: 1,
    last_consolidation_at: null,
    status: 'active',
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function createBuilder() {
  // The session mock is for getSemanticPrinciples (private method uses driver.session() directly)
  const mockSession = {
    run: vi.fn().mockResolvedValue({ records: [] }),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const mockDriver = { session: vi.fn(() => mockSession) } as any;
  const builder = new ResearchContextBuilder(mockDriver);
  return { builder, mockSession };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('ResearchContextBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRecentKeeps.mockResolvedValue([]);
    mockGetDeadEnds.mockResolvedValue([]);
    mockGetStats.mockResolvedValue({
      total: 0, keeps: 0, discards: 0, crashes: 0, thoughts: 0, interesting: 0,
    });
    mockDetect.mockResolvedValue([]);
  });

  describe('build', () => {
    it('throws when campaign not found', async () => {
      const { builder } = createBuilder();
      mockGetById.mockResolvedValue(null);

      await expect(builder.build('nonexistent')).rejects.toThrow('Campaign nonexistent not found');
    });

    it('assembles full research context', async () => {
      const campaign = makeCampaign();
      const { builder } = createBuilder();

      mockGetById.mockResolvedValue(campaign);
      mockGetRecentKeeps.mockResolvedValue([
        {
          id: 'exp-1',
          experiment_number: 1,
          description: 'Parallel workers',
          metric_value: 38,
          branch: 'research/test',
          insight: 'Parallelism works',
          created_at: '2026-01-01T00:00:00Z',
          // Extra fields that should be stripped
          session_id: 'sess-1',
          agent_id: 'agent-1',
        },
      ]);
      mockGetDeadEnds.mockResolvedValue([
        { component: 'src/slow.ts', domain: 'perf', discard_count: 3, last_attempt: '2026-01-01', descriptions: ['A'] },
      ]);
      mockDetect.mockResolvedValue([
        {
          principle_a: { id: 's1', claim: 'X is good', confidence: 0.8 },
          principle_b: { id: 's2', claim: 'X is bad', confidence: 0.6 },
          reason: 'Conflicting evidence',
        },
      ]);
      mockGetStats.mockResolvedValue({
        total: 10, keeps: 5, discards: 3, crashes: 1, thoughts: 1, interesting: 0,
      });

      const ctx = await builder.build('camp-001');

      expect(ctx.campaign).toBe(campaign);
      expect(ctx.recent_keeps).toHaveLength(1);
      expect(ctx.recent_keeps[0]).toEqual({
        id: 'exp-1',
        experiment_number: 1,
        description: 'Parallel workers',
        metric_value: 38,
        branch: 'research/test',
        insight: 'Parallelism works',
        created_at: '2026-01-01T00:00:00Z',
      });
      expect(ctx.dead_ends).toHaveLength(1);
      expect(ctx.contradictions).toHaveLength(1);
      expect(ctx.experiment_stats.total).toBe(10);
      expect(ctx.parking_lot).toEqual([]);
    });

    it('strips extra fields from recent_keeps', async () => {
      const { builder } = createBuilder();
      mockGetById.mockResolvedValue(makeCampaign());
      mockGetRecentKeeps.mockResolvedValue([
        {
          id: 'e1',
          experiment_number: 1,
          description: 'd',
          metric_value: 10,
          branch: 'b',
          insight: 'i',
          created_at: 'now',
          session_id: 'should-be-stripped',
          agent_id: 'should-be-stripped',
          campaign_id: 'should-be-stripped',
        },
      ]);

      const ctx = await builder.build('camp-001');
      const keep = ctx.recent_keeps[0];

      expect(keep).not.toHaveProperty('session_id');
      expect(keep).not.toHaveProperty('agent_id');
      expect(keep).not.toHaveProperty('campaign_id');
    });

    it('calls getRecentKeeps with limit 10', async () => {
      const { builder } = createBuilder();
      mockGetById.mockResolvedValue(makeCampaign());

      await builder.build('camp-001');

      expect(mockGetRecentKeeps).toHaveBeenCalledWith('camp-001', 10);
    });

    it('calls getDeadEnds with threshold 2', async () => {
      const { builder } = createBuilder();
      mockGetById.mockResolvedValue(makeCampaign());

      await builder.build('camp-001');

      expect(mockGetDeadEnds).toHaveBeenCalledWith('camp-001', 2);
    });
  });

  describe('renderMarkdown', () => {
    it('renders campaign header with objective and metric', async () => {
      const { builder } = createBuilder();
      mockGetById.mockResolvedValue(makeCampaign({
        name: 'Speed Campaign',
        objective: 'Make it fast',
        metric_name: 'latency_ms',
        metric_direction: 'lower',
        baseline_metric: 100,
        best_metric: 50,
      }));

      const md = await builder.renderMarkdown('camp-001');

      expect(md).toContain('# Research Context — Speed Campaign');
      expect(md).toContain('**Objective:** Make it fast');
      expect(md).toContain('**Metric:** latency_ms (lower is better)');
      expect(md).toContain('**Baseline:** 100');
      expect(md).toContain('**Current best:** 50');
    });

    it('shows pending when baseline/best are null', async () => {
      const { builder } = createBuilder();
      mockGetById.mockResolvedValue(makeCampaign({
        baseline_metric: null,
        best_metric: null,
      }));

      const md = await builder.renderMarkdown('camp-001');

      expect(md).toContain('**Baseline:** pending');
      expect(md).toContain('**Current best:** pending');
    });

    it('renders progress stats', async () => {
      const { builder } = createBuilder();
      mockGetById.mockResolvedValue(makeCampaign());
      mockGetStats.mockResolvedValue({
        total: 20, keeps: 10, discards: 7, crashes: 2, thoughts: 1, interesting: 0,
      });

      const md = await builder.renderMarkdown('camp-001');

      expect(md).toContain('## Progress');
      expect(md).toContain('Total: 20');
      expect(md).toContain('Keeps: 10');
      expect(md).toContain('Discards: 7');
      expect(md).toContain('Crashes: 2');
    });

    it('renders semantic principles section when present', async () => {
      const { builder, mockSession } = createBuilder();
      mockGetById.mockResolvedValue(makeCampaign());
      mockSession.run.mockResolvedValue({
        records: [
          {
            get: (key: string) => {
              const data: Record<string, unknown> = {
                id: 'sem-1',
                claim: 'Parallelism reduces test time',
                confidence: 0.85,
                domain: 'testing',
                expCount: 3,
              };
              return data[key];
            },
          },
        ],
      });

      const md = await builder.renderMarkdown('camp-001');

      expect(md).toContain('## Known Principles');
      expect(md).toContain('[0.85]');
      expect(md).toContain('Parallelism reduces test time');
      expect(md).toContain('testing');
      expect(md).toContain('3 experiments');
    });

    it('skips semantic principles section when empty', async () => {
      const { builder } = createBuilder();
      mockGetById.mockResolvedValue(makeCampaign());

      const md = await builder.renderMarkdown('camp-001');

      expect(md).not.toContain('## Known Principles');
    });

    it('renders recent keeps section', async () => {
      const { builder } = createBuilder();
      mockGetById.mockResolvedValue(makeCampaign());
      mockGetRecentKeeps.mockResolvedValue([
        {
          id: 'exp-1',
          experiment_number: 5,
          description: 'Add caching layer',
          metric_value: 35.5,
          branch: 'research/cache',
          insight: 'Cache hit rate 90%',
          created_at: '2026-01-01',
        },
      ]);

      const md = await builder.renderMarkdown('camp-001');

      expect(md).toContain('## Recent Wins');
      expect(md).toContain('#5: Add caching layer');
      expect(md).toContain('35.5');
      expect(md).toContain('Cache hit rate 90%');
    });

    it('renders dead ends section', async () => {
      const { builder } = createBuilder();
      mockGetById.mockResolvedValue(makeCampaign());
      mockGetDeadEnds.mockResolvedValue([
        { component: 'src/old.ts', domain: 'legacy', discard_count: 5, descriptions: ['Refactor attempt'] },
      ]);

      const md = await builder.renderMarkdown('camp-001');

      expect(md).toContain('## Dead Ends');
      expect(md).toContain('**src/old.ts**');
      expect(md).toContain('legacy');
      expect(md).toContain('5 discards');
    });

    it('renders contradictions section', async () => {
      const { builder } = createBuilder();
      mockGetById.mockResolvedValue(makeCampaign());
      mockDetect.mockResolvedValue([
        {
          principle_a: { id: 'a', claim: 'X helps', confidence: 0.8 },
          principle_b: { id: 'b', claim: 'X hurts', confidence: 0.6 },
          reason: 'Opposite evidence',
        },
      ]);

      const md = await builder.renderMarkdown('camp-001');

      expect(md).toContain('## Unresolved Contradictions');
      expect(md).toContain('[0.80]');
      expect(md).toContain('X helps');
      expect(md).toContain('[0.60]');
      expect(md).toContain('X hurts');
      expect(md).toContain('Opposite evidence');
    });

    it('truncates output when exceeding maxTokens', async () => {
      const { builder } = createBuilder();
      mockGetById.mockResolvedValue(makeCampaign());

      // Use a very small token budget to force truncation
      const md = await builder.renderMarkdown('camp-001', 10);

      // 10 tokens * 4 chars = 40 chars max
      expect(md).toContain('[Context truncated to fit token budget]');
    });

    it('does not truncate when under token budget', async () => {
      const { builder } = createBuilder();
      mockGetById.mockResolvedValue(makeCampaign());

      const md = await builder.renderMarkdown('camp-001', 100000);

      expect(md).not.toContain('truncated');
    });

    it('uses default maxTokens of 4000', async () => {
      const { builder } = createBuilder();
      mockGetById.mockResolvedValue(makeCampaign());

      // Just verify it runs without error at default
      const md = await builder.renderMarkdown('camp-001');
      expect(md).toContain('# Research Context');
    });
  });
});
