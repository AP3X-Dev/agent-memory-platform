// packages/wiki/src/__tests__/viewer.test.ts
// Tests for viewer utility functions (resolveWikilinks, escapeHtml).
// These functions are not exported, so we test them indirectly or re-implement
// the logic for unit testing. Since they are private, we test via the public API.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startWikiViewer, confineToDir, resetViewerCache } from '../viewer.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import type { Server } from 'node:http';

const testDir = join(tmpdir(), `amp-wiki-viewer-test-${Date.now()}`);
let server: Server | null = null;
const TEST_PORT = 39742; // High port unlikely to conflict

async function setupTestWiki(): Promise<void> {
  await mkdir(join(testDir, 'projects', 'test-project'), { recursive: true });
  await mkdir(join(testDir, 'projects', 'other-project'), { recursive: true });
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

  await writeFile(
    join(testDir, 'projects', 'other-project', '_index.md'),
    '---\nproject: other-project\ntags: [testing]\n---\n\n# Other Project\n\nAnother project for search filtering.\n',
    'utf-8',
  );

  // Create entity article
  await writeFile(
    join(testDir, 'projects', 'test-project', 'widget.md'),
    '---\nentity: widget\ntype: component\nconfidence: 0.85\n---\n\n# Widget\n\n## Architecture\n\nWidget uses reactive patterns. SharedToken belongs to test-project.\n\n## History\n\nSome history here.\n',
    'utf-8',
  );

  await writeFile(
    join(testDir, 'projects', 'other-project', 'other-widget.md'),
    '---\nentity: other-widget\ntype: component\nconfidence: 0.75\n---\n\n# Other Widget\n\nSharedToken belongs to other-project.\n',
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

  await writeFile(
    join(testDir, 'topics', 'concurrency.md'),
    [
      '---',
      'title: concurrency',
      '---',
      '',
      '# concurrency',
      '',
      '## [[projects/test-project/_index|Test Project]]',
      '',
      'Concurrency notes for Test Project.',
      '',
      '## Related Topics',
      '',
      'See [[topics/testing|testing]].',
      '',
    ].join('\n'),
    'utf-8',
  );
}

describe('WikiViewer', () => {
  beforeAll(async () => {
    await setupTestWiki();
    server = await startWikiViewer({
      port: TEST_PORT,
      wiki_dir: testDir,
      project_tag: 'project:test',
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    resetViewerCache();
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
    expect(html).toContain('MemBerry Wiki');
  });

  it('renders the MemBerry branded header and serves the logo asset', async () => {
    const page = await fetch(`http://localhost:${TEST_PORT}/wiki/_index`);
    const html = await page.text();
    expect(html).toContain('src="/assets/memberry-logo.png"');
    expect(html).toContain('<span class="title-mem">Mem</span><span class="title-berry">Berry</span>');
    expect(html).toContain('--accent: #9b35ff;');
    expect(html).toContain('.hero-aurora {');
    expect(html).toContain('--hero-legacy-bg:');
    expect(html).toContain('--hero-left-scrim:');
    expect(html).toContain('.graph .node-logo');
    expect(html).toContain('.graph svg { display: block; width: 100%; height: 676px;');
    expect(html).toContain('body.graph-modal-open { overflow: hidden; }');
    expect(html).toContain('.graph-wrap[open] {');
    expect(html).toContain('position: fixed;');
    expect(html).toContain('.graph-wrap[open] .graph svg { height: calc(100vh - 56px); }');

    const logo = await fetch(`http://localhost:${TEST_PORT}/assets/memberry-logo.png`);
    expect(logo.status).toBe(200);
    expect(logo.headers.get('content-type')).toContain('image/png');
    const bytes = new Uint8Array(await logo.arrayBuffer());
    expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

    const logoHead = await fetch(`http://localhost:${TEST_PORT}/assets/memberry-logo.png`, { method: 'HEAD' });
    expect(logoHead.status).toBe(200);
    expect(logoHead.headers.get('content-type')).toContain('image/png');
  });

  it('renders ops graph nodes with the MemBerry logo asset', async () => {
    const opsDir = join(tmpdir(), `amp-wiki-ops-graph-test-${Date.now()}`);
    const opsPort = TEST_PORT + 1;
    let opsServer: Server | null = null;

    try {
      await mkdir(opsDir, { recursive: true });
      await writeFile(
        join(opsDir, '_index.md'),
        [
          '# MemBerry Portal',
          '',
          '**2** projects · **15** entities · **32** semantic facts · **5** session entries · **4** sources',
          '',
          '| Project | Entities | Facts | Sessions | Last Activity |',
          '| --- | ---: | ---: | ---: | --- |',
          '| [[projects/alpha/_index|Alpha]] | 10 | 20 | 3 | 2026-06-07 |',
          '| [[projects/beta/_index|Beta]] | 5 | 12 | 2 | 2026-06-06 |',
          '',
        ].join('\n'),
        'utf-8',
      );

      opsServer = await startWikiViewer({
        port: opsPort,
        wiki_dir: opsDir,
        project_tag: 'project:test',
      });

      const res = await fetch(`http://localhost:${opsPort}/wiki/_index`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('2 nodes · full view');
      expect(html).toContain('<image class="node-logo" href="/assets/memberry-logo.png"');
      expect(html).toContain('width="56" height="56"');
      expect(html).toContain('preserveAspectRatio="xMidYMid meet"');
      expect(html).toContain("if (e.key === 'Escape' && graphWrap.open) graphWrap.open = false;");
      expect(html).not.toContain('dominant-baseline="central" style="user-select:none;"');
    } finally {
      if (opsServer) {
        await new Promise<void>((resolve) => opsServer!.close(() => resolve()));
      }
      resetViewerCache();
      await rm(opsDir, { recursive: true, force: true }).catch(() => {});
    }
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
    expect(html).toContain('1 HITS');
  });

  it('search matches multi-term queries when terms are separated in the page', async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/search?q=reactive+history`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Widget');
    expect(html).toContain('1 HITS');
  });

  it('search returns no results for unknown query', async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/search?q=xyznonexistent123`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('No results found');
  });

  it('search ranks title matches ahead of incidental body matches', async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/search?q=Test+Project`);
    expect(res.status).toBe(200);
    const html = await res.text();
    const firstResult = html.match(/<a class="result" href="([^"]+)">[\s\S]*?<div class="title">([^<]+)<\/div>/);
    expect(firstResult?.[1]).toBe('/wiki/projects/test-project/_index');
    expect(firstResult?.[2]).toBe('Test Project');
  });

  it('search filters results by project slug', async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/search?q=SharedToken&project=test-project`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Widget');
    expect(html).toContain('1 HITS');
    expect(html).not.toContain('Other Widget');
  });

  it('renders project breadcrumbs and scoped search controls on project pages', async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/wiki/projects/test-project/widget`);
    expect(res.status).toBe(200);
    const html = await res.text();

    expect(html).toContain('<div class="project-context">');
    expect(html).toContain('<a href="/wiki/_index">PORTAL</a>');
    expect(html).toContain('<a href="/wiki/projects/test-project/_index">Test Project</a>');
    expect(html).toContain('<span class="here">Widget</span>');
    expect(html).toContain('href="/wiki/projects/test-project/_graph"');
    expect(html).toContain('name="project" value="test-project"');
    expect(html).toContain('placeholder="Search Test Project"');
  });

  it('shows project filter context and a clear path on filtered search pages', async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/search?q=SharedToken&project=test-project`);
    expect(res.status).toBe(200);
    const html = await res.text();

    expect(html).toContain('<a href="/wiki/projects/test-project/_index">Test Project</a>');
    expect(html).toContain('<span class="filter-pill">PROJECT: Test Project</span>');
    expect(html).toContain('<a class="clear-filter" href="/search?q=SharedToken">CLEAR</a>');
  });

  it('renders topic sidebar headings with readable labels and matching anchors', async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/wiki/topics/concurrency`);
    expect(res.status).toBe(200);
    const html = await res.text();

    expect(html).toContain('<li><a href="#test-project">Test Project</a></li>');
    expect(html).toContain('<h2 id="test-project"><a href="/wiki/projects/test-project/_index" class="wikilink">Test Project</a></h2>');
    expect(html).toContain('<li><a href="#related-topics">Related Topics</a></li>');
    expect(html).toContain('<h2 id="related-topics">Related Topics</h2>');
    expect(html).not.toContain('[[projects/test-project/_index|Test Project]]');
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

// ─── Cache behavior tests ─────────────────────────────────────────────────────

describe('WikiViewer cache', () => {
  const cacheTestDir = join(tmpdir(), `amp-wiki-cache-test-${Date.now()}`);
  let cacheServer: Server | null = null;
  const CACHE_PORT = 39743;

  async function setupCacheTestWiki(): Promise<void> {
    await mkdir(join(cacheTestDir, 'projects', 'alpha'), { recursive: true });
    await mkdir(join(cacheTestDir, 'library'), { recursive: true });
    await mkdir(join(cacheTestDir, 'topics'), { recursive: true });

    await writeFile(
      join(cacheTestDir, '_index.md'),
      '---\ntitle: Cache Test\n---\n\n# Cache Test Portal\n\nWelcome.\n',
      'utf-8',
    );
    await writeFile(
      join(cacheTestDir, 'projects', 'alpha', '_index.md'),
      '---\nproject: alpha\n---\n\n# Alpha Project\n\nAlpha content.\n',
      'utf-8',
    );
    await writeFile(
      join(cacheTestDir, 'library', '_index.md'),
      '---\ntitle: Library\n---\n\n# Library\n\nNo sources.\n',
      'utf-8',
    );
    await writeFile(
      join(cacheTestDir, 'topics', '_index.md'),
      '---\ntitle: Topics\n---\n\n# Topics\n\nNo topics.\n',
      'utf-8',
    );
  }

  beforeAll(async () => {
    resetViewerCache();
    await setupCacheTestWiki();
    cacheServer = await startWikiViewer({
      port: CACHE_PORT,
      wiki_dir: cacheTestDir,
      project_tag: 'project:cache-test',
    });
    // Give cache time to build
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  afterAll(async () => {
    if (cacheServer) {
      await new Promise<void>((resolve) => cacheServer!.close(() => resolve()));
    }
    resetViewerCache();
    await rm(cacheTestDir, { recursive: true, force: true }).catch(() => {});
  });

  it('sidebar is consistent across multiple requests (cached)', async () => {
    const res1 = await fetch(`http://localhost:${CACHE_PORT}/wiki/_index`);
    const html1 = await res1.text();

    const res2 = await fetch(`http://localhost:${CACHE_PORT}/wiki/_index`);
    const html2 = await res2.text();

    const sidebarRegex = /<aside class="sidebar">([\s\S]*?)<\/aside>/;
    const sidebar1 = html1.match(sidebarRegex)?.[1];
    const sidebar2 = html2.match(sidebarRegex)?.[1];

    expect(sidebar1).toBeTruthy();
    expect(sidebar1).toBe(sidebar2);
  });

  it('search returns results from cached index without rescanning', async () => {
    const res = await fetch(`http://localhost:${CACHE_PORT}/search?q=Alpha`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Alpha');
    expect(html).toContain('1 HITS');
  });

  it('POST /api/refresh rebuilds the cache', async () => {
    // Add a new file
    await writeFile(
      join(cacheTestDir, 'projects', 'alpha', 'new-entity.md'),
      '---\nentity: new-entity\n---\n\n# New Entity\n\nFreshly added content for refresh test.\n',
      'utf-8',
    );

    // Search should NOT find it yet (old cache)
    const resBefore = await fetch(`http://localhost:${CACHE_PORT}/search?q=Freshly+added`);
    const htmlBefore = await resBefore.text();
    expect(htmlBefore).toContain('No results found');

    // Trigger manual refresh
    const refreshRes = await fetch(`http://localhost:${CACHE_PORT}/api/refresh`, { method: 'POST' });
    expect(refreshRes.status).toBe(200);
    const refreshJson = await refreshRes.json();
    expect(refreshJson.ok).toBe(true);
    expect(refreshJson.files).toBeGreaterThan(0);

    // Now search should find the new content
    const resAfter = await fetch(`http://localhost:${CACHE_PORT}/search?q=Freshly+added`);
    const htmlAfter = await resAfter.text();
    expect(htmlAfter).toContain('New Entity');
    expect(htmlAfter).toContain('1 HITS');
  });

  it('POST /api/refresh updates the sidebar when new projects appear', async () => {
    // Create a new project directory
    await mkdir(join(cacheTestDir, 'projects', 'beta'), { recursive: true });
    await writeFile(
      join(cacheTestDir, 'projects', 'beta', '_index.md'),
      '---\nproject: beta\n---\n\n# Beta Project\n\nBeta content.\n',
      'utf-8',
    );

    // Sidebar should not have beta yet
    const resBefore = await fetch(`http://localhost:${CACHE_PORT}/wiki/_index`);
    const htmlBefore = await resBefore.text();
    expect(htmlBefore).not.toContain('beta');

    // Refresh cache
    await fetch(`http://localhost:${CACHE_PORT}/api/refresh`, { method: 'POST' });

    // Now sidebar should include beta
    const resAfter = await fetch(`http://localhost:${CACHE_PORT}/wiki/_index`);
    const htmlAfter = await resAfter.text();
    expect(htmlAfter).toContain('beta');
  });

  it('cache auto-rebuilds when markdown files change (fs.watch)', async () => {
    // Write a new file and wait for debounced rebuild
    await writeFile(
      join(cacheTestDir, 'projects', 'alpha', 'watched-entity.md'),
      '---\nentity: watched\n---\n\n# Watched Entity\n\nContent added by fs watcher test.\n',
      'utf-8',
    );

    // Wait for debounce (500ms) + rebuild time
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Search should find the new content after auto-rebuild
    const res = await fetch(`http://localhost:${CACHE_PORT}/search?q=watcher+test`);
    const html = await res.text();
    expect(html).toContain('Watched Entity');
  });

  it('GET /api/refresh returns 404 (must be POST)', async () => {
    const res = await fetch(`http://localhost:${CACHE_PORT}/api/refresh`);
    expect(res.status).toBe(404);
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

// ─── startWikiViewer startup error handling ─────────────────────────────────

describe('startWikiViewer startup', () => {
  const startupTestDir = join(tmpdir(), `amp-wiki-startup-test-${Date.now()}`);
  const STARTUP_PORT = 39844;

  beforeAll(async () => {
    await mkdir(startupTestDir, { recursive: true });
    await writeFile(
      join(startupTestDir, '_index.md'),
      '---\ntitle: Test\n---\n\n# Test\n',
      'utf-8',
    );
  });

  afterAll(async () => {
    resetViewerCache();
    await rm(startupTestDir, { recursive: true, force: true }).catch(() => {});
  });

  it('resolves with a Server on successful bind', async () => {
    const srv = await startWikiViewer({
      port: STARTUP_PORT,
      wiki_dir: startupTestDir,
      project_tag: 'project:test',
    });
    try {
      expect(srv).toBeDefined();
      expect(srv.listening).toBe(true);
    } finally {
      await new Promise<void>((resolve) => srv.close(() => resolve()));
    }
  });

  it('rejects with EADDRINUSE when port is already bound', async () => {
    // Bind the port with a first server
    const first = await startWikiViewer({
      port: STARTUP_PORT,
      wiki_dir: startupTestDir,
      project_tag: 'project:test',
    });
    try {
      // Attempt to bind the same port — should reject
      await expect(
        startWikiViewer({
          port: STARTUP_PORT,
          wiki_dir: startupTestDir,
          project_tag: 'project:test',
        }),
      ).rejects.toThrow(/EADDRINUSE/);
    } finally {
      await new Promise<void>((resolve) => first.close(() => resolve()));
    }
  });

  it('returned server can be closed cleanly', async () => {
    const srv = await startWikiViewer({
      port: STARTUP_PORT,
      wiki_dir: startupTestDir,
      project_tag: 'project:test',
    });
    expect(srv.listening).toBe(true);
    await new Promise<void>((resolve) => srv.close(() => resolve()));
    expect(srv.listening).toBe(false);
  });
});
