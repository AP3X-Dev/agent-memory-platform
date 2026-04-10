// packages/mcp/src/__tests__/ingest-codebase.test.ts
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  buildToolHandlers,
  setServiceInstances,
  type IAMPService,
  type IConsolidationEngine,
  type IScopedQuery,
  type IBootstrapGraphService,
  type IMemoryBlockService,
  type ICodeIndexerService,
} from '../tools.js';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockAmpService: IAMPService = {
  load: vi.fn().mockResolvedValue({ markdown: '', tokens: 0, sources: [], assembled_at: '' }),
  store: vi.fn().mockResolvedValue({ id: 'ep-1', duplicate: false }),
};

const mockConsolidationEngine: IConsolidationEngine = {
  run: vi.fn().mockResolvedValue({}),
  status: vi.fn().mockResolvedValue({}),
  review: vi.fn().mockResolvedValue({}),
  apply: vi.fn().mockResolvedValue({ applied: true }),
};

const mockScopedQuery: IScopedQuery = {
  rawCypher: vi.fn().mockResolvedValue([]),
};

const mockBootstrapService: IBootstrapGraphService = {
  bootstrap: vi.fn().mockResolvedValue({
    entities_created: 5,
    entities_existing: 0,
    agents_created: 1,
    agents_existing: 0,
    semantics_created: 2,
    relationships_created: 4,
    project_entity_id: 'ent-test',
  }),
  isBootstrapped: vi.fn().mockResolvedValue(false),
  status: vi.fn().mockResolvedValue({ bootstrapped: false }),
};

const mockMemoryBlockService: IMemoryBlockService = {
  read: vi.fn().mockResolvedValue(null),
  insert: vi.fn().mockResolvedValue({ id: 'b-1', name: 'test', tier: 'core', content: '', scope: '' }),
  replace: vi.fn().mockResolvedValue({ id: 'b-1', name: 'test', tier: 'core', content: '', scope: '' }),
  rewrite: vi.fn().mockResolvedValue({ id: 'b-1', name: 'test', tier: 'core', content: '', scope: '' }),
  promote: vi.fn().mockResolvedValue({ id: 'b-1', name: 'test', tier: 'core', content: '', scope: '' }),
  archive: vi.fn().mockResolvedValue(''),
};

const mockCodeIndexer: ICodeIndexerService = {
  indexProject: vi.fn().mockResolvedValue({
    files_parsed: 10,
    files_skipped: 2,
    symbols_created: 50,
    symbols_updated: 0,
    relations_created: 30,
    errors: [],
  }),
};

// ─── Temp project ─────────────────────────────────────────────────────────────

let tempDir: string;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'amp-ingest-test-'));

  await writeFile(
    join(tempDir, 'package.json'),
    JSON.stringify({
      name: 'my-test-app',
      description: 'A test application',
      dependencies: { react: '^18.0.0' },
    }),
  );

  await mkdir(join(tempDir, 'src'), { recursive: true });
  await writeFile(join(tempDir, 'src', 'index.ts'), 'export const main = () => {};\n');
  await writeFile(join(tempDir, 'src', 'app.ts'), 'export class App {}\n');
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  setServiceInstances({
    ampService: mockAmpService,
    consolidationEngine: mockConsolidationEngine,
    scopedQuery: mockScopedQuery,
    bootstrapService: mockBootstrapService,
    memoryBlockService: mockMemoryBlockService,
    codeIndexer: mockCodeIndexer,
  });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('amp_ingest_codebase handler', () => {
  it('scans, bootstraps, indexes, and seeds in one call', async () => {
    const handlers = buildToolHandlers();
    const result = await handlers.amp_ingest_codebase({ path: tempDir });

    // Should have called bootstrap
    expect(mockBootstrapService.bootstrap).toHaveBeenCalledTimes(1);
    const bootstrapArgs = (mockBootstrapService.bootstrap as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(bootstrapArgs.project_name).toBe('my-test-app');
    expect(bootstrapArgs.project_tag).toBe('project:my-test-app');
    expect(bootstrapArgs.description).toBe('A test application');

    // Should have called code indexer
    expect(mockCodeIndexer.indexProject).toHaveBeenCalledTimes(1);

    // Should have seeded memory blocks
    expect(mockMemoryBlockService.insert).toHaveBeenCalledTimes(2);

    // Should return summary markdown
    const text = result.content[0].text;
    expect(text).toContain('Codebase Ingestion Complete');
    expect(text).toContain('my-test-app');
    expect(text).toContain('project:my-test-app');
    expect(text).toContain('Files indexed:** 10');
    expect(text).toContain('Symbols created:** 50');
  });

  it('uses user-provided overrides over auto-detection', async () => {
    const handlers = buildToolHandlers();
    await handlers.amp_ingest_codebase({
      path: tempDir,
      project_name: 'custom-name',
      project_tag: 'project:custom',
      description: 'Custom description',
      domain: 'custom-domain',
    });

    const bootstrapArgs = (mockBootstrapService.bootstrap as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(bootstrapArgs.project_name).toBe('custom-name');
    expect(bootstrapArgs.project_tag).toBe('project:custom');
    expect(bootstrapArgs.description).toBe('Custom description');
    expect(bootstrapArgs.domain).toBe('custom-domain');
  });

  it('passes exclude patterns to code indexer', async () => {
    const handlers = buildToolHandlers();
    await handlers.amp_ingest_codebase({
      path: tempDir,
      exclude_patterns: ['vendor', 'generated'],
    });

    expect(mockCodeIndexer.indexProject).toHaveBeenCalledWith(
      tempDir,
      { exclude: ['vendor', 'generated'] },
    );
  });

  it('works without code indexer (graceful degradation)', async () => {
    // Set up without code indexer
    setServiceInstances({
      ampService: mockAmpService,
      consolidationEngine: mockConsolidationEngine,
      scopedQuery: mockScopedQuery,
      bootstrapService: mockBootstrapService,
      memoryBlockService: mockMemoryBlockService,
      // No codeIndexer
    });

    const handlers = buildToolHandlers();
    const result = await handlers.amp_ingest_codebase({ path: tempDir });

    // Should still bootstrap
    expect(mockBootstrapService.bootstrap).toHaveBeenCalledTimes(1);

    // Should return summary with zero index counts
    const text = result.content[0].text;
    expect(text).toContain('Files indexed:** 0');
    expect(text).toContain('Symbols created:** 0');
  });

  it('works without memory block service', async () => {
    setServiceInstances({
      ampService: mockAmpService,
      consolidationEngine: mockConsolidationEngine,
      scopedQuery: mockScopedQuery,
      bootstrapService: mockBootstrapService,
      codeIndexer: mockCodeIndexer,
      // No memoryBlockService
    });

    const handlers = buildToolHandlers();
    const result = await handlers.amp_ingest_codebase({ path: tempDir });

    const text = result.content[0].text;
    expect(text).toContain('Memory blocks seeded:** 0');
  });

  it('generates correct project tag from name with special characters', async () => {
    const handlers = buildToolHandlers();
    await handlers.amp_ingest_codebase({
      path: tempDir,
      project_name: 'My Cool Project!',
    });

    const bootstrapArgs = (mockBootstrapService.bootstrap as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(bootstrapArgs.project_tag).toBe('project:my-cool-project-');
  });

  it('throws when bootstrap service is not initialised', async () => {
    setServiceInstances({
      ampService: mockAmpService,
      consolidationEngine: mockConsolidationEngine,
      scopedQuery: mockScopedQuery,
      bootstrapService: null as unknown as IBootstrapGraphService,
    });

    const handlers = buildToolHandlers();
    await expect(handlers.amp_ingest_codebase({ path: tempDir })).rejects.toThrow(
      'BootstrapGraphService not initialised',
    );
  });

  it('includes indexing errors in the summary', async () => {
    (mockCodeIndexer.indexProject as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      files_parsed: 8,
      files_skipped: 4,
      symbols_created: 30,
      symbols_updated: 0,
      relations_created: 20,
      errors: [
        { file: 'broken.ts', error: 'Syntax error' },
        { file: 'bad.ts', error: 'Parse failed' },
      ],
    });

    const handlers = buildToolHandlers();
    const result = await handlers.amp_ingest_codebase({ path: tempDir });

    const text = result.content[0].text;
    expect(text).toContain('Indexing errors:** 2');
    expect(text).toContain('broken.ts: Syntax error');
    expect(text).toContain('bad.ts: Parse failed');
  });

  it('creates semantic seeds for description and languages', async () => {
    const handlers = buildToolHandlers();
    await handlers.amp_ingest_codebase({ path: tempDir });

    const bootstrapArgs = (mockBootstrapService.bootstrap as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(bootstrapArgs.semantic_seeds.length).toBeGreaterThanOrEqual(2);

    const descSeed = bootstrapArgs.semantic_seeds.find(
      (s: { claim: string }) => s.claim === 'A test application',
    );
    expect(descSeed).toBeDefined();
    expect(descSeed.domain).toBe('project-overview');

    const langSeed = bootstrapArgs.semantic_seeds.find(
      (s: { claim: string }) => s.claim.includes('built with'),
    );
    expect(langSeed).toBeDefined();
    expect(langSeed.domain).toBe('technology');
  });
});
