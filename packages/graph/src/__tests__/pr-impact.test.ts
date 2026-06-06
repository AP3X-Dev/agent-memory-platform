import { describe, it, expect } from 'vitest';
import type { Driver } from 'neo4j-driver';
import { PrImpactService } from '../pr-impact.js';
import type { GraphSnapshotService } from '../snapshot.js';
import type { PullRequest, PullRequestProvider } from '../providers/pull-request-provider.js';
import type { AmpGraphSnapshot } from '../types.js';

function rec(map: Record<string, unknown>) {
  return { get: (k: string) => map[k] };
}

/** Mock driver: the dependents query returns a fixed dependency closure. */
function mockDriver(dependents: { changedComponents: string[]; symbols: string[]; dependentFiles: string[] }): Driver {
  const session = {
    run: async (query: string) => {
      if (query.includes('SYMBOL_IMPORTS')) {
        return { records: [rec(dependents)] };
      }
      return { records: [] };
    },
    close: async () => {},
  };
  return { session: () => session } as unknown as Driver;
}

function fakeSnapshotService(snap: AmpGraphSnapshot): GraphSnapshotService {
  return { snapshot: async () => snap } as unknown as GraphSnapshotService;
}

const SNAP: AmpGraphSnapshot = {
  project_name: 'amp',
  generated_at: 't',
  truncated: false,
  total_available: 3,
  nodes: [
    { id: 'ca', type: 'component', label: 'a.ts', source_file: '/repo/amp/packages/x/a.ts', properties: {} },
    { id: 'cb', type: 'component', label: 'b.ts', source_file: '/repo/amp/packages/y/b.ts', properties: {} },
    { id: 'sa', type: 'symbol', label: 'doThing', source_file: '/repo/amp/packages/x/a.ts', properties: {} },
  ],
  edges: [
    { id: 'ca|USES|cb', source: 'ca', target: 'cb', relation: 'USES', weight: 3, properties: {} },
    { id: 'sa|DEFINED_IN|ca', source: 'sa', target: 'ca', relation: 'DEFINED_IN', weight: 2, properties: {} },
  ],
};

function provider(changedByRef: Record<string, string[]>, open: PullRequest[] = []): PullRequestProvider {
  return {
    getChangedFiles: async (ref) => changedByRef[ref] ?? [],
    listOpenPullRequests: async () => open,
  };
}

describe('PrImpactService.impact', () => {
  it('reports changed files, dependents, and knowledge areas touched', async () => {
    const svc = new PrImpactService(
      fakeSnapshotService(SNAP),
      provider({ '7': ['packages/x/a.ts'] }),
      mockDriver({
        changedComponents: ['/repo/amp/packages/x/a.ts'],
        symbols: ['doThing'],
        dependentFiles: ['/repo/amp/packages/y/b.ts'],
      }),
    );
    const res = await svc.impact({ pr: '7', project_name: 'amp' });

    expect(res.changed_files).toEqual(['packages/x/a.ts']);
    expect(res.impacted_files).toEqual(['/repo/amp/packages/y/b.ts']);
    expect(res.markdown).toContain('# PR 7 — Impact');
    expect(res.markdown).toContain('packages/x/a.ts');
    expect(res.markdown).toContain('## Dependent Files');
    expect(res.markdown).toContain('packages/y/b.ts');
    expect(res.markdown).toContain('## Knowledge Areas Touched');
    expect(res.areas.length).toBeGreaterThanOrEqual(1); // changed component is in a community
  });

  it('handles a PR with no graph matches gracefully', async () => {
    const svc = new PrImpactService(
      fakeSnapshotService(SNAP),
      provider({ '8': ['unknown/file.ts'] }),
      mockDriver({ changedComponents: [], symbols: [], dependentFiles: [] }),
    );
    const res = await svc.impact({ pr: '8' });
    expect(res.impacted_files).toEqual([]);
    expect(res.markdown).toContain('No files depend on the changed code');
  });
});

describe('PrImpactService.conflicts', () => {
  it('flags PR pairs whose impacted files overlap', async () => {
    const svc = new PrImpactService(
      fakeSnapshotService(SNAP),
      provider({ '1': ['packages/x/a.ts'], '2': ['packages/z/c.ts'] }),
      // both PRs' changes ripple to the same shared file
      mockDriver({ changedComponents: [], symbols: [], dependentFiles: ['/repo/amp/shared.ts'] }),
    );
    const res = await svc.conflicts({ prs: ['1', '2'] });
    expect(res.conflicts).toHaveLength(1);
    expect(res.conflicts[0]).toMatchObject({ a: '1', b: '2' });
    expect(res.conflicts[0].shared_files).toContain('/repo/amp/shared.ts');
    expect(res.markdown).toContain('PR 1 ⨯ PR 2');
  });

  it('reports no conflicts when impact sets are disjoint', async () => {
    let call = 0;
    const driver = {
      session: () => ({
        run: async (query: string) => {
          if (query.includes('SYMBOL_IMPORTS')) {
            // distinct dependents per call → no overlap
            call += 1;
            return { records: [rec({ changedComponents: [], symbols: [], dependentFiles: [`/repo/dep${call}.ts`] })] };
          }
          return { records: [] };
        },
        close: async () => {},
      }),
    } as unknown as Driver;
    const svc = new PrImpactService(
      fakeSnapshotService(SNAP),
      provider({ '1': ['x.ts'], '2': ['y.ts'] }),
      driver,
    );
    const res = await svc.conflicts({ prs: ['1', '2'] });
    expect(res.conflicts).toEqual([]);
    expect(res.markdown).toContain('No overlapping impact');
  });

  it('falls back to all open PRs when none are specified', async () => {
    const svc = new PrImpactService(
      fakeSnapshotService(SNAP),
      provider({}, [
        { id: '10', changed_files: ['a.ts'] },
        { id: '11', changed_files: ['b.ts'] },
      ]),
      mockDriver({ changedComponents: [], symbols: [], dependentFiles: ['/repo/shared.ts'] }),
    );
    const res = await svc.conflicts({});
    expect(res.conflicts).toHaveLength(1);
  });
});
