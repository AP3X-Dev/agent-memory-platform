// packages/mcp/src/__tests__/boot-smoke.test.ts
// Regression smoke test: bootstrap() wires every service such that every
// registered tool handler can be invoked without throwing "X not initialised".
//
// Original bug: berry_lint threw "WikiLinter not initialised" because
// setWikiServiceInstances was never called from bootstrap.ts. Same class of
// bug could affect other handlers if a future refactor drops a setter call.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BootstrapHandles } from '../bootstrap.js';

const hasInfra = !!process.env['NEO4J_URI'] && !!process.env['REDIS_URL'];

describe.skipIf(!hasInfra)('bootstrap() boot smoke', () => {
  let handles: BootstrapHandles;
  let coreHandlers: import('../tools.js').ToolHandlers;
  let wikiHandlers: import('@memberry/wiki').WikiToolHandlers;
  let tmpDir: string;
  let tmpOutputDir: string;
  let originalAllowDir: string | undefined;

  beforeAll(async () => {
    // berry_compile and berry_ingest validate paths against AMP_INGEST_ALLOW_DIR
    // (or process.cwd() if unset). We point allow-dir at a tmp dir so the
    // tests can never write into a package directory or the repo root.
    tmpDir = mkdtempSync(join(tmpdir(), 'amp-boot-smoke-'));
    tmpOutputDir = join(tmpDir, 'wiki-out');
    originalAllowDir = process.env['AMP_INGEST_ALLOW_DIR'];
    process.env['AMP_INGEST_ALLOW_DIR'] = tmpDir;

    const { bootstrap } = await import('../bootstrap.js');
    const { buildToolHandlers } = await import('../tools.js');
    const { buildWikiToolHandlers } = await import('@memberry/wiki');

    handles = await bootstrap();
    coreHandlers = buildToolHandlers();
    wikiHandlers = buildWikiToolHandlers();
  }, 60000);

  afterAll(async () => {
    if (handles) await handles.shutdown();
    if (originalAllowDir === undefined) delete process.env['AMP_INGEST_ALLOW_DIR'];
    else process.env['AMP_INGEST_ALLOW_DIR'] = originalAllowDir;
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('bootstrap() resolves without throwing', () => {
    expect(handles).toBeDefined();
    expect(typeof handles.shutdown).toBe('function');
  });

  // Each test below ensures the handler is callable. We don't validate the
  // returned content shape — we only assert the handler does NOT throw an
  // "X not initialised" error, which would mean a setter wasn't called.
  // Real Neo4j errors (bad params, etc.) are fine — those mean the wiring
  // is correct and the handler reached the underlying service.

  async function expectNotInitialiseError(fn: () => Promise<unknown>): Promise<void> {
    let err: unknown = null;
    try {
      await fn();
    } catch (e) {
      err = e;
    }
    if (err instanceof Error) {
      expect(err.message).not.toMatch(/not initialised/i);
    }
  }

  it('berry_load handler is wired', async () => {
    await expectNotInitialiseError(() =>
      coreHandlers.berry_load({
        task: 'boot smoke',
        tags: ['project:__boot_smoke__'],
        max_tokens: 200,
      }),
    );
  });

  it('berry_store handler is wired', async () => {
    await expectNotInitialiseError(() =>
      coreHandlers.berry_store({
        session_id: `boot-smoke-${Date.now()}`,
        task: '[project:__boot_smoke__] boot smoke task',
        content: '[project:__boot_smoke__] boot smoke content; do not consolidate',
        outcome: 'approved',
        tags: ['project:__boot_smoke__'],
        entities: [],
      }),
    );
  });

  it('berry_grep handler is wired', async () => {
    await expectNotInitialiseError(() =>
      coreHandlers.berry_grep({
        pattern: '__boot_smoke_no_match__',
        limit: 1,
      }),
    );
  });

  it('berry_compile handler is wired (writes to isolated tmp dir)', async () => {
    await expectNotInitialiseError(() =>
      wikiHandlers.berry_compile({
        project_tag: 'project:__boot_smoke__',
        output_dir: tmpOutputDir,
        emit_graph: false,
      }),
    );
  });

  it('berry_ingest handler is wired', async () => {
    // Create a tiny note inside the allow-dir so validatePath accepts it.
    // The ingestion may or may not produce findings — we only care that the
    // service is wired (no "IngestionService not initialised").
    const notePath = join(tmpDir, 'boot-smoke-note.md');
    writeFileSync(notePath, '# Boot Smoke\n\nNothing to see here.\n', 'utf-8');

    await expectNotInitialiseError(() =>
      wikiHandlers.berry_ingest({
        source_path: notePath,
        source_type: 'note',
        project_tag: 'project:__boot_smoke__',
      }),
    );
  });

  it('berry_lint handler is wired (regression: WikiLinter not initialised)', async () => {
    // This is THE regression case. Before the bootstrap.ts fix that wired
    // setWikiServiceInstances, this call threw "WikiLinter not initialised".
    await expectNotInitialiseError(() =>
      wikiHandlers.berry_lint({
        project_tag: 'project:__boot_smoke__',
        checks: ['orphan_pages'],
      }),
    );
  });
});
