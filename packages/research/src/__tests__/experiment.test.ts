// packages/research/src/__tests__/experiment.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExperimentStore } from '../experiment.js';
import type { ExperimentNode } from '../types.js';

// ── Mock helpers ──────────────────────────────────────────────────────

function mockSession(runResult: unknown = { records: [] }) {
  return {
    run: vi.fn().mockResolvedValue(runResult),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function mockDriver(session: ReturnType<typeof mockSession>) {
  return { session: vi.fn(() => session) } as any;
}

function makeExperiment(overrides: Partial<ExperimentNode> = {}): ExperimentNode {
  return {
    id: 'exp-1',
    session_id: 'sess-1',
    agent_id: 'agent-1',
    campaign_id: 'camp-001',
    experiment_number: 1,
    branch: 'research/test',
    parent_id: null,
    commit_hash: 'abc1234',
    metric_name: 'duration_s',
    metric_value: 42.5,
    secondary_metrics: {},
    status: 'keep',
    duration_s: 60,
    hypothesis: 'Test hypothesis',
    description: 'Enable parallel workers',
    insight: 'Parallelism helped',
    components_touched: ['jest.config.ts'],
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function neo4jRecord(data: Record<string, unknown>) {
  return { get: (key: string) => data[key] };
}

function neo4jNodeRecord(props: Record<string, unknown>) {
  return { get: (key: string) => (key === 'e' ? { properties: props } : props[key]) };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('ExperimentStore', () => {
  let store: ExperimentStore;
  let session: ReturnType<typeof mockSession>;

  describe('create', () => {
    it('creates an experiment and returns its id', async () => {
      session = mockSession({ records: [neo4jRecord({ id: 'exp-1' })] });
      store = new ExperimentStore(mockDriver(session));

      const id = await store.create(makeExperiment());

      expect(id).toBe('exp-1');
      expect(session.run).toHaveBeenCalledTimes(1);
      expect(session.close).toHaveBeenCalledTimes(1);
    });

    it('uses dual labels Episodic and Experiment', async () => {
      session = mockSession({ records: [neo4jRecord({ id: 'exp-1' })] });
      store = new ExperimentStore(mockDriver(session));

      await store.create(makeExperiment());

      const query = session.run.mock.calls[0][0] as string;
      expect(query).toContain(':Episodic:Experiment');
    });

    it('maps status to Episodic-compatible outcome field', async () => {
      session = mockSession({ records: [neo4jRecord({ id: 'exp-1' })] });
      store = new ExperimentStore(mockDriver(session));

      await store.create(makeExperiment({ status: 'keep' }));
      const params = session.run.mock.calls[0][1] as Record<string, unknown>;
      expect(params.outcome).toBe('approved');
    });

    it('maps discard status to revised outcome', async () => {
      session = mockSession({ records: [neo4jRecord({ id: 'exp-1' })] });
      store = new ExperimentStore(mockDriver(session));

      await store.create(makeExperiment({ status: 'discard' }));
      const params = session.run.mock.calls[0][1] as Record<string, unknown>;
      expect(params.outcome).toBe('revised');
    });

    it('maps keep* status to approved outcome', async () => {
      session = mockSession({ records: [neo4jRecord({ id: 'exp-1' })] });
      store = new ExperimentStore(mockDriver(session));

      await store.create(makeExperiment({ status: 'keep*' }));
      const params = session.run.mock.calls[0][1] as Record<string, unknown>;
      expect(params.outcome).toBe('approved');
    });

    it('stores secondary_metrics as JSON when non-empty', async () => {
      session = mockSession({ records: [neo4jRecord({ id: 'exp-1' })] });
      store = new ExperimentStore(mockDriver(session));

      await store.create(makeExperiment({ secondary_metrics: { mem_mb: 220, cpu_pct: 85 } }));

      // First call = CREATE, second call = SET secondary_metrics
      expect(session.run).toHaveBeenCalledTimes(2);
      const smQuery = session.run.mock.calls[1][0] as string;
      expect(smQuery).toContain('secondary_metrics');
      const smParams = session.run.mock.calls[1][1] as Record<string, unknown>;
      expect(JSON.parse(smParams.sm as string)).toEqual({ mem_mb: 220, cpu_pct: 85 });
    });

    it('skips secondary_metrics SET when empty', async () => {
      session = mockSession({ records: [neo4jRecord({ id: 'exp-1' })] });
      store = new ExperimentStore(mockDriver(session));

      await store.create(makeExperiment({ secondary_metrics: {} }));
      expect(session.run).toHaveBeenCalledTimes(1);
    });

    it('stores embedding when provided', async () => {
      session = mockSession({ records: [neo4jRecord({ id: 'exp-1' })] });
      store = new ExperimentStore(mockDriver(session));

      const embedding = [0.1, 0.2, 0.3];
      await store.create(makeExperiment({ embedding }));

      // CREATE + embedding SET
      expect(session.run).toHaveBeenCalledTimes(2);
      const embQuery = session.run.mock.calls[1][0] as string;
      expect(embQuery).toContain('embedding');
    });

    it('builds task field from campaign_id and description', async () => {
      session = mockSession({ records: [neo4jRecord({ id: 'exp-1' })] });
      store = new ExperimentStore(mockDriver(session));

      await store.create(makeExperiment({
        campaign_id: 'perf-001',
        experiment_number: 5,
        description: 'Reduce allocations',
      }));

      const params = session.run.mock.calls[0][1] as Record<string, unknown>;
      expect(params.task).toBe('[perf-001] experiment #5: Reduce allocations');
    });

    it('builds content field from hypothesis, description, metric, and insight', async () => {
      session = mockSession({ records: [neo4jRecord({ id: 'exp-1' })] });
      store = new ExperimentStore(mockDriver(session));

      await store.create(makeExperiment({
        hypothesis: 'H1',
        description: 'D1',
        metric_name: 'score',
        metric_value: 99,
        status: 'keep',
        insight: 'Great result',
      }));

      const params = session.run.mock.calls[0][1] as Record<string, unknown>;
      const content = params.content as string;
      expect(content).toContain('Hypothesis: H1');
      expect(content).toContain('Changes: D1');
      expect(content).toContain('Result: score=99 (keep)');
      expect(content).toContain('Insight: Great result');
    });

    it('closes session on error', async () => {
      session = mockSession();
      session.run.mockRejectedValue(new Error('fail'));
      store = new ExperimentStore(mockDriver(session));

      await expect(store.create(makeExperiment())).rejects.toThrow('fail');
      expect(session.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('linkToParent', () => {
    it('creates DERIVED_FROM relationship', async () => {
      session = mockSession();
      store = new ExperimentStore(mockDriver(session));

      await store.linkToParent('exp-2', 'exp-1');

      const query = session.run.mock.calls[0][0] as string;
      expect(query).toContain('DERIVED_FROM');
      expect(query).toContain('MERGE');

      const params = session.run.mock.calls[0][1] as Record<string, unknown>;
      expect(params.experimentId).toBe('exp-2');
      expect(params.parentId).toBe('exp-1');
    });
  });

  describe('linkToComponent', () => {
    it('creates Component node and MODIFIED relationship', async () => {
      session = mockSession();
      store = new ExperimentStore(mockDriver(session));

      await store.linkToComponent('exp-1', 'src/utils/parser.ts', 'parsing', 'keep');

      const query = session.run.mock.calls[0][0] as string;
      expect(query).toContain(':Entity:Component');
      expect(query).toContain('MODIFIED');
      expect(query).toContain('ON CREATE SET');

      const params = session.run.mock.calls[0][1] as Record<string, unknown>;
      expect(params.experimentId).toBe('exp-1');
      expect(params.path).toBe('src/utils/parser.ts');
      expect(params.name).toBe('parser.ts');
      expect(params.domain).toBe('parsing');
      expect(params.outcome).toBe('keep');
    });

    it('extracts file name from path', async () => {
      session = mockSession();
      store = new ExperimentStore(mockDriver(session));

      await store.linkToComponent('exp-1', 'deep/nested/file.ts', 'core', 'discard');
      const params = session.run.mock.calls[0][1] as Record<string, unknown>;
      expect(params.name).toBe('file.ts');
    });

    it('uses full path as name when no slashes', async () => {
      session = mockSession();
      store = new ExperimentStore(mockDriver(session));

      await store.linkToComponent('exp-1', 'Makefile', 'build', 'keep');
      const params = session.run.mock.calls[0][1] as Record<string, unknown>;
      expect(params.name).toBe('Makefile');
    });
  });

  describe('linkToCampaign', () => {
    it('creates BELONGS_TO relationship', async () => {
      session = mockSession();
      store = new ExperimentStore(mockDriver(session));

      await store.linkToCampaign('exp-1', 'camp-001');

      const query = session.run.mock.calls[0][0] as string;
      expect(query).toContain('BELONGS_TO');
      expect(query).toContain('MERGE');
    });
  });

  describe('getById', () => {
    it('returns mapped ExperimentNode when found', async () => {
      const props = {
        id: 'exp-1',
        session_id: 'sess-1',
        agent_id: 'agent-1',
        campaign_id: 'camp-001',
        experiment_number: 3,
        branch: 'research/test',
        parent_id: 'exp-0',
        commit_hash: 'abc',
        metric_name: 'score',
        metric_value: 88.5,
        secondary_metrics: JSON.stringify({ mem: 100 }),
        status: 'keep',
        duration_s: 30,
        hypothesis: 'H',
        description: 'D',
        insight: 'I',
        components_touched: ['a.ts'],
        created_at: '2026-01-01T00:00:00Z',
      };
      session = mockSession({ records: [neo4jNodeRecord(props)] });
      store = new ExperimentStore(mockDriver(session));

      const result = await store.getById('exp-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('exp-1');
      expect(result!.experiment_number).toBe(3);
      expect(result!.secondary_metrics).toEqual({ mem: 100 });
      expect(result!.parent_id).toBe('exp-0');
    });

    it('returns null when not found', async () => {
      session = mockSession({ records: [] });
      store = new ExperimentStore(mockDriver(session));

      expect(await store.getById('nope')).toBeNull();
    });

    it('handles missing secondary_metrics gracefully', async () => {
      const props = {
        id: 'exp-1',
        session_id: 'sess-1',
        agent_id: 'agent-1',
        campaign_id: 'camp-001',
        experiment_number: 1,
        branch: 'b',
        parent_id: null,
        commit_hash: null,
        metric_name: 'x',
        metric_value: 0,
        secondary_metrics: undefined,
        status: 'discard',
        duration_s: 10,
        hypothesis: '',
        description: '',
        insight: '',
        components_touched: null,
        created_at: '2026-01-01T00:00:00Z',
      };
      session = mockSession({ records: [neo4jNodeRecord(props)] });
      store = new ExperimentStore(mockDriver(session));

      const result = await store.getById('exp-1');
      expect(result!.secondary_metrics).toEqual({});
      expect(result!.components_touched).toEqual([]);
      expect(result!.parent_id).toBeNull();
    });

    it('handles Neo4j integer objects', async () => {
      const props = {
        id: 'exp-1',
        session_id: 's',
        agent_id: 'a',
        campaign_id: 'c',
        experiment_number: { toNumber: () => 42 },
        branch: 'b',
        parent_id: null,
        commit_hash: null,
        metric_name: 'x',
        metric_value: 0,
        status: 'keep',
        duration_s: 10,
        hypothesis: '',
        description: '',
        insight: '',
        components_touched: [],
        created_at: '2026-01-01T00:00:00Z',
      };
      session = mockSession({ records: [neo4jNodeRecord(props)] });
      store = new ExperimentStore(mockDriver(session));

      const result = await store.getById('exp-1');
      expect(result!.experiment_number).toBe(42);
    });
  });

  describe('getByCampaign', () => {
    it('returns experiments ordered by experiment_number ASC', async () => {
      const makeProps = (num: number) => ({
        id: `exp-${num}`,
        session_id: 's',
        agent_id: 'a',
        campaign_id: 'camp-001',
        experiment_number: num,
        branch: 'b',
        parent_id: null,
        commit_hash: null,
        metric_name: 'x',
        metric_value: num * 10,
        status: 'keep',
        duration_s: 10,
        hypothesis: '',
        description: `exp ${num}`,
        insight: '',
        components_touched: [],
        created_at: '2026-01-01T00:00:00Z',
      });
      session = mockSession({
        records: [neo4jNodeRecord(makeProps(1)), neo4jNodeRecord(makeProps(2))],
      });
      store = new ExperimentStore(mockDriver(session));

      const results = await store.getByCampaign('camp-001');

      expect(results).toHaveLength(2);
      expect(results[0].experiment_number).toBe(1);
      expect(results[1].experiment_number).toBe(2);

      const query = session.run.mock.calls[0][0] as string;
      expect(query).toContain('ORDER BY e.experiment_number ASC');
      expect(query).toContain('LIMIT');
    });

    it('uses default limit of 100', async () => {
      session = mockSession({ records: [] });
      store = new ExperimentStore(mockDriver(session));

      await store.getByCampaign('camp-001');

      // neo4j.int wraps the limit — just verify it's passed
      const params = session.run.mock.calls[0][1] as Record<string, unknown>;
      expect(params.campaignId).toBe('camp-001');
    });

    it('accepts custom limit', async () => {
      session = mockSession({ records: [] });
      store = new ExperimentStore(mockDriver(session));

      await store.getByCampaign('camp-001', 5);
      expect(session.run).toHaveBeenCalledTimes(1);
    });
  });

  describe('getRecentKeeps', () => {
    it('filters by keep and keep* statuses', async () => {
      session = mockSession({ records: [] });
      store = new ExperimentStore(mockDriver(session));

      await store.getRecentKeeps('camp-001');

      const query = session.run.mock.calls[0][0] as string;
      expect(query).toContain("e.status IN ['keep', 'keep*']");
      expect(query).toContain('ORDER BY e.experiment_number DESC');
    });

    it('uses default limit of 10', async () => {
      session = mockSession({ records: [] });
      store = new ExperimentStore(mockDriver(session));

      await store.getRecentKeeps('camp-001');
      expect(session.run).toHaveBeenCalledTimes(1);
    });
  });

  describe('getByComponent', () => {
    it('queries by component path without campaign filter', async () => {
      session = mockSession({ records: [] });
      store = new ExperimentStore(mockDriver(session));

      await store.getByComponent('src/parser.ts');

      const query = session.run.mock.calls[0][0] as string;
      expect(query).toContain('MODIFIED');
      expect(query).toContain('Component {path: $path}');
      expect(query).not.toContain('campaign_id');
    });

    it('queries by component path with campaign filter', async () => {
      session = mockSession({ records: [] });
      store = new ExperimentStore(mockDriver(session));

      await store.getByComponent('src/parser.ts', 'camp-001');

      const query = session.run.mock.calls[0][0] as string;
      expect(query).toContain('e.campaign_id = $campaignId');

      const params = session.run.mock.calls[0][1] as Record<string, unknown>;
      expect(params.path).toBe('src/parser.ts');
      expect(params.campaignId).toBe('camp-001');
    });
  });

  describe('getStats', () => {
    it('returns correct stat breakdown', async () => {
      session = mockSession({
        records: [
          {
            get: (key: string) => {
              const data: Record<string, unknown> = {
                total: 10,
                keeps: 5,
                discards: 3,
                crashes: 1,
                thoughts: 0,
                interesting: 1,
              };
              return data[key];
            },
          },
        ],
      });
      store = new ExperimentStore(mockDriver(session));

      const stats = await store.getStats('camp-001');

      expect(stats.total).toBe(10);
      expect(stats.keeps).toBe(5);
      expect(stats.discards).toBe(3);
      expect(stats.crashes).toBe(1);
      expect(stats.thoughts).toBe(0);
      expect(stats.interesting).toBe(1);
    });

    it('returns zeros when no records', async () => {
      session = mockSession({ records: [] });
      store = new ExperimentStore(mockDriver(session));

      const stats = await store.getStats('camp-001');

      expect(stats).toEqual({
        total: 0,
        keeps: 0,
        discards: 0,
        crashes: 0,
        thoughts: 0,
        interesting: 0,
      });
    });

    it('handles Neo4j integer objects in stats', async () => {
      session = mockSession({
        records: [
          {
            get: (key: string) => {
              const data: Record<string, unknown> = {
                total: { toNumber: () => 15 },
                keeps: { toNumber: () => 8 },
                discards: { toNumber: () => 4 },
                crashes: { toNumber: () => 2 },
                thoughts: { toNumber: () => 1 },
                interesting: { toNumber: () => 0 },
              };
              return data[key];
            },
          },
        ],
      });
      store = new ExperimentStore(mockDriver(session));

      const stats = await store.getStats('camp-001');
      expect(stats.total).toBe(15);
      expect(stats.keeps).toBe(8);
    });
  });

  describe('getDeadEnds', () => {
    it('filters by discard status and minDiscards threshold', async () => {
      session = mockSession({ records: [] });
      store = new ExperimentStore(mockDriver(session));

      await store.getDeadEnds('camp-001', 5);

      const query = session.run.mock.calls[0][0] as string;
      expect(query).toContain("e.status = 'discard'");
      expect(query).toContain('discardCount');
      expect(query).toContain('ORDER BY discardCount DESC');
    });

    it('defaults minDiscards to 3', async () => {
      session = mockSession({ records: [] });
      store = new ExperimentStore(mockDriver(session));

      await store.getDeadEnds('camp-001');
      expect(session.run).toHaveBeenCalledTimes(1);
    });

    it('returns mapped dead end objects', async () => {
      session = mockSession({
        records: [
          {
            get: (key: string) => {
              const data: Record<string, unknown> = {
                component: 'src/slow.ts',
                domain: 'perf',
                discardCount: 4,
                lastAttempt: '2026-01-01T00:00:00Z',
                descriptions: ['Try A', 'Try B', 'Try C', 'Try D'],
              };
              return data[key];
            },
          },
        ],
      });
      store = new ExperimentStore(mockDriver(session));

      const deadEnds = await store.getDeadEnds('camp-001');

      expect(deadEnds).toHaveLength(1);
      expect(deadEnds[0].component).toBe('src/slow.ts');
      expect(deadEnds[0].domain).toBe('perf');
      expect(deadEnds[0].discard_count).toBe(4);
      expect(deadEnds[0].descriptions).toHaveLength(4);
    });

    it('defaults domain to unknown when null', async () => {
      session = mockSession({
        records: [
          {
            get: (key: string) => {
              const data: Record<string, unknown> = {
                component: 'x.ts',
                domain: null,
                discardCount: 3,
                lastAttempt: '2026-01-01T00:00:00Z',
                descriptions: [],
              };
              return data[key];
            },
          },
        ],
      });
      store = new ExperimentStore(mockDriver(session));

      const deadEnds = await store.getDeadEnds('camp-001');
      expect(deadEnds[0].domain).toBe('unknown');
    });
  });
});
