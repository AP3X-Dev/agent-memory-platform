// packages/wiki/src/__tests__/ingest.test.ts
// Tests for IngestionService and initWikiSchema.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Driver, Session, Result } from 'neo4j-driver';
import type { ExtractionProvider } from '@memberry/core';

// ─── Mock node:fs/promises at module level (hoisted by vitest) ──────────────

const mockReadFile = vi.fn();

vi.mock('node:fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));

// Import after mock is declared (vitest hoists vi.mock above imports)
import { IngestionService, initWikiSchema } from '../ingest.js';

// ─── Mock helpers ────────────────────────────────────────────────────────────

function mockRecord(data: Record<string, unknown>) {
  return {
    get(key: string) { return data[key]; },
    keys: Object.keys(data),
  };
}

function mockResult(records: ReturnType<typeof mockRecord>[] = []): Result {
  return { records } as unknown as Result;
}

interface RunCall {
  query: string;
  params?: unknown;
}

function createMockDriver(): { driver: Driver; getCalls: () => RunCall[] } {
  const calls: RunCall[] = [];
  const mockSession = {
    run: vi.fn(async (query: string, params?: unknown) => {
      calls.push({ query, params });
      // Default responses for specific query patterns
      if (query.includes('MERGE (e:Entity')) {
        return mockResult([mockRecord({ id: 'ent-mock123', created: true })]);
      }
      if (query.includes('MATCH (e:Entity {name:')) {
        return mockResult([mockRecord({ id: 'ent-mock123' })]);
      }
      return mockResult([]);
    }),
    close: vi.fn(async () => {}),
  } as unknown as Session;

  const driver = {
    session: vi.fn(() => mockSession),
  } as unknown as Driver;

  return { driver, getCalls: () => calls };
}

// ─── Reset mock before each test ────────────────────────────────────────────

beforeEach(() => {
  mockReadFile.mockReset();
});

// ─── initWikiSchema ──────────────────────────────────────────────────────────

describe('initWikiSchema', () => {
  it('creates constraint and indexes for Source nodes', async () => {
    const { driver, getCalls } = createMockDriver();

    await initWikiSchema(driver);

    const calls = getCalls();
    expect(calls.length).toBe(3);
    expect(calls[0].query).toContain('CREATE CONSTRAINT source_id');
    expect(calls[1].query).toContain('CREATE INDEX source_title');
    expect(calls[2].query).toContain('CREATE INDEX source_type');
  });
});

// ─── IngestionService ────────────────────────────────────────────────────────

describe('IngestionService', () => {
  describe('ingest() -- basic flow', () => {
    it('creates a Source node and returns result with IDs', async () => {
      mockReadFile.mockResolvedValue('# My Document\n\nSome content here.');
      const { driver, getCalls } = createMockDriver();
      const service = new IngestionService(driver);

      const result = await service.ingest({
        source_path: '/tmp/test-doc.md',
        source_type: 'article',
        project_tag: 'project:test',
      });

      expect(result.source_id).toMatch(/^src-/);
      expect(result.entities_created).toBeTypeOf('number');
      expect(result.claims_stored).toBeTypeOf('number');
      expect(result.citations_created).toBeTypeOf('number');

      // Should have created a Source node
      const createSourceCall = getCalls().find(c => c.query.includes('CREATE (s:Source'));
      expect(createSourceCall).toBeDefined();
    });

    it('reads from the provided source_path', async () => {
      mockReadFile.mockResolvedValue('Test content');
      const { driver } = createMockDriver();
      const service = new IngestionService(driver);

      await service.ingest({
        source_path: '/home/test/doc.md',
        source_type: 'note',
        project_tag: 'project:demo',
      });

      expect(mockReadFile).toHaveBeenCalledWith('/home/test/doc.md', 'utf-8');
    });

    it('throws when source file cannot be read', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'));
      const { driver } = createMockDriver();
      const service = new IngestionService(driver);

      await expect(service.ingest({
        source_path: '/nonexistent/file.md',
        source_type: 'article',
        project_tag: 'project:test',
      })).rejects.toThrow('Failed to read source file');
    });

    it('uses custom title when provided', async () => {
      mockReadFile.mockResolvedValue('No title in content.');
      const { driver, getCalls } = createMockDriver();
      const service = new IngestionService(driver);

      await service.ingest({
        source_path: '/tmp/doc.md',
        source_type: 'article',
        project_tag: 'project:test',
        title: 'Custom Title',
      });

      const createSourceCall = getCalls().find(c => c.query.includes('CREATE (s:Source'));
      const params = createSourceCall?.params as Record<string, unknown>;
      expect(params?.title).toBe('Custom Title');
    });

    it('auto-detects title from markdown H1', async () => {
      mockReadFile.mockResolvedValue('# My Great Article\n\nContent here.');
      const { driver, getCalls } = createMockDriver();
      const service = new IngestionService(driver);

      await service.ingest({
        source_path: '/tmp/doc.md',
        source_type: 'article',
        project_tag: 'project:test',
      });

      const createSourceCall = getCalls().find(c => c.query.includes('CREATE (s:Source'));
      const params = createSourceCall?.params as Record<string, unknown>;
      expect(params?.title).toBe('My Great Article');
    });

    it('falls back to filename when no title found', async () => {
      mockReadFile.mockResolvedValue('No heading here, just plain text.');
      const { driver, getCalls } = createMockDriver();
      const service = new IngestionService(driver);

      await service.ingest({
        source_path: '/tmp/my-document.md',
        source_type: 'article',
        project_tag: 'project:test',
      });

      const createSourceCall = getCalls().find(c => c.query.includes('CREATE (s:Source'));
      const params = createSourceCall?.params as Record<string, unknown>;
      expect(params?.title).toBe('my document');
    });
  });

  describe('ingest() -- entity processing', () => {
    it('creates entities from pre-extracted entity list', async () => {
      mockReadFile.mockResolvedValue('Content about entities.');
      const { driver, getCalls } = createMockDriver();
      const service = new IngestionService(driver);

      await service.ingest({
        source_path: '/tmp/doc.md',
        source_type: 'article',
        project_tag: 'project:test',
        entities: ['Redis', 'Neo4j', 'Docker'],
      });

      const entityCalls = getCalls().filter(c => c.query.includes('MERGE (e:Entity'));
      expect(entityCalls).toHaveLength(3);
    });

    it('links source to project entity', async () => {
      mockReadFile.mockResolvedValue('Content.');
      const { driver, getCalls } = createMockDriver();
      const service = new IngestionService(driver);

      await service.ingest({
        source_path: '/tmp/doc.md',
        source_type: 'article',
        project_tag: 'project:mars-fps',
      });

      const linkCall = getCalls().find(c => c.query.includes('HAS_SOURCE'));
      expect(linkCall).toBeDefined();
      const params = linkCall?.params as Record<string, unknown>;
      expect(params?.projectName).toBe('mars-fps');
    });
  });

  describe('ingest() -- claim processing', () => {
    it('creates semantic nodes from pre-extracted claims', async () => {
      mockReadFile.mockResolvedValue('Content.');
      const { driver, getCalls } = createMockDriver();
      const service = new IngestionService(driver);

      const result = await service.ingest({
        source_path: '/tmp/doc.md',
        source_type: 'article',
        project_tag: 'project:test',
        claims: [
          {
            content: 'Redis is used for caching',
            about: ['Redis'],
            confidence: 0.8,
            tags: ['architecture'],
          },
          {
            content: 'Neo4j stores the knowledge graph',
            about: ['Neo4j'],
            confidence: 0.9,
            tags: ['architecture'],
          },
        ],
      });

      expect(result.claims_stored).toBe(2);
      expect(result.citations_created).toBe(2);

      // Verify semantic nodes were created
      const semanticCalls = getCalls().filter(c => c.query.includes('CREATE (s:Semantic'));
      expect(semanticCalls).toHaveLength(2);

      // Verify CITES relationships
      const citesCalls = getCalls().filter(c => c.query.includes('CITES'));
      expect(citesCalls).toHaveLength(2);
    });

    it('applies global tags and project tag to all claims', async () => {
      mockReadFile.mockResolvedValue('Content.');
      const { driver, getCalls } = createMockDriver();
      const service = new IngestionService(driver);

      await service.ingest({
        source_path: '/tmp/doc.md',
        source_type: 'article',
        project_tag: 'project:test',
        tags: ['domain-tag'],
        claims: [
          {
            content: 'A claim',
            about: [],
            tags: ['claim-tag'],
          },
        ],
      });

      const semanticCall = getCalls().find(c => c.query.includes('CREATE (s:Semantic'));
      const params = semanticCall?.params as Record<string, unknown>;
      const tags = params?.tags as string[];
      expect(tags).toContain('claim-tag');
      expect(tags).toContain('domain-tag');
      expect(tags).toContain('project:test');
    });

    it('uses default confidence of 0.3 when not specified', async () => {
      mockReadFile.mockResolvedValue('Content.');
      const { driver, getCalls } = createMockDriver();
      const service = new IngestionService(driver);

      await service.ingest({
        source_path: '/tmp/doc.md',
        source_type: 'article',
        project_tag: 'project:test',
        claims: [{ content: 'A claim', about: [] }],
      });

      const semanticCall = getCalls().find(c => c.query.includes('CREATE (s:Semantic'));
      const params = semanticCall?.params as Record<string, unknown>;
      expect(params?.confidence).toBe(0.3);
    });

    it('creates ABOUT relationships for claim entity references', async () => {
      mockReadFile.mockResolvedValue('Content.');
      const { driver, getCalls } = createMockDriver();
      const service = new IngestionService(driver);

      await service.ingest({
        source_path: '/tmp/doc.md',
        source_type: 'article',
        project_tag: 'project:test',
        claims: [
          {
            content: 'Redis caches entity embeddings',
            about: ['Redis', 'Embeddings'],
          },
        ],
      });

      const aboutCalls = getCalls().filter(c => c.query.includes('ABOUT'));
      expect(aboutCalls).toHaveLength(2);
    });
  });

  describe('ingest() -- auto-extraction', () => {
    it('uses extractor when no pre-extracted claims are provided', async () => {
      mockReadFile.mockResolvedValue('Document about machine learning and neural networks.');
      const { driver } = createMockDriver();

      const mockExtractor: ExtractionProvider = {
        extractAll: vi.fn(async () => ({
          entities: [{ name: 'Machine Learning' }, { name: 'Neural Networks' }],
          claims: [
            {
              content: 'ML uses neural networks',
              about: ['Machine Learning', 'Neural Networks'],
              confidence: 0.5,
              tags: ['ml'],
            },
          ],
        })),
      } as unknown as ExtractionProvider;

      const service = new IngestionService(driver, mockExtractor);

      const result = await service.ingest({
        source_path: '/tmp/ml-doc.md',
        source_type: 'paper',
        project_tag: 'project:research',
      });

      expect(mockExtractor.extractAll).toHaveBeenCalled();
      expect(result.claims_stored).toBe(1);
    });

    it('does not use extractor when pre-extracted claims exist', async () => {
      mockReadFile.mockResolvedValue('Content.');
      const { driver } = createMockDriver();

      const mockExtractor: ExtractionProvider = {
        extractAll: vi.fn(),
      } as unknown as ExtractionProvider;

      const service = new IngestionService(driver, mockExtractor);

      await service.ingest({
        source_path: '/tmp/doc.md',
        source_type: 'article',
        project_tag: 'project:test',
        claims: [{ content: 'Pre-extracted claim', about: [] }],
      });

      expect(mockExtractor.extractAll).not.toHaveBeenCalled();
    });

    it('handles extractor failure gracefully (non-critical)', async () => {
      mockReadFile.mockResolvedValue('Content.');
      const { driver } = createMockDriver();

      const mockExtractor: ExtractionProvider = {
        extractAll: vi.fn(async () => { throw new Error('OpenAI rate limit'); }),
      } as unknown as ExtractionProvider;

      const service = new IngestionService(driver, mockExtractor);

      // Should not throw -- extraction failure is non-critical
      const result = await service.ingest({
        source_path: '/tmp/doc.md',
        source_type: 'article',
        project_tag: 'project:test',
      });

      expect(result.claims_stored).toBe(0);
    });
  });

  describe('ingest() -- result counting', () => {
    it('correctly counts entities created vs linked', async () => {
      mockReadFile.mockResolvedValue('Content.');
      let entityCallCount = 0;

      const mockSession = {
        run: vi.fn(async (query: string, params?: unknown) => {
          if (query.includes('MERGE (e:Entity')) {
            entityCallCount++;
            // First entity is "created", second is "existing"
            const created = entityCallCount === 1;
            return mockResult([mockRecord({ id: 'ent-mock', created })]);
          }
          if (query.includes('MATCH (e:Entity {name:')) {
            return mockResult([mockRecord({ id: 'ent-mock' })]);
          }
          return mockResult([]);
        }),
        close: vi.fn(async () => {}),
      } as unknown as Session;

      const driver = {
        session: vi.fn(() => mockSession),
      } as unknown as Driver;

      const service = new IngestionService(driver);

      const result = await service.ingest({
        source_path: '/tmp/doc.md',
        source_type: 'article',
        project_tag: 'project:test',
        entities: ['NewEntity', 'ExistingEntity'],
      });

      expect(result.entities_created + result.entities_linked).toBe(2);
    });

    it('returns zero counts when no entities or claims provided', async () => {
      mockReadFile.mockResolvedValue('Simple content.');
      const { driver } = createMockDriver();
      const service = new IngestionService(driver);

      const result = await service.ingest({
        source_path: '/tmp/doc.md',
        source_type: 'note',
        project_tag: 'project:test',
      });

      expect(result.claims_stored).toBe(0);
      expect(result.citations_created).toBe(0);
    });
  });
});
