// packages/wiki/src/__tests__/braindump.test.ts
// Brain-dump ingestion: inline content, project auto-creation, human-authored
// provenance (durable decay + tags), and the no-extractor fallback.

import { describe, it, expect, vi } from 'vitest';
import type { Driver, Session, Result } from 'neo4j-driver';
import { IngestionService } from '../ingest.js';

function mockRecord(data: Record<string, unknown>) {
  return { get: (k: string) => data[k], keys: Object.keys(data) };
}
function mockResult(records: ReturnType<typeof mockRecord>[] = []): Result {
  return { records } as unknown as Result;
}

interface RunCall { query: string; params: Record<string, unknown>; }

function createMockDriver(): { driver: Driver; calls: () => RunCall[] } {
  const calls: RunCall[] = [];
  const session = {
    run: vi.fn(async (query: string, params: Record<string, unknown> = {}) => {
      calls.push({ query, params });
      if (query.includes('MERGE (e:Entity')) return mockResult([mockRecord({ id: 'ent-x', created: true })]);
      if (query.includes('RETURN e.id AS id')) return mockResult([mockRecord({ id: 'ent-x' })]);
      return mockResult([]);
    }),
    close: vi.fn(async () => {}),
  } as unknown as Session;
  const driver = { session: vi.fn(() => session) } as unknown as Driver;
  return { driver, calls: () => calls };
}

describe('IngestionService — brain dumps', () => {
  it('ingests inline content with no file read', async () => {
    const { driver, calls } = createMockDriver();
    const result = await new IngestionService(driver).ingest({
      content: 'I am a staff engineer on the payments team.',
      source_type: 'note',
      project_tag: 'project:user-personal',
      author: 'human',
      ensure_project: true,
    });
    expect(result.source_id).toMatch(/^src-/);
    // verbatim text retained as a Source
    expect(calls().some((c) => c.query.includes('CREATE (s:Source'))).toBe(true);
    // path falls back to 'inline'
    const src = calls().find((c) => c.query.includes('CREATE (s:Source'));
    expect(src?.params.path).toBe('inline');
  });

  it('creates the project entity when ensure_project is set', async () => {
    const { driver, calls } = createMockDriver();
    await new IngestionService(driver).ingest({
      content: 'remember this', source_type: 'note',
      project_tag: 'project:fresh-scope', author: 'human', ensure_project: true,
    });
    const merge = calls().find((c) => c.query.includes('MERGE (e:Entity {name: $name})') && c.query.includes("e.type = 'project'"));
    expect(merge).toBeDefined();
    expect(merge?.params.name).toBe('fresh-scope');
  });

  it('falls back to verbatim claims (durable + human-authored) when no extractor/claims', async () => {
    const { driver, calls } = createMockDriver();
    const result = await new IngestionService(driver).ingest({
      content: 'First thought about my role.\n\nSecond thought about my stack.',
      source_type: 'note', project_tag: 'project:user-personal', author: 'human',
    });
    // two paragraphs -> two claims
    expect(result.claims_stored).toBe(2);
    const semCalls = calls().filter((c) => c.query.includes('CREATE (s:Semantic'));
    expect(semCalls).toHaveLength(2);
    // human dumps are durable (stable) and tagged for provenance
    expect(semCalls[0].params.decayClass).toBe('stable');
    expect(semCalls[0].params.tags).toContain('human-authored');
    expect(semCalls[0].params.tags).toContain('source:brain-dump');
    expect(semCalls[0].params.tags).toContain('project:user-personal');
  });

  it('uses a raised default confidence for human input', async () => {
    const { driver, calls } = createMockDriver();
    await new IngestionService(driver).ingest({
      content: 'one durable fact', source_type: 'note',
      project_tag: 'project:user-personal', author: 'human',
    });
    const sem = calls().find((c) => c.query.includes('CREATE (s:Semantic'));
    expect(sem?.params.confidence).toBe(0.7);
  });

  it('leaves berry_ingest behaviour unchanged (agent author, volatile, 0.3, no fallback)', async () => {
    const { driver, calls } = createMockDriver();
    const result = await new IngestionService(driver).ingest({
      content: 'some doc text', source_type: 'article', project_tag: 'project:test',
    });
    // no author=human, no pre-claims, no extractor -> no synthetic claims
    expect(result.claims_stored).toBe(0);
    expect(calls().some((c) => c.query.includes('CREATE (s:Semantic'))).toBe(false);
  });
});
