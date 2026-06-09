// packages/wiki/src/__tests__/queries.test.ts
// Tests for query helper functions (pure logic, no Neo4j needed).

import { describe, it, expect, vi } from 'vitest';
import { extractProjectScope } from '../queries.js';
import type { Driver, Session, Result } from 'neo4j-driver';

// ─── extractProjectScope ────────────────────────────────────────────────────

describe('extractProjectScope', () => {
  it('extracts project name from task prefix', () => {
    expect(extractProjectScope('[project:mars-fps] Fix enemy AI')).toBe('mars-fps');
  });

  it('extracts multi-word project names', () => {
    expect(extractProjectScope('[project:agent-assist] Update prompts')).toBe('agent-assist');
  });

  it('extracts simple project names', () => {
    expect(extractProjectScope('[project:amp] Add wiki tests')).toBe('amp');
  });

  it('returns null when no project prefix exists', () => {
    expect(extractProjectScope('Fix a bug in the code')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractProjectScope('')).toBeNull();
  });

  it('returns null when prefix is not at start', () => {
    expect(extractProjectScope('Task: [project:amp] something')).toBeNull();
  });

  it('handles project names with numbers', () => {
    expect(extractProjectScope('[project:v2-api] Deploy')).toBe('v2-api');
  });

  it('extracts only up to the closing bracket', () => {
    expect(extractProjectScope('[project:my-app] [project:other] task')).toBe('my-app');
  });
});

// ─── Mock helpers for query function tests ──────────────────────────────────

function mockRecord(data: Record<string, unknown>) {
  return {
    get(key: string) { return data[key]; },
    keys: Object.keys(data),
  };
}

function mockResult(records: ReturnType<typeof mockRecord>[] = []): Result {
  return { records } as unknown as Result;
}

// ─── Query function tests with mocked driver ───────────────────────────────

describe('fetchAllProjects', () => {
  it('returns EntityInfo array from project entities', async () => {
    const { fetchAllProjects } = await import('../queries.js');

    const mockSession = {
      run: vi.fn(async () => mockResult([
        mockRecord({
          id: 'ent-1',
          name: 'mars-fps',
          type: 'project',
          description: 'A space shooter',
          aliases: ['mars'],
          created_at: '2026-01-01T00:00:00Z',
        }),
        mockRecord({
          id: 'ent-2',
          name: 'amp',
          type: 'project',
          description: 'Agent memory',
          aliases: null,
          created_at: '2026-02-01T00:00:00Z',
        }),
      ])),
      close: vi.fn(async () => {}),
    } as unknown as Session;

    const driver = { session: vi.fn(() => mockSession) } as unknown as Driver;

    const projects = await fetchAllProjects(driver);

    expect(projects).toHaveLength(2);
    expect(projects[0].name).toBe('mars-fps');
    expect(projects[0].slug).toBe('mars-fps');
    expect(projects[0].type).toBe('project');
    expect(projects[1].name).toBe('amp');
    expect(projects[1].slug).toBe('amp');
  });
});

describe('fetchGraphStats', () => {
  it('returns counts keyed by label', async () => {
    const { fetchGraphStats } = await import('../queries.js');

    const mockSession = {
      run: vi.fn(async () => mockResult([
        mockRecord({ label: 'Entity', cnt: 20 }),
        mockRecord({ label: 'Fact', cnt: 99 }),
        mockRecord({ label: 'Semantic', cnt: 4 }),
        mockRecord({ label: 'Episodic', cnt: 219 }),
        mockRecord({ label: 'Source', cnt: 0 }),
      ])),
      close: vi.fn(async () => {}),
    } as unknown as Session;

    const driver = { session: vi.fn(() => mockSession) } as unknown as Driver;

    const stats = await fetchGraphStats(driver);

    expect(stats.total_entities).toBe(20);
    expect(stats.total_facts).toBe(99);
    expect(stats.total_semantics).toBe(4);
    expect(stats.total_episodics).toBe(219);
    expect(stats.total_sources).toBe(0);
  });

  it('returns zeros when graph is empty', async () => {
    const { fetchGraphStats } = await import('../queries.js');

    const mockSession = {
      run: vi.fn(async () => mockResult([])),
      close: vi.fn(async () => {}),
    } as unknown as Session;

    const driver = { session: vi.fn(() => mockSession) } as unknown as Driver;

    const stats = await fetchGraphStats(driver);

    expect(stats.total_entities).toBe(0);
    expect(stats.total_facts).toBe(0);
    expect(stats.total_semantics).toBe(0);
    expect(stats.total_episodics).toBe(0);
    expect(stats.total_sources).toBe(0);
  });
});

describe('fetchEpisodicProjectScopes', () => {
  it('returns project scopes from episodic task prefixes', async () => {
    const { fetchEpisodicProjectScopes } = await import('../queries.js');

    const mockSession = {
      run: vi.fn(async () => mockResult([
        mockRecord({ proj: 'agent-assist' }),
        mockRecord({ proj: 'client-portal' }),
      ])),
      close: vi.fn(async () => {}),
    } as unknown as Session;

    const driver = { session: vi.fn(() => mockSession) } as unknown as Driver;

    const scopes = await fetchEpisodicProjectScopes(driver);

    expect(scopes).toEqual(['agent-assist', 'client-portal']);
  });
});

describe('fetchAllTags', () => {
  it('returns tag list with counts', async () => {
    const { fetchAllTags } = await import('../queries.js');

    const mockSession = {
      run: vi.fn(async () => mockResult([
        mockRecord({ tag: 'architecture', count: 8, projects: [] }),
        mockRecord({ tag: 'api-design', count: 3, projects: [] }),
      ])),
      close: vi.fn(async () => {}),
    } as unknown as Session;

    const driver = { session: vi.fn(() => mockSession) } as unknown as Driver;

    const tags = await fetchAllTags(driver);

    expect(tags).toHaveLength(2);
    expect(tags[0].tag).toBe('architecture');
    expect(tags[0].count).toBe(8);
  });
});

describe('fetchRecentEpisodics', () => {
  it('returns episodic entries with project scope extracted', async () => {
    const { fetchRecentEpisodics } = await import('../queries.js');

    const mockSession = {
      run: vi.fn(async () => mockResult([
        mockRecord({
          id: 'ep-1',
          task: '[project:amp] Add wiki tests',
          content: 'Added lint and ingest tests',
          outcome: 'approved',
          session_id: 'sess-1',
          created_at: '2026-04-09T12:00:00Z',
        }),
        mockRecord({
          id: 'ep-2',
          task: 'General exploration',
          content: 'Explored codebase',
          outcome: null,
          session_id: 'sess-2',
          created_at: '2026-04-09T11:00:00Z',
        }),
      ])),
      close: vi.fn(async () => {}),
    } as unknown as Session;

    const driver = { session: vi.fn(() => mockSession) } as unknown as Driver;

    const episodes = await fetchRecentEpisodics(driver, 10);

    expect(episodes).toHaveLength(2);
    expect(episodes[0].project_scope).toBe('amp');
    expect(episodes[1].project_scope).toBeNull();
  });
});
