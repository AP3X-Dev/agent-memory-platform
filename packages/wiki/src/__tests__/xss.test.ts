// packages/wiki/src/__tests__/xss.test.ts
// Tests for XSS prevention in the wiki viewer.
// Covers: escapeHtml, sanitizeHtml, wikilink escaping, and integration tests
// verifying that malicious content in markdown files is neutralized.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { escapeHtml, sanitizeHtml } from '../viewer.js';
import { startWikiViewer } from '../viewer.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Server } from 'node:http';

// ─── Unit tests: escapeHtml ─────────────────────────────────────────────────

describe('escapeHtml', () => {
  it('escapes ampersands', () => {
    expect(escapeHtml('a&b')).toBe('a&amp;b');
  });

  it('escapes angle brackets', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('" onclick="alert(1)"')).toBe('&quot; onclick=&quot;alert(1)&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("' onmouseover='alert(1)'")).toBe('&#x27; onmouseover=&#x27;alert(1)&#x27;');
  });

  it('escapes all dangerous chars in one string', () => {
    const input = `<img src="x" onerror='alert(1)'>&`;
    const result = escapeHtml(input);
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
    expect(result).not.toContain('"');
    expect(result).not.toContain("'");
    // Ampersand in the original should be escaped (not double-escaped since we process & first)
    expect(result).toBe('&lt;img src=&quot;x&quot; onerror=&#x27;alert(1)&#x27;&gt;&amp;');
  });

  it('returns empty string for empty input', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('passes through safe text unchanged', () => {
    expect(escapeHtml('Hello World 123')).toBe('Hello World 123');
  });
});

// ─── Unit tests: sanitizeHtml ───────────────────────────────────────────────

describe('sanitizeHtml', () => {
  describe('script tags', () => {
    it('strips <script> tags with content', () => {
      const input = '<p>Safe</p><script>alert(1)</script><p>Also safe</p>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('<script');
      expect(result).not.toContain('alert(1)');
      expect(result).toContain('<p>Safe</p>');
      expect(result).toContain('<p>Also safe</p>');
    });

    it('strips <script> tags with attributes', () => {
      const input = '<script type="text/javascript" src="evil.js"></script>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('<script');
      expect(result).not.toContain('evil.js');
    });

    it('strips <script> tags case-insensitively', () => {
      const input = '<SCRIPT>alert(1)</SCRIPT>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('SCRIPT');
      expect(result).not.toContain('alert');
    });

    it('strips self-closing script tags', () => {
      const input = '<script src="evil.js"/>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('<script');
    });

    it('strips unclosed script tags', () => {
      const input = '<script src="evil.js">';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('<script');
    });

    it('strips multiple script tags', () => {
      const input = '<script>one()</script><p>text</p><script>two()</script>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('<script');
      expect(result).toContain('<p>text</p>');
    });
  });

  describe('event handlers', () => {
    it('strips onclick attributes', () => {
      const input = '<a href="/safe" onclick="alert(1)">Click</a>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('onclick');
      expect(result).not.toContain('alert');
      expect(result).toContain('href="/safe"');
      expect(result).toContain('>Click</a>');
    });

    it('strips onerror attributes from img tags', () => {
      const input = '<img src="x" onerror="alert(1)">';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('onerror');
      expect(result).not.toContain('alert');
    });

    it('strips onload attributes', () => {
      const input = '<body onload="alert(1)">';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('onload');
    });

    it('strips onmouseover attributes', () => {
      const input = '<div onmouseover="alert(1)">hover me</div>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('onmouseover');
      expect(result).toContain('>hover me</div>');
    });

    it('strips onfocus attributes', () => {
      const input = '<input onfocus="alert(1)" autofocus>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('onfocus');
    });

    it('strips event handlers with single quotes', () => {
      const input = "<div onclick='alert(1)'>test</div>";
      const result = sanitizeHtml(input);
      expect(result).not.toContain('onclick');
    });

    it('strips multiple event handlers from one tag', () => {
      const input = '<div onclick="a()" onmouseover="b()" onload="c()">test</div>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('onclick');
      expect(result).not.toContain('onmouseover');
      expect(result).not.toContain('onload');
      expect(result).toContain('>test</div>');
    });
  });

  describe('dangerous URI protocols', () => {
    it('strips javascript: from href attributes', () => {
      const input = '<a href="javascript:alert(1)">link</a>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('javascript:');
      expect(result).toContain('>link</a>');
    });

    it('strips data: from href attributes', () => {
      const input = '<a href="data:text/html,<script>alert(1)</script>">link</a>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('data:');
    });

    it('strips vbscript: from href attributes', () => {
      const input = '<a href="vbscript:alert(1)">link</a>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('vbscript:');
    });

    it('strips javascript: from src attributes', () => {
      const input = '<img src="javascript:alert(1)">';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('javascript:');
    });

    it('strips data: from src attributes', () => {
      const input = '<img src="data:image/svg+xml,<svg onload=alert(1)>">';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('data:');
    });
  });

  describe('dangerous tags', () => {
    it('strips <iframe> tags', () => {
      const input = '<iframe src="evil.html"></iframe>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('<iframe');
      expect(result).not.toContain('evil.html');
    });

    it('strips <object> tags', () => {
      const input = '<object data="evil.swf"></object>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('<object');
    });

    it('strips <embed> tags', () => {
      const input = '<embed src="evil.swf">';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('<embed');
    });

    it('strips <form> tags', () => {
      const input = '<form action="evil.php"><input type="submit"></form>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('<form');
    });

    it('strips <base> tags', () => {
      const input = '<base href="https://evil.com/">';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('<base');
    });

    it('strips <meta> tags (outside head)', () => {
      const input = '<meta http-equiv="refresh" content="0;url=evil.html">';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('<meta');
    });

    it('strips <applet> tags', () => {
      const input = '<applet code="Evil.class"></applet>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('<applet');
    });
  });

  describe('style-based attacks', () => {
    it('strips style tags with expression()', () => {
      const input = '<style>body { background: expression(alert(1)) }</style>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('expression');
    });

    it('strips style tags with url()', () => {
      const input = '<style>body { background: url(javascript:alert(1)) }</style>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('url(');
    });

    it('strips style tags with @import', () => {
      const input = '<style>@import url("evil.css");</style>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('@import');
    });

    it('preserves safe style tags', () => {
      const input = '<style>body { color: red; }</style>';
      const result = sanitizeHtml(input);
      expect(result).toContain('<style>');
      expect(result).toContain('color: red');
    });
  });

  describe('preserves safe content', () => {
    it('preserves normal HTML tags', () => {
      const input = '<p>Hello <strong>world</strong></p>';
      expect(sanitizeHtml(input)).toBe(input);
    });

    it('preserves links with safe protocols', () => {
      const input = '<a href="https://example.com">link</a>';
      expect(sanitizeHtml(input)).toBe(input);
    });

    it('preserves images with safe src', () => {
      const input = '<img src="https://example.com/img.png" alt="photo">';
      expect(sanitizeHtml(input)).toBe(input);
    });

    it('preserves code blocks', () => {
      const input = '<pre><code>const x = 1;</code></pre>';
      expect(sanitizeHtml(input)).toBe(input);
    });
  });
});

// ─── Integration tests: XSS via HTTP server ────────────────────────────────

const xssTestDir = join(tmpdir(), `amp-wiki-xss-test-${Date.now()}`);
let xssServer: Server | null = null;
const XSS_TEST_PORT = 39843;

async function setupXssTestWiki(): Promise<void> {
  await mkdir(join(xssTestDir, 'projects', 'test-project'), { recursive: true });
  await mkdir(join(xssTestDir, 'library'), { recursive: true });
  await mkdir(join(xssTestDir, 'topics'), { recursive: true });

  // Required structural files
  await writeFile(
    join(xssTestDir, '_index.md'),
    '---\ntitle: Portal\n---\n\n# Portal\n\nHome page.\n',
    'utf-8',
  );
  await writeFile(
    join(xssTestDir, 'library', '_index.md'),
    '---\ntitle: Library\n---\n\n# Library\n',
    'utf-8',
  );
  await writeFile(
    join(xssTestDir, 'topics', '_index.md'),
    '---\ntitle: Topics\n---\n\n# Topics\n',
    'utf-8',
  );
  await writeFile(
    join(xssTestDir, 'projects', 'test-project', '_index.md'),
    '---\nproject: test-project\ntags: [testing]\n---\n\n# Test Project\n',
    'utf-8',
  );

  // Page with script tags in markdown content
  await writeFile(
    join(xssTestDir, 'projects', 'test-project', 'script-injection.md'),
    '---\nentity: script-injection\ntype: component\n---\n\n# Script Injection Test\n\nSafe content before.\n\n<script>alert("xss")</script>\n\nSafe content after.\n',
    'utf-8',
  );

  // Page with event handler in markdown content
  await writeFile(
    join(xssTestDir, 'projects', 'test-project', 'event-handler.md'),
    '---\nentity: event-handler\ntype: component\n---\n\n# Event Handler Test\n\n<img src="x" onerror="alert(1)">\n\n<div onmouseover="alert(2)">hover</div>\n',
    'utf-8',
  );

  // Page with javascript: protocol in markdown content
  await writeFile(
    join(xssTestDir, 'projects', 'test-project', 'js-protocol.md'),
    '---\nentity: js-protocol\ntype: component\n---\n\n# JS Protocol Test\n\n[click me](javascript:alert(1))\n\n<a href="javascript:alert(2)">raw link</a>\n',
    'utf-8',
  );

  // Page with XSS in wikilinks
  await writeFile(
    join(xssTestDir, 'projects', 'test-project', 'wikilink-xss.md'),
    '---\nentity: wikilink-xss\ntype: component\n---\n\n# Wikilink XSS Test\n\nSee [[<script>alert(1)</script>]] and [[normal-page|<img onerror="alert(2)">]].\n',
    'utf-8',
  );

  // Page with iframe injection
  await writeFile(
    join(xssTestDir, 'projects', 'test-project', 'iframe-injection.md'),
    '---\nentity: iframe-injection\ntype: component\n---\n\n# Iframe Test\n\n<iframe src="https://evil.com"></iframe>\n',
    'utf-8',
  );

  // Page with data: URI attack
  await writeFile(
    join(xssTestDir, 'projects', 'test-project', 'data-uri.md'),
    '---\nentity: data-uri\ntype: component\n---\n\n# Data URI Test\n\n<a href="data:text/html,<script>alert(1)</script>">click</a>\n',
    'utf-8',
  );
}

describe('WikiViewer XSS integration', () => {
  beforeAll(async () => {
    await setupXssTestWiki();
    xssServer = await startWikiViewer({
      port: XSS_TEST_PORT,
      wiki_dir: xssTestDir,
      project_tag: 'project:test',
    });
  });

  afterAll(async () => {
    if (xssServer) {
      await new Promise<void>((resolve) => xssServer!.close(() => resolve()));
    }
    await rm(xssTestDir, { recursive: true, force: true }).catch(() => {});
  });

  it('strips script tags from rendered markdown', async () => {
    const res = await fetch(`http://localhost:${XSS_TEST_PORT}/wiki/projects/test-project/script-injection`);
    expect(res.status).toBe(200);
    const html = await res.text();
    // The main content should not contain script injection.
    // (Operations Console layout wraps body in <main class="content"> instead of <article>.)
    const articleMatch =
      html.match(/<main class="content">([\s\S]*?)<\/main>/)
      ?? html.match(/<article>([\s\S]*?)<\/article>/);
    expect(articleMatch).not.toBeNull();
    const article = articleMatch![1];
    expect(article).not.toContain('<script>');
    expect(article).not.toContain('alert("xss")');
    expect(article).toContain('Safe content before.');
    expect(article).toContain('Safe content after.');
  });

  it('strips event handler attributes from rendered markdown', async () => {
    const res = await fetch(`http://localhost:${XSS_TEST_PORT}/wiki/projects/test-project/event-handler`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain('onerror=');
    expect(html).not.toContain('onmouseover=');
    expect(html).not.toContain('alert(');
  });

  it('strips javascript: protocol from rendered markdown', async () => {
    const res = await fetch(`http://localhost:${XSS_TEST_PORT}/wiki/projects/test-project/js-protocol`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain('javascript:');
  });

  it('escapes XSS vectors in wikilink targets and display text', async () => {
    const res = await fetch(`http://localhost:${XSS_TEST_PORT}/wiki/projects/test-project/wikilink-xss`);
    expect(res.status).toBe(200);
    const html = await res.text();
    // Script tags in wikilink target should be escaped
    expect(html).not.toMatch(/<script>alert\(1\)<\/script>/);
    // Event handler in wikilink display text should be escaped
    expect(html).not.toContain('onerror="alert(2)"');
    // But wikilinks should still render as <a> tags
    expect(html).toContain('class="wikilink"');
  });

  it('strips iframe tags from rendered markdown', async () => {
    const res = await fetch(`http://localhost:${XSS_TEST_PORT}/wiki/projects/test-project/iframe-injection`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('evil.com');
  });

  it('strips data: URIs from rendered markdown', async () => {
    const res = await fetch(`http://localhost:${XSS_TEST_PORT}/wiki/projects/test-project/data-uri`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain('data:text/html');
  });

  it('normal wiki pages still render correctly', async () => {
    const res = await fetch(`http://localhost:${XSS_TEST_PORT}/wiki/projects/test-project/_index`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Test Project');
    expect(html).toContain('class="tag"');
  });

  it('search results escape XSS in query parameter', async () => {
    const res = await fetch(`http://localhost:${XSS_TEST_PORT}/search?q=<script>alert(1)</script>`);
    expect(res.status).toBe(200);
    const html = await res.text();
    // The query should be escaped in the page output
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
