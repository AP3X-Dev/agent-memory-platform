// packages/research/src/__tests__/hypothesis.test.ts
import { describe, it, expect, vi } from 'vitest';
import { HypothesisNavigator } from '../hypothesis.js';
import type { HypothesisTreeNode, ExperimentStatus } from '../types.js';

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

function experimentRecord(
  id: string,
  num: number,
  parentId: string | null,
  status: ExperimentStatus = 'keep',
  description = '',
  metric = 0,
  branch = 'research/test',
) {
  return {
    get: (key: string) => {
      if (key === 'e') {
        return {
          properties: {
            id,
            experiment_number: num,
            description,
            status,
            metric_value: metric,
            branch,
          },
        };
      }
      if (key === 'parentId') return parentId;
      return null;
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('HypothesisNavigator', () => {
  let nav: HypothesisNavigator;
  let session: ReturnType<typeof mockSession>;

  describe('getTree', () => {
    it('returns empty array when no experiments exist', async () => {
      session = mockSession({ records: [] });
      nav = new HypothesisNavigator(mockDriver(session));

      const tree = await nav.getTree('camp-001');
      expect(tree).toEqual([]);
    });

    it('builds a flat tree from root-only experiments', async () => {
      session = mockSession({
        records: [
          experimentRecord('exp-0', 0, null, 'keep', 'Baseline', 100),
          experimentRecord('exp-1', 1, null, 'discard', 'Alt approach', 110),
        ],
      });
      nav = new HypothesisNavigator(mockDriver(session));

      const tree = await nav.getTree('camp-001');

      expect(tree).toHaveLength(2);
      expect(tree[0].id).toBe('exp-0');
      expect(tree[0].depth).toBe(0);
      expect(tree[0].children).toEqual([]);
      expect(tree[1].id).toBe('exp-1');
      expect(tree[1].depth).toBe(0);
    });

    it('builds parent-child relationships correctly', async () => {
      session = mockSession({
        records: [
          experimentRecord('exp-0', 0, null, 'keep', 'Baseline', 100),
          experimentRecord('exp-1', 1, 'exp-0', 'keep', 'Child 1', 90),
          experimentRecord('exp-2', 2, 'exp-0', 'discard', 'Child 2', 105),
        ],
      });
      nav = new HypothesisNavigator(mockDriver(session));

      const tree = await nav.getTree('camp-001');

      expect(tree).toHaveLength(1); // Only root
      expect(tree[0].id).toBe('exp-0');
      expect(tree[0].children).toHaveLength(2);
      expect(tree[0].children[0].id).toBe('exp-1');
      expect(tree[0].children[1].id).toBe('exp-2');
    });

    it('assigns correct depth to nested nodes', async () => {
      session = mockSession({
        records: [
          experimentRecord('exp-0', 0, null, 'keep', 'Root', 100),
          experimentRecord('exp-1', 1, 'exp-0', 'keep', 'Depth 1', 90),
          experimentRecord('exp-2', 2, 'exp-1', 'keep', 'Depth 2', 80),
          experimentRecord('exp-3', 3, 'exp-2', 'keep', 'Depth 3', 70),
        ],
      });
      nav = new HypothesisNavigator(mockDriver(session));

      const tree = await nav.getTree('camp-001');

      expect(tree).toHaveLength(1);
      expect(tree[0].depth).toBe(0);
      expect(tree[0].children[0].depth).toBe(1);
      expect(tree[0].children[0].children[0].depth).toBe(2);
      expect(tree[0].children[0].children[0].children[0].depth).toBe(3);
    });

    it('treats experiment with unknown parent as root', async () => {
      session = mockSession({
        records: [
          experimentRecord('exp-0', 0, null, 'keep', 'Root', 100),
          experimentRecord('exp-1', 1, 'missing-parent', 'keep', 'Orphan', 90),
        ],
      });
      nav = new HypothesisNavigator(mockDriver(session));

      const tree = await nav.getTree('camp-001');
      expect(tree).toHaveLength(2); // Both are roots
    });

    it('handles Neo4j integer objects in experiment_number', async () => {
      session = mockSession({
        records: [
          {
            get: (key: string) => {
              if (key === 'e') {
                return {
                  properties: {
                    id: 'exp-0',
                    experiment_number: { toNumber: () => 42 },
                    description: 'Test',
                    status: 'keep',
                    metric_value: 100,
                    branch: 'b',
                  },
                };
              }
              if (key === 'parentId') return null;
              return null;
            },
          },
        ],
      });
      nav = new HypothesisNavigator(mockDriver(session));

      const tree = await nav.getTree('camp-001');
      expect(tree[0].experiment_number).toBe(42);
    });

    it('closes session even on error', async () => {
      session = mockSession();
      session.run.mockRejectedValue(new Error('fail'));
      nav = new HypothesisNavigator(mockDriver(session));

      await expect(nav.getTree('camp-001')).rejects.toThrow('fail');
      expect(session.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('findByComponent', () => {
    it('finds experiments that modified a component', async () => {
      session = mockSession({
        records: [
          {
            get: (key: string) => {
              const data: Record<string, unknown> = {
                id: 'exp-1',
                num: 1,
                desc: 'Optimized parser',
                status: 'keep',
                metric: 42.5,
              };
              return data[key];
            },
          },
        ],
      });
      nav = new HypothesisNavigator(mockDriver(session));

      const results = await nav.findByComponent('camp-001', 'src/parser.ts');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('exp-1');
      expect(results[0].experiment_number).toBe(1);
      expect(results[0].description).toBe('Optimized parser');
      expect(results[0].status).toBe('keep');
      expect(results[0].metric_value).toBe(42.5);
    });

    it('includes status filter when provided', async () => {
      session = mockSession({ records: [] });
      nav = new HypothesisNavigator(mockDriver(session));

      await nav.findByComponent('camp-001', 'src/parser.ts', 'keep');

      const query = session.run.mock.calls[0][0] as string;
      expect(query).toContain('e.status = $status');
    });

    it('excludes status filter when not provided', async () => {
      session = mockSession({ records: [] });
      nav = new HypothesisNavigator(mockDriver(session));

      await nav.findByComponent('camp-001', 'src/parser.ts');

      const query = session.run.mock.calls[0][0] as string;
      expect(query).not.toContain('e.status = $status');
    });

    it('passes null for status param when not filtering', async () => {
      session = mockSession({ records: [] });
      nav = new HypothesisNavigator(mockDriver(session));

      await nav.findByComponent('camp-001', 'src/parser.ts');

      const params = session.run.mock.calls[0][1] as Record<string, unknown>;
      expect(params.status).toBeNull();
    });

    it('returns empty array when no experiments match', async () => {
      session = mockSession({ records: [] });
      nav = new HypothesisNavigator(mockDriver(session));

      const results = await nav.findByComponent('camp-001', 'nonexistent.ts');
      expect(results).toEqual([]);
    });
  });

  describe('renderTreeMarkdown', () => {
    it('renders header for empty tree', () => {
      nav = new HypothesisNavigator(null as any);
      const md = nav.renderTreeMarkdown([]);
      expect(md).toContain('# Hypothesis Tree');
    });

    it('renders keep status with + icon', () => {
      nav = new HypothesisNavigator(null as any);
      const node: HypothesisTreeNode = {
        id: 'exp-0',
        experiment_number: 0,
        description: 'Baseline',
        status: 'keep',
        metric_value: 100,
        branch: 'research/test',
        depth: 0,
        children: [],
      };

      const md = nav.renderTreeMarkdown([node]);
      expect(md).toContain('[+] #0 Baseline (100) [research/test]');
    });

    it('renders keep* status with + icon', () => {
      nav = new HypothesisNavigator(null as any);
      const node: HypothesisTreeNode = {
        id: 'exp-0',
        experiment_number: 0,
        description: 'Good',
        status: 'keep*',
        metric_value: 50,
        branch: 'b',
        depth: 0,
        children: [],
      };

      const md = nav.renderTreeMarkdown([node]);
      expect(md).toContain('[+]');
    });

    it('renders discard status with - icon', () => {
      nav = new HypothesisNavigator(null as any);
      const node: HypothesisTreeNode = {
        id: 'exp-1',
        experiment_number: 1,
        description: 'Failed',
        status: 'discard',
        metric_value: 110,
        branch: 'b',
        depth: 0,
        children: [],
      };

      const md = nav.renderTreeMarkdown([node]);
      expect(md).toContain('[-] #1 Failed (110)');
    });

    it('renders crash/timeout status with ! icon', () => {
      nav = new HypothesisNavigator(null as any);

      for (const status of ['crash', 'timeout'] as ExperimentStatus[]) {
        const node: HypothesisTreeNode = {
          id: 'e',
          experiment_number: 1,
          description: 'Broke',
          status,
          metric_value: 0,
          branch: 'b',
          depth: 0,
          children: [],
        };
        const md = nav.renderTreeMarkdown([node]);
        expect(md).toContain('[!]');
      }
    });

    it('renders thought status with ? icon', () => {
      nav = new HypothesisNavigator(null as any);
      const node: HypothesisTreeNode = {
        id: 'e',
        experiment_number: 1,
        description: 'Idea',
        status: 'thought',
        metric_value: 0,
        branch: 'b',
        depth: 0,
        children: [],
      };

      const md = nav.renderTreeMarkdown([node]);
      expect(md).toContain('[?]');
    });

    it('renders interesting status with ~ icon', () => {
      nav = new HypothesisNavigator(null as any);
      const node: HypothesisTreeNode = {
        id: 'e',
        experiment_number: 1,
        description: 'Hmm',
        status: 'interesting',
        metric_value: 0,
        branch: 'b',
        depth: 0,
        children: [],
      };

      const md = nav.renderTreeMarkdown([node]);
      expect(md).toContain('[~]');
    });

    it('indents children with 2-space increments', () => {
      nav = new HypothesisNavigator(null as any);
      const tree: HypothesisTreeNode[] = [
        {
          id: 'root',
          experiment_number: 0,
          description: 'Root',
          status: 'keep',
          metric_value: 100,
          branch: 'b',
          depth: 0,
          children: [
            {
              id: 'child',
              experiment_number: 1,
              description: 'Child',
              status: 'keep',
              metric_value: 90,
              branch: 'b',
              depth: 1,
              children: [
                {
                  id: 'grandchild',
                  experiment_number: 2,
                  description: 'Grandchild',
                  status: 'discard',
                  metric_value: 95,
                  branch: 'b',
                  depth: 2,
                  children: [],
                },
              ],
            },
          ],
        },
      ];

      const md = nav.renderTreeMarkdown(tree);
      const lines = md.split('\n').filter((l) => l.includes('[') && l.includes(']'));

      // Root — no indent
      expect(lines[0]).toMatch(/^\[/);
      // Child — 2 spaces
      expect(lines[1]).toMatch(/^  \[/);
      // Grandchild — 4 spaces
      expect(lines[2]).toMatch(/^    \[/);
    });

    it('renders multiple roots', () => {
      nav = new HypothesisNavigator(null as any);
      const tree: HypothesisTreeNode[] = [
        {
          id: 'r1',
          experiment_number: 0,
          description: 'Root 1',
          status: 'keep',
          metric_value: 100,
          branch: 'b1',
          depth: 0,
          children: [],
        },
        {
          id: 'r2',
          experiment_number: 1,
          description: 'Root 2',
          status: 'discard',
          metric_value: 110,
          branch: 'b2',
          depth: 0,
          children: [],
        },
      ];

      const md = nav.renderTreeMarkdown(tree);
      expect(md).toContain('Root 1');
      expect(md).toContain('Root 2');
    });
  });
});
