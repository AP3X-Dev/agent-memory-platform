// packages/research/src/__tests__/campaign.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CampaignStore } from '../campaign.js';
import type { CampaignNode } from '../types.js';

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
    baseline_metric: null,
    best_metric: null,
    best_commit: null,
    best_experiment_id: null,
    total_experiments: 0,
    total_keeps: 0,
    total_discards: 0,
    consolidation_count: 0,
    last_consolidation_at: null,
    status: 'active',
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function neo4jRecord(data: Record<string, unknown>) {
  return { get: (key: string) => data[key] };
}

function neo4jNodeRecord(props: Record<string, unknown>) {
  return { get: (key: string) => (key === 'c' ? { properties: props } : props[key]) };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('CampaignStore', () => {
  let store: CampaignStore;
  let session: ReturnType<typeof mockSession>;

  describe('create', () => {
    it('creates a campaign node and returns its id', async () => {
      session = mockSession({ records: [neo4jRecord({ id: 'camp-id-1' })] });
      store = new CampaignStore(mockDriver(session));

      const node = makeCampaign();
      const id = await store.create(node);

      expect(id).toBe('camp-id-1');
      expect(session.run).toHaveBeenCalledTimes(1);
      expect(session.close).toHaveBeenCalledTimes(1);

      // Verify the CREATE query was used
      const query = session.run.mock.calls[0][0] as string;
      expect(query).toContain('CREATE');
      expect(query).toContain(':Entity:Campaign');
    });

    it('passes all node fields as params', async () => {
      session = mockSession({ records: [neo4jRecord({ id: 'camp-id-1' })] });
      store = new CampaignStore(mockDriver(session));

      const node = makeCampaign({ baseline_metric: 50, best_metric: 42 });
      await store.create(node);

      const params = session.run.mock.calls[0][1] as Record<string, unknown>;
      expect(params.id).toBe('camp-id-1');
      expect(params.campaign_id).toBe('camp-001');
      expect(params.name).toBe('perf-campaign');
      expect(params.baseline_metric).toBe(50);
      expect(params.best_metric).toBe(42);
      expect(params.status).toBe('active');
    });

    it('closes session even when run throws', async () => {
      session = mockSession();
      session.run.mockRejectedValue(new Error('Neo4j down'));
      store = new CampaignStore(mockDriver(session));

      await expect(store.create(makeCampaign())).rejects.toThrow('Neo4j down');
      expect(session.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('getById', () => {
    it('returns a mapped CampaignNode when found', async () => {
      const props = {
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
        baseline_metric: null,
        best_metric: 42.5,
        best_commit: 'abc123',
        best_experiment_id: 'exp-3',
        total_experiments: 5,
        total_keeps: 3,
        total_discards: 2,
        consolidation_count: 1,
        last_consolidation_at: '2026-01-01T00:00:00Z',
        status: 'active',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
      };
      session = mockSession({ records: [neo4jNodeRecord(props)] });
      store = new CampaignStore(mockDriver(session));

      const result = await store.getById('camp-001');

      expect(result).not.toBeNull();
      expect(result!.campaign_id).toBe('camp-001');
      expect(result!.name).toBe('perf-campaign');
      expect(result!.best_metric).toBe(42.5);
      expect(result!.total_experiments).toBe(5);
      expect(result!.status).toBe('active');
    });

    it('returns null when no records found', async () => {
      session = mockSession({ records: [] });
      store = new CampaignStore(mockDriver(session));

      const result = await store.getById('nonexistent');
      expect(result).toBeNull();
    });

    it('handles Neo4j integer objects via toNumber()', async () => {
      const props = {
        id: 'camp-id-1',
        campaign_id: 'camp-001',
        name: 'test',
        objective: 'test',
        metric_name: 'x',
        metric_direction: 'lower',
        run_command: 'echo',
        measure_command: 'echo',
        scope_files: [],
        constraints: '',
        baseline_metric: null,
        best_metric: null,
        best_commit: null,
        best_experiment_id: null,
        total_experiments: { toNumber: () => 10 },
        total_keeps: { toNumber: () => 7 },
        total_discards: { toNumber: () => 3 },
        consolidation_count: { toNumber: () => 2 },
        last_consolidation_at: null,
        status: 'active',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };
      session = mockSession({ records: [neo4jNodeRecord(props)] });
      store = new CampaignStore(mockDriver(session));

      const result = await store.getById('camp-001');
      expect(result!.total_experiments).toBe(10);
      expect(result!.total_keeps).toBe(7);
      expect(result!.total_discards).toBe(3);
      expect(result!.consolidation_count).toBe(2);
    });

    it('defaults numeric fields to 0 for null/undefined', async () => {
      const props = {
        id: 'camp-id-1',
        campaign_id: 'camp-001',
        name: 'test',
        objective: 'test',
        metric_name: 'x',
        metric_direction: 'lower',
        run_command: 'echo',
        measure_command: 'echo',
        scope_files: null,
        constraints: null,
        baseline_metric: null,
        best_metric: null,
        best_commit: null,
        best_experiment_id: null,
        total_experiments: null,
        total_keeps: undefined,
        total_discards: null,
        consolidation_count: undefined,
        last_consolidation_at: null,
        status: 'active',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };
      session = mockSession({ records: [neo4jNodeRecord(props)] });
      store = new CampaignStore(mockDriver(session));

      const result = await store.getById('camp-001');
      expect(result!.total_experiments).toBe(0);
      expect(result!.total_keeps).toBe(0);
      expect(result!.total_discards).toBe(0);
      expect(result!.consolidation_count).toBe(0);
      expect(result!.scope_files).toEqual([]);
      expect(result!.constraints).toBe('');
    });
  });

  describe('updateStats', () => {
    beforeEach(() => {
      session = mockSession();
      store = new CampaignStore(mockDriver(session));
    });

    it('builds SET clause from provided updates', async () => {
      await store.updateStats('camp-001', {
        total_experiments: 5,
        total_keeps: 3,
        best_metric: 42,
      });

      const query = session.run.mock.calls[0][0] as string;
      expect(query).toContain('c.total_experiments = $total_experiments');
      expect(query).toContain('c.total_keeps = $total_keeps');
      expect(query).toContain('c.best_metric = $best_metric');
      expect(query).toContain('c.updated_at = $now');

      const params = session.run.mock.calls[0][1] as Record<string, unknown>;
      expect(params.total_experiments).toBe(5);
      expect(params.total_keeps).toBe(3);
      expect(params.best_metric).toBe(42);
      expect(params.campaignId).toBe('camp-001');
    });

    it('skips undefined values in updates', async () => {
      await store.updateStats('camp-001', { total_experiments: 5 });

      const query = session.run.mock.calls[0][0] as string;
      expect(query).toContain('c.total_experiments');
      expect(query).not.toContain('c.total_keeps');
      expect(query).not.toContain('c.best_metric');
    });

    it('always includes updated_at in SET clause', async () => {
      await store.updateStats('camp-001', {});

      const query = session.run.mock.calls[0][0] as string;
      expect(query).toContain('c.updated_at = $now');
    });

    it('rejects property keys with unsafe characters', async () => {
      // Construct an object with an unsafe key directly to bypass TS
      const updates = { 'drop;--': 42 } as any;
      await expect(store.updateStats('camp-001', updates)).rejects.toThrow('Invalid property key');
    });

    it('closes session even on error', async () => {
      session.run.mockRejectedValue(new Error('fail'));
      await expect(store.updateStats('camp-001', { total_experiments: 1 })).rejects.toThrow();
      expect(session.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('incrementConsolidation', () => {
    it('runs the correct Cypher query', async () => {
      session = mockSession();
      store = new CampaignStore(mockDriver(session));

      await store.incrementConsolidation('camp-001');

      const query = session.run.mock.calls[0][0] as string;
      expect(query).toContain('c.consolidation_count = c.consolidation_count + 1');
      expect(query).toContain('c.last_consolidation_at');
      expect(query).toContain('c.updated_at');

      const params = session.run.mock.calls[0][1] as Record<string, unknown>;
      expect(params.campaignId).toBe('camp-001');
    });
  });

  describe('setStatus', () => {
    it('sets the status and updated_at', async () => {
      session = mockSession();
      store = new CampaignStore(mockDriver(session));

      await store.setStatus('camp-001', 'completed');

      const params = session.run.mock.calls[0][1] as Record<string, unknown>;
      expect(params.campaignId).toBe('camp-001');
      expect(params.status).toBe('completed');
      expect(params.now).toBeDefined();
    });

    it('accepts all valid status values', async () => {
      session = mockSession();
      store = new CampaignStore(mockDriver(session));

      for (const status of ['active', 'completed', 'abandoned'] as const) {
        await store.setStatus('camp-001', status);
      }

      expect(session.run).toHaveBeenCalledTimes(3);
    });
  });

  describe('listActive', () => {
    it('returns all active campaigns mapped correctly', async () => {
      const props = {
        id: 'camp-id-1',
        campaign_id: 'camp-001',
        name: 'test',
        objective: 'test',
        metric_name: 'x',
        metric_direction: 'lower',
        run_command: 'echo',
        measure_command: 'echo',
        scope_files: [],
        constraints: '',
        baseline_metric: null,
        best_metric: null,
        best_commit: null,
        best_experiment_id: null,
        total_experiments: 3,
        total_keeps: 2,
        total_discards: 1,
        consolidation_count: 0,
        last_consolidation_at: null,
        status: 'active',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };
      session = mockSession({ records: [neo4jNodeRecord(props)] });
      store = new CampaignStore(mockDriver(session));

      const results = await store.listActive();

      expect(results).toHaveLength(1);
      expect(results[0].campaign_id).toBe('camp-001');
      expect(results[0].status).toBe('active');

      const query = session.run.mock.calls[0][0] as string;
      expect(query).toContain("status: 'active'");
      expect(query).toContain('ORDER BY c.updated_at DESC');
    });

    it('returns empty array when no active campaigns exist', async () => {
      session = mockSession({ records: [] });
      store = new CampaignStore(mockDriver(session));

      const results = await store.listActive();
      expect(results).toEqual([]);
    });
  });
});
