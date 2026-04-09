// packages/wiki/src/viewer.ts
// Self-hosted wiki viewer with subdirectory routing, global sidebar, and dark theme.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, extname, basename, relative, sep } from 'node:path';
import { Marked } from 'marked';
import type { ViewerConfig } from './types.js';

// ─── Markdown rendering with [[wikilink]] support ───────────────────────────

const marked = new Marked();

/** Convert [[path/slug|display]] wikilinks to clickable HTML links */
function resolveWikilinks(html: string): string {
  return html.replace(
    /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g,
    (_match, target: string, display?: string) => {
      // target may be "projects/mars-fps/enemy" or "_decisions" or "library/some-source"
      const trimmed = target.trim();
      const href = `/wiki/${escapeHtml(trimmed)}`;
      const text = escapeHtml(display?.trim() ?? trimmed.split('/').pop() ?? trimmed);
      return `<a href="${href}" class="wikilink">${text}</a>`;
    },
  );
}

async function renderMarkdown(content: string): Promise<string> {
  const html = await marked.parse(content);
  // Sanitize rendered HTML before wikilink resolution to strip XSS vectors,
  // then resolve wikilinks (which are already escaped by resolveWikilinks)
  return resolveWikilinks(sanitizeHtml(html));
}

// ─── HTML templates ─────────────────────────────────────────────────────────

function htmlPage(title: string, body: string, sidebar: string = ''): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - AMP Wiki</title>
  <style>${CSS}</style>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
  <script>mermaid.initialize({ startOnLoad: true, theme: 'dark' });</script>
</head>
<body>
  <header>
    <a href="/wiki/_index" class="logo">AMP Wiki</a>
    <nav>
      <a href="/wiki/_index">Portal</a>
      <a href="/wiki/_decisions">Decisions</a>
      <a href="/wiki/_patterns">Patterns</a>
      <a href="/wiki/_recent">Recent</a>
      <a href="/wiki/library/_index">Library</a>
      <a href="/wiki/topics/_index">Topics</a>
      <a href="/search">Search</a>
    </nav>
  </header>
  <main>
    ${sidebar ? `<aside class="sidebar">${sidebar}</aside>` : ''}
    <article>${body}</article>
  </main>
</body>
</html>`;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Sanitize rendered HTML to remove XSS vectors.
 * Strips: <script> tags, event handler attributes (on*), dangerous URI protocols
 * (javascript:, data:, vbscript:), <iframe>, <object>, <embed>, <form>, <base>,
 * <meta>, <link> (outside <head>), and <style> tags with expressions.
 */
export function sanitizeHtml(html: string): string {
  let sanitized = html;

  // Strip <script> tags and their content (case-insensitive, handles attributes)
  sanitized = sanitized.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
  // Strip self-closing / unclosed <script> tags
  sanitized = sanitized.replace(/<script\b[^>]*\/?>/gi, '');

  // Strip dangerous tags entirely (with content)
  for (const tag of ['iframe', 'object', 'embed', 'applet', 'form', 'base', 'meta', 'link']) {
    const selfClosing = new RegExp(`<${tag}\\b[^>]*/?>`, 'gi');
    const withContent = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi');
    sanitized = sanitized.replace(withContent, '');
    sanitized = sanitized.replace(selfClosing, '');
  }

  // Strip <style> tags that contain expression(), url(), or @import
  sanitized = sanitized.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, (match) => {
    if (/expression\s*\(|url\s*\(|@import/i.test(match)) {
      return '';
    }
    return match;
  });

  // Strip event handler attributes (on*="...", on*='...', on*=...) from all tags
  // This handles onclick, onerror, onload, onmouseover, onfocus, etc.
  sanitized = sanitized.replace(/<([a-z][a-z0-9]*)\b([^>]*?)>/gi, (_match, tag: string, attrs: string) => {
    // Remove all on* attributes
    const cleanAttrs = attrs.replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    return `<${tag}${cleanAttrs}>`;
  });

  // Strip dangerous URI protocols from href, src, action, formaction, xlink:href, data attributes
  // Handles javascript:, data:, vbscript: with optional whitespace/entities between protocol chars
  const dangerousProtocol = /\s*(href|src|action|formaction|xlink:href)\s*=\s*(?:"(?:\s*j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t|data|vbscript)\s*:[^"]*"|'(?:\s*j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t|data|vbscript)\s*:[^']*'|(?:j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t|data|vbscript)\s*:[^\s>]*)/gi;
  sanitized = sanitized.replace(dangerousProtocol, '');

  return sanitized;
}

const CSS = `
:root {
  --bg: #0d1117;
  --fg: #c9d1d9;
  --fg-muted: #8b949e;
  --accent: #58a6ff;
  --accent-hover: #79c0ff;
  --border: #30363d;
  --surface: #161b22;
  --code-bg: #1c2128;
  --success: #3fb950;
  --warning: #d29922;
  --error: #f85149;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
  background: var(--bg);
  color: var(--fg);
  line-height: 1.6;
}
header {
  display: flex;
  align-items: center;
  gap: 2rem;
  padding: 0.75rem 2rem;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 100;
}
header .logo {
  font-weight: 700;
  font-size: 1.1rem;
  color: var(--fg);
  text-decoration: none;
}
header nav { display: flex; gap: 1rem; }
header nav a {
  color: var(--fg-muted);
  text-decoration: none;
  font-size: 0.9rem;
}
header nav a:hover { color: var(--accent); }
main {
  display: flex;
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
  gap: 2rem;
}
aside.sidebar {
  min-width: 220px;
  max-width: 280px;
  padding: 1rem;
  background: var(--surface);
  border-radius: 6px;
  border: 1px solid var(--border);
  font-size: 0.85rem;
  height: fit-content;
  position: sticky;
  top: 4rem;
  max-height: calc(100vh - 5rem);
  overflow-y: auto;
}
aside.sidebar h3 {
  color: var(--fg-muted);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.5rem;
  margin-top: 1rem;
}
aside.sidebar h3:first-child { margin-top: 0; }
aside.sidebar ul { list-style: none; }
aside.sidebar li { margin: 0.25rem 0; }
aside.sidebar a { color: var(--accent); text-decoration: none; font-size: 0.85rem; }
aside.sidebar a:hover { color: var(--accent-hover); text-decoration: underline; }
article {
  flex: 1;
  min-width: 0;
}
article h1 {
  font-size: 2rem;
  margin-bottom: 0.5rem;
  border-bottom: 1px solid var(--border);
  padding-bottom: 0.5rem;
}
article h2 {
  font-size: 1.4rem;
  margin-top: 2rem;
  margin-bottom: 0.5rem;
  color: var(--fg);
}
article h3 {
  font-size: 1.1rem;
  margin-top: 1.5rem;
  margin-bottom: 0.5rem;
}
article p { margin: 0.5rem 0; }
article blockquote {
  border-left: 3px solid var(--accent);
  padding: 0.5rem 1rem;
  margin: 0.5rem 0;
  color: var(--fg-muted);
  background: var(--surface);
  border-radius: 0 4px 4px 0;
}
article ul, article ol { padding-left: 1.5rem; margin: 0.5rem 0; }
article li { margin: 0.25rem 0; }
article em { color: var(--fg-muted); }
article strong { color: var(--fg); }
article code {
  background: var(--code-bg);
  padding: 0.15rem 0.4rem;
  border-radius: 3px;
  font-size: 0.9em;
}
article pre {
  background: var(--code-bg);
  padding: 1rem;
  border-radius: 6px;
  overflow-x: auto;
  margin: 0.5rem 0;
}
article pre code { background: none; padding: 0; }
article table {
  border-collapse: collapse;
  width: 100%;
  margin: 0.5rem 0;
}
article th, article td {
  border: 1px solid var(--border);
  padding: 0.5rem 0.75rem;
  text-align: left;
}
article th {
  background: var(--surface);
  font-weight: 600;
}
a.wikilink {
  color: var(--accent);
  text-decoration: none;
  border-bottom: 1px dotted var(--accent);
}
a.wikilink:hover {
  color: var(--accent-hover);
  border-bottom-style: solid;
}
.frontmatter {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.75rem 1rem;
  margin-bottom: 1.5rem;
  font-size: 0.85rem;
  color: var(--fg-muted);
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.5rem;
}
.frontmatter span { white-space: nowrap; }
.tag {
  display: inline-block;
  background: var(--code-bg);
  color: var(--accent);
  padding: 0.1rem 0.5rem;
  border-radius: 3px;
  font-size: 0.8rem;
  margin: 0.1rem;
}
.search-box {
  max-width: 600px;
  margin: 2rem auto;
}
.search-box input {
  width: 100%;
  padding: 0.75rem 1rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--fg);
  font-size: 1rem;
  outline: none;
}
.search-box input:focus { border-color: var(--accent); }
.search-results { margin-top: 1rem; }
.search-results .result {
  padding: 0.75rem;
  border-bottom: 1px solid var(--border);
}
.search-results .result a {
  color: var(--accent);
  font-weight: 600;
  text-decoration: none;
}
.search-results .result .snippet {
  color: var(--fg-muted);
  font-size: 0.9rem;
  margin-top: 0.25rem;
}
.mermaid {
  background: var(--surface);
  padding: 1rem;
  border-radius: 6px;
  text-align: center;
}
`;

// ─── Recursive file discovery ───────────────────────────────────────────────

interface FileEntry {
  /** Path relative to wiki root, using forward slashes */
  relPath: string;
  /** Absolute path on disk */
  absPath: string;
}

async function discoverMarkdownFiles(rootDir: string): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];

  async function walk(dir: string): Promise<void> {
    let items: string[];
    try {
      items = await readdir(dir);
    } catch (err) {
      console.error('[wiki-viewer] Failed to read directory (skipping):', dir, err instanceof Error ? err.message : err);
      return;
    }
    for (const item of items) {
      const fullPath = join(dir, item);
      try {
        const s = await stat(fullPath);
        if (s.isDirectory()) {
          await walk(fullPath);
        } else if (item.endsWith('.md')) {
          const rel = relative(rootDir, fullPath).split(sep).join('/');
          entries.push({ relPath: rel, absPath: fullPath });
        }
      } catch (err) {
        console.error('[wiki-viewer] Cannot stat file (skipping):', fullPath, err instanceof Error ? err.message : err);
      }
    }
  }

  await walk(rootDir);
  return entries;
}

// ─── Global sidebar builder ─────────────────────────────────────────────────

async function buildGlobalSidebar(wikiDir: string): Promise<string> {
  const files = await discoverMarkdownFiles(wikiDir);
  const lines: string[] = [];

  // Portal
  lines.push('<h3>Portal</h3>');
  lines.push('<ul>');
  lines.push('<li><a href="/wiki/_index">Home</a></li>');
  lines.push('<li><a href="/wiki/_decisions">Decisions</a></li>');
  lines.push('<li><a href="/wiki/_patterns">Patterns</a></li>');
  lines.push('<li><a href="/wiki/_recent">Recent Changes</a></li>');
  lines.push('</ul>');

  // Projects
  const projectFiles = files.filter((f) => f.relPath.startsWith('projects/') && f.relPath.endsWith('/_index.md'));
  if (projectFiles.length > 0) {
    lines.push('<h3>Projects</h3>');
    lines.push('<ul>');
    for (const pf of projectFiles.sort((a, b) => a.relPath.localeCompare(b.relPath))) {
      const parts = pf.relPath.split('/');
      const projectSlug = parts[1]; // projects/<slug>/_index.md
      const label = projectSlug.replace(/-/g, ' ');
      lines.push(`<li><a href="/wiki/projects/${projectSlug}/_index">${escapeHtml(label)}</a></li>`);
    }
    lines.push('</ul>');
  }

  // Library
  const libraryIndex = files.find((f) => f.relPath === 'library/_index.md');
  if (libraryIndex) {
    lines.push('<h3>Library</h3>');
    lines.push('<ul>');
    lines.push('<li><a href="/wiki/library/_index">Source Index</a></li>');
    lines.push('</ul>');
  }

  // Topics
  const topicsIndex = files.find((f) => f.relPath === 'topics/_index.md');
  if (topicsIndex) {
    lines.push('<h3>Topics</h3>');
    lines.push('<ul>');
    lines.push('<li><a href="/wiki/topics/_index">Topic Index</a></li>');
    lines.push('</ul>');
  }

  return lines.join('\n');
}

// ─── Page-level sidebar (frontmatter + TOC) ─────────────────────────────────

function buildPageSidebar(content: string): string {
  const lines: string[] = [];

  // Extract frontmatter for metadata display
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const fm = fmMatch[1];
    const typeMatch = fm.match(/^type:\s*(.+)$/m);
    const confMatch = fm.match(/^confidence:\s*(.+)$/m);
    const sourcesMatch = fm.match(/^sources:\s*(.+)$/m);
    const linksMatch = fm.match(/^inbound_links:\s*(.+)$/m);

    const hasMetadata = typeMatch || confMatch || sourcesMatch || linksMatch;
    if (hasMetadata) {
      lines.push('<h3>Metadata</h3>');
      lines.push('<ul>');
      if (typeMatch) lines.push(`<li>Type: <strong>${escapeHtml(typeMatch[1])}</strong></li>`);
      if (confMatch) lines.push(`<li>Confidence: <strong>${escapeHtml(confMatch[1])}</strong></li>`);
      if (sourcesMatch) lines.push(`<li>Sources: <strong>${escapeHtml(sourcesMatch[1])}</strong></li>`);
      if (linksMatch) lines.push(`<li>Inbound links: <strong>${escapeHtml(linksMatch[1])}</strong></li>`);
      lines.push('</ul>');
    }
  }

  // Extract TOC from h2 headings
  const headings = content.match(/^## .+$/gm);
  if (headings && headings.length > 0) {
    lines.push('<h3>Sections</h3>');
    lines.push('<ul>');
    for (const h of headings) {
      const text = h.replace(/^## /, '');
      const anchor = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      lines.push(`<li><a href="#${anchor}">${escapeHtml(text)}</a></li>`);
    }
    lines.push('</ul>');
  }

  return lines.join('\n');
}

// ─── File resolution ────────────────────────────────────────────────────────

/**
 * Resolve a URL slug path to a markdown file on disk.
 * Tries: <path>.md, <path>/_index.md
 */
async function resolveFile(wikiDir: string, slugPath: string): Promise<string | null> {
  // Try direct .md
  const directPath = join(wikiDir, `${slugPath}.md`);
  try {
    const s = await stat(directPath);
    if (s.isFile()) return directPath;
  } catch (_) { /* not found */ }

  // Try as directory with _index.md
  const indexPath = join(wikiDir, slugPath, '_index.md');
  try {
    const s = await stat(indexPath);
    if (s.isFile()) return indexPath;
  } catch (_) { /* not found */ }

  return null;
}

// ─── Request handlers ───────────────────────────────────────────────────────

async function handleWikiPage(wikiDir: string, slugPath: string, res: ServerResponse): Promise<void> {
  const filePath = await resolveFile(wikiDir, slugPath);

  if (!filePath) {
    res.writeHead(404);
    res.end(htmlPage('Not Found', '<h1>Page not found</h1><p>This wiki page does not exist yet.</p>'));
    return;
  }

  const content = await readFile(filePath, 'utf-8');

  // Build sidebar: global nav + page-level metadata/TOC
  const globalNav = await buildGlobalSidebar(wikiDir);
  const pageSidebar = buildPageSidebar(content);
  const fullSidebar = globalNav + (pageSidebar ? '\n<hr style="border-color: var(--border); margin: 0.75rem 0;">\n' + pageSidebar : '');

  // Strip frontmatter for rendering
  const bodyContent = content.replace(/^---\n[\s\S]*?\n---\n*/, '');
  const html = await renderMarkdown(bodyContent);

  // Extract title from first h1
  const titleMatch = bodyContent.match(/^# (.+)$/m);
  const title = titleMatch ? titleMatch[1] : slugPath.split('/').pop() ?? 'Wiki';

  // Build frontmatter tag bar
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  let fmBar = '';
  if (fmMatch) {
    const fm = fmMatch[1];
    const tags = fm.match(/^tags:\s*\[(.+)\]$/m);
    if (tags) {
      const tagList = tags[1].split(',').map((t) => t.trim());
      fmBar = `<div class="frontmatter">${tagList.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>`;
    }
  }

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(htmlPage(title, fmBar + html, fullSidebar));
}

async function handleSearch(wikiDir: string, query: string, res: ServerResponse): Promise<void> {
  if (!query) {
    const body = `
      <h1>Search</h1>
      <div class="search-box">
        <form method="GET" action="/search">
          <input type="text" name="q" placeholder="Search the wiki..." autofocus>
        </form>
      </div>`;
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(htmlPage('Search', body));
    return;
  }

  // Full-text search over all markdown files recursively
  const results: Array<{ wikiPath: string; title: string; snippet: string }> = [];
  const queryLower = query.toLowerCase();

  const files = await discoverMarkdownFiles(wikiDir);
  for (const file of files) {
    const content = await readFile(file.absPath, 'utf-8');
    if (content.toLowerCase().includes(queryLower)) {
      // Derive wiki URL path from relative path: "projects/mars-fps/enemy.md" -> "projects/mars-fps/enemy"
      const wikiPath = file.relPath.replace(/\.md$/, '');

      const titleMatch = content.match(/^# (.+)$/m);
      const title = titleMatch ? titleMatch[1] : wikiPath.split('/').pop() ?? wikiPath;

      // Extract snippet around match
      const idx = content.toLowerCase().indexOf(queryLower);
      const start = Math.max(0, idx - 80);
      const end = Math.min(content.length, idx + query.length + 80);
      const snippet = content.slice(start, end).replace(/\n/g, ' ').trim();

      results.push({ wikiPath, title, snippet });
    }
  }

  const resultHtml = results.length === 0
    ? '<p>No results found.</p>'
    : results.map((r) =>
        `<div class="result"><a href="/wiki/${escapeHtml(r.wikiPath)}">${escapeHtml(r.title)}</a><div class="snippet">...${escapeHtml(r.snippet)}...</div></div>`,
      ).join('');

  const body = `
    <h1>Search results for "${escapeHtml(query)}"</h1>
    <div class="search-box">
      <form method="GET" action="/search">
        <input type="text" name="q" value="${escapeHtml(query)}" autofocus>
      </form>
    </div>
    <div class="search-results">${resultHtml}</div>
    <p style="color: var(--fg-muted); margin-top: 1rem;">${results.length} result(s)</p>`;

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(htmlPage(`Search: ${query}`, body));
}

// ─── Server ─────────────────────────────────────────────────────────────────

export function startWikiViewer(config: ViewerConfig): ReturnType<typeof createServer> {
  const { port, wiki_dir } = config;

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const url = new URL(req.url ?? '/', `http://localhost:${port}`);
      const path = url.pathname;

      if (path === '/' || path === '') {
        // Redirect root to portal
        res.writeHead(302, { Location: '/wiki/_index' });
        res.end();
      } else if (path.startsWith('/wiki/')) {
        // Extract everything after /wiki/ as the slug path
        const slugPath = decodeURIComponent(path.slice(6)).replace(/\/$/, '');
        if (!slugPath) {
          res.writeHead(302, { Location: '/wiki/_index' });
          res.end();
          return;
        }
        await handleWikiPage(wiki_dir, slugPath, res);
      } else if (path === '/search') {
        const query = url.searchParams.get('q') ?? '';
        await handleSearch(wiki_dir, query, res);
      } else if (path.startsWith('/api/graph/')) {
        const jsonPath = path.replace('/api/graph/', '');
        const filePath = join(wiki_dir, jsonPath);
        try {
          const content = await readFile(filePath, 'utf-8');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(content);
        } catch (err) {
          console.error('[wiki-viewer] API graph file not found:', filePath, err instanceof Error ? err.message : err);
          res.writeHead(404);
          res.end('Not found');
        }
      } else {
        res.writeHead(404);
        res.end(htmlPage('Not Found', '<h1>404 - Not Found</h1>'));
      }
    } catch (err) {
      console.error('[wiki-viewer] Error:', err);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end('Internal Server Error');
      }
    }
  });

  server.listen(port, () => {
    console.error(`[wiki-viewer] Serving wiki from ${wiki_dir} on http://localhost:${port}`);
  });

  return server;
}
