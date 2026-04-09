// packages/wiki/src/__tests__/viewer.test.ts
// Tests for viewer utility functions (resolveWikilinks, escapeHtml).
// These functions are not exported, so we test them indirectly or re-implement
// the logic for unit testing. Since they are private, we test via the public API.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startWikiViewer, confineToDir } from '../viewer.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import type { Server } from 'node:http';

const testDir = join(tmpdir(), `amp-wiki-viewer-test-${Date.now()}`);
let server: Server | null = null;
const TEST_PORT = 39742; // High port unlikely to conflict

async function setupTestWiki(): Promise<void> {
  await mkdir(join(testDir, 'projects', 'test-project'), { recursive: true });
  await mkdir(join(testDir, 'library'), { recursive: true });
  await mkdir(join(testDir, 'topics'), { recursive: true });

  // Create portal index
  await writeFile(
    join(testDir, '_index.md'),
    '---\ntitle: Test Portal\n---\n\n# Test Portal\n\nWelcome to the test wiki.\n\nSee [[projects/test-project/_index|Test Project]].\n',
    'utf-8',
  );

  // Create a project index
  await writeFile(
    join(testDir, 'projects', 'test-project', '_index.md'),
    '---\nproject: test-project\ntags: [architecture, testing]\n---\n\n# Test Project\n\nA project for testing.\n',
    'utf-8',
  );

  // Create entity article
  await writeFile(
    join(testDir, 'projects', 'test-project', 'widget.md'),
    '---\nentity: widget\ntype: component\nconfidence: 0.85\n---\n\n# Widget\n\n## Architecture\n\nWidget uses reactive patterns.\n\n## History\n\nSome history here.\n',
    'utf-8',
  );

  // Library index
  await writeFile(
    join(testDir, 'library', '_index.md'),
    '---\ntitle: Source Library\n---\n\n# Source Library\n\nNo sources yet.\n',
    'utf-8',
  );

  // Topics index
  await writeFile(
    join(testDir, 'topics', '_index.md'),
    '---\ntitle: Topics\n---\n\n# Topics\n\nNo topics yet.\n',
    'utf-8',
  );
}

describe('WikiViewer', () => {
  beforeAll(async () => {
    await setupTestWiki();
    server = startWikiViewer({
      port: TEST_PORT,
      wiki_dir: testDir,
      project_tag: 'project:test',
    });
    // Give the server a moment to bind
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    await rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  it('redirects root to /wiki/_index', async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/wiki/_index');
  });

  it('serves the portal index page', async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/wiki/_index`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Test Portal');
    expect(html).toContain('AMP Wiki');
  });

  it('resolves [[wikilinks]] to HTML links', async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/wiki/_index`);
    const html = await res.text();
    // The [[projects/test-project/_index|Test Project]] should become an <a> tag
    expect(html).toContain('class="wikilink"');
    expect(html).toContain('Test Project');
    expect(html).toContain('/wiki/projects/test-project/_index');
  });

  it('serves entity article with frontmatter tags', async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/wiki/projects/test-project/widget`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Widget');
    expect(html).toContain('Architecture');
  });

  it('renders frontmatter tags as tag pills', async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/wiki/projects/test-project/_index`);
    const html = await res.text();
    expect(html).toContain('class="tag"');
    expect(html).toContain('architecture');
  });

  it('returns 404 for non-existent page', async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/wiki/nonexistent`);
    expect(res.status).toBe(404);
    const html = await res.text();
    expect(html).toContain('not found');
  });

  it('serves search page', async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/search`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Search');
  });

  it('search finds matching content', async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/search?q=reactive`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('reactive');
    expect(html).toContain('1 result(s)');
  });

  it('search returns no results for unknown query', async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/search?q=xyznonexistent123`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('No results found');
  });

  it('builds sidebar with project navigation', async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/wiki/_index`);
    const html = await res.text();
    expect(html).toContain('sidebar');
    expect(html).toContain('Projects');
    expect(html).toContain('test project'); // slugged to readable
  });

  it('returns 404 for unknown routes', async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/unknown/route`);
    expect(res.status).toBe(404);
  });

  // ─── Path traversal protection ───────────────────────────────────────────

  describe('path traversal protection — /wiki/', () => {
    it('blocks basic traversal ../../etc/passwd', async () => {
      const res = await fetch(`http://localhost:${TEST_PORT}/wiki/../../etc/passwd`);
      expect(res.status).toBe(404);
      const html = await res.text();
      expect(html).not.toContain('root:');
    });

    it('blocks URL-encoded traversal ..%2F..%2Fetc%2Fpasswd', async () => {
      const res = await fetch(`http://localhost:${TEST_PORT}/wiki/..%2F..%2Fetc%2Fpasswd`);
      expect(res.status).toBe(404);
      const html = await res.text();
      expect(html).not.toContain('root:');
    });

    it('blocks double-encoded traversal ..%252F..%252F', async () => {
      const res = await fetch(`http://localhost:${TEST_PORT}/wiki/..%252F..%252Fetc%252Fpasswd`);
      expect(res.status).toBe(404);
    });

    it('blocks null byte injection ..%00.md', async () => {
      const res = await fetch(`http://localhost:${TEST_PORT}/wiki/..%2F..%00.md`);
      expect(res.status).toBe(404);
    });

    it('blocks traversal with valid prefix: projects/../../etc/passwd', async () => {
      const res = await fetch(`http://localhost:${TEST_PORT}/wiki/projects/../../etc/passwd`);
      expect(res.status).toBe(404);
    });

    it('blocks deeply nested traversal', async () => {
      const res = await fetch(`http://localhost:${TEST_PORT}/wiki/a/b/c/../../../../etc/passwd`);
      expect(res.status).toBe(404);
    });

    it('normal wiki pages still load correctly', async () => {
      const res = await fetch(`http://localhost:${TEST_PORT}/wiki/projects/test-project/widget`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('Widget');
    });

    it('normal subdirectory _index pages still load', async () => {
      const res = await fetch(`http://localhost:${TEST_PORT}/wiki/projects/test-project/_index`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('Test Project');
    });
  });

  describe('path traversal protection — /api/graph/', () => {
    it('blocks basic traversal', async () => {
      const res = await fetch(`http://localhost:${TEST_PORT}/api/graph/../../etc/passwd`);
      const status = res.status;
      expect(status === 403 || status === 404).toBe(true);
    });

    it('blocks URL-encoded traversal', async () => {
      const res = await fetch(`http://localhost:${TEST_PORT}/api/graph/..%2F..%2Fetc%2Fpasswd`);
      expect(res.status).toBe(403);
    });

    it('blocks null byte in graph path', async () => {
      const res = await fetch(`http://localhost:${TEST_PORT}/api/graph/..%2F..%00.json`);
      expect(res.status).toBe(403);
    });

    it('blocks traversal with valid-looking prefix', async () => {
      const res = await fetch(`http://localhost:${TEST_PORT}/api/graph/data/../../../etc/passwd`);
      const status = res.status;
      expect(status === 403 || status === 404).toBe(true);
    });
  });
});

// ─── confineToDir unit tests ──────────────────────────────────────────────────

describe('confineToDir', () => {
  const baseDir = '/home/wiki/data';

  it('allows a safe relative path', () => {
    const result = confineToDir(baseDir, 'pages/test.md');
    expect(result).toBe(`${baseDir}/pages/test.md`);
  });

  it('allows the base directory itself', () => {
    const result = confineToDir(baseDir, '.');
    expect(result).toBe('/home/wiki/data');
  });

  it('rejects parent traversal with ../', () => {
    expect(confineToDir(baseDir, '../../etc/passwd')).toBeNull();
  });

  it('rejects traversal that normalizes outside', () => {
    expect(confineToDir(baseDir, 'pages/../../etc/passwd')).toBeNull();
  });

  it('rejects absolute path outside baseDir', () => {
    expect(confineToDir(baseDir, '/etc/passwd')).toBeNull();
  });

  it('rejects null bytes', () => {
    expect(confineToDir(baseDir, 'test\0.md')).toBeNull();
    expect(confineToDir(baseDir, '../..\0/etc/passwd')).toBeNull();
  });

  it('rejects prefix trick (baseDir-evil)', () => {
    // /home/wiki/data-evil starts with /home/wiki/data but is not inside it
    expect(confineToDir('/home/wiki/data', '../data-evil/payload')).toBeNull();
  });

  it('allows deeply nested safe path', () => {
    const result = confineToDir(baseDir, 'a/b/c/d/e.md');
    expect(result).toBe(`${baseDir}/a/b/c/d/e.md`);
  });

  it('allows path with dot segments that resolve safely', () => {
    const result = confineToDir(baseDir, 'a/./b/../b/c.md');
    expect(result).toBe(`${baseDir}/a/b/c.md`);
  });

  it('rejects path that escapes after multiple levels', () => {
    expect(confineToDir(baseDir, 'a/b/c/../../../../etc/passwd')).toBeNull();
  });
});
