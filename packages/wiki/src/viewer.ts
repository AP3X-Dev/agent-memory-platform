// packages/wiki/src/viewer.ts
// Self-hosted wiki viewer with subdirectory routing, global sidebar, and dark theme.
// Caches sidebar HTML and search index at startup; auto-rebuilds on file changes.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { watch, type FSWatcher } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { Marked } from 'marked';
import type { ViewerConfig } from './types.js';

// ─── Markdown rendering with [[wikilink]] support ───────────────────────────

const marked = new Marked();

/** Convert [[path/slug|display]] wikilinks to clickable HTML links.
 * Runs BEFORE markdown parsing so the `|` inside [[a|b]] never collides with
 * markdown table cell separators. The output `<a>` tag is HTML-safe because
 * both target and display are escaped via escapeHtml.
 */
function resolveWikilinks(text: string): string {
  return text.replace(
    /\[\[([^\]|\n]+?)(?:\|([^\]\n]+?))?\]\]/g,
    (_match, target: string, display?: string) => {
      const trimmed = target.trim();
      const href = `/wiki/${escapeHtml(trimmed)}`;
      const label = escapeHtml(display?.trim() ?? trimmed.split('/').pop() ?? trimmed);
      return `<a href="${href}" class="wikilink">${label}</a>`;
    },
  );
}

function wikilinkDisplayText(text: string): string {
  return text.replace(
    /\[\[([^\]|\n]+?)(?:\|([^\]\n]+?))?\]\]/g,
    (_match, target: string, display?: string) => display?.trim() ?? target.trim().split('/').pop() ?? target.trim(),
  );
}

function stripHtmlTags(text: string): string {
  return text.replace(/<[^>]*>/g, '');
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'");
}

function headingTextFromMarkdown(text: string): string {
  return wikilinkDisplayText(text)
    .replace(/[`*_~]/g, '')
    .trim();
}

function headingAnchorBase(text: string): string {
  return decodeHtmlEntities(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'section';
}

function uniqueHeadingAnchor(text: string, seen: Map<string, number>): string {
  const base = headingAnchorBase(text);
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}

function addHeadingIds(html: string): string {
  const seen = new Map<string, number>();
  return html.replace(/<h([2-6])([^>]*)>([\s\S]*?)<\/h\1>/g, (match, level: string, attrs: string, inner: string) => {
    if (/\sid\s*=/.test(attrs)) return match;
    const text = decodeHtmlEntities(stripHtmlTags(inner)).trim();
    const anchor = uniqueHeadingAnchor(text, seen);
    return `<h${level}${attrs} id="${escapeHtml(anchor)}">${inner}</h${level}>`;
  });
}

export async function renderMarkdown(content: string): Promise<string> {
  // Resolve wikilinks first: marked v15's pipe-table tokenizer treats `|` as a
  // column separator, which split [[link|display]] across cells. Resolving
  // before marked.parse() means the `|` is gone by the time tables are parsed.
  // Sanitize the final HTML to scrub any XSS vectors from the source content.
  const withLinks = resolveWikilinks(content);
  const html = await marked.parse(withLinks);
  return sanitizeHtml(addHeadingIds(html));
}

// ─── HTML templates ─────────────────────────────────────────────────────────

interface PageOpts {
  /** Active nav id: home | decisions | patterns | recent | topics | library | search | none */
  activeNav?: string;
  /** Whether to wrap body in <main class="content">; bespoke pages set false. */
  contentWrap?: boolean;
  /** Sidebar markdown for project/entity pages. */
  sidebar?: string;
}

const NAV_ITEMS: Array<[id: string, label: string, href: string]> = [
  ['home', 'PORTAL', '/wiki/_index'],
  ['decisions', 'DECISIONS', '/wiki/_decisions'],
  ['patterns', 'PATTERNS', '/wiki/_patterns'],
  ['recent', 'RECENT', '/wiki/_recent'],
  ['topics', 'TOPICS', '/wiki/topics/_index'],
  ['library', 'LIBRARY', '/wiki/library/_index'],
  ['search', 'SEARCH', '/search'],
];

function topBar(active: string): string {
  const compiledStamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const navHtml = NAV_ITEMS.map(([id, label, href]) =>
    `<a href="${href}"${id === active ? ' class="active"' : ''}>${label}</a>`,
  ).join('');
  return `<div class="topbar">
  <div class="brand">
    <a href="/wiki/_index" class="logo">A</a>
    <a href="/wiki/_index" class="title">AMP&nbsp;WIKI</a>
    <span class="stamp">v2.4 · synced ${escapeHtml(compiledStamp)}</span>
  </div>
  <nav>${navHtml}</nav>
  <div class="status">
    <span class="label">NEO4J</span>
    <span class="pill"><span class="dot"></span>ONLINE</span>
  </div>
</div>`;
}

function footer(totalNodes: number | null = null): string {
  const nodes = totalNodes != null ? `${totalNodes} TOTAL NODES` : 'AUTO-COMPILED FROM NEO4J';
  // Optional right-side label, e.g. the public host of this wiki. Set
  // AMP_WIKI_PUBLIC_LABEL=foo.example.com to display it. Empty by default
  // so deployments don't leak local LAN addresses.
  const rightLabel = (process.env['AMP_WIKI_PUBLIC_LABEL'] ?? '').trim();
  const rightSpan = rightLabel ? `<span>${escapeHtml(rightLabel)}</span>` : '';
  return `<div class="footer">
  <span>AMP WIKI · COMPILED FROM NEO4J · ${escapeHtml(nodes)}</span>
  ${rightSpan}
</div>`;
}

function htmlPage(title: string, body: string, sidebar: string = '', opts: PageOpts = {}): string {
  const active = opts.activeNav ?? 'none';
  const wrap = opts.contentWrap !== false;
  const useSidebar = sidebar && wrap;
  const inner = useSidebar
    ? `<div class="main-with-sidebar"><aside class="sidebar">${sidebar}</aside><main class="content">${body}</main></div>`
    : wrap
      ? `<main class="content">${body}</main>`
      : body;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — AMP Wiki</title>
  <style>${CSS}</style>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
  <script>mermaid.initialize({ startOnLoad: true, theme: 'dark' });</script>
</head>
<body>
${topBar(active)}
${inner}
${footer()}
</body>
</html>`;
}

// ─── Ops Home renderer ──────────────────────────────────────────────────────
// Parses _index.md / _recent.md / _decisions.md content and emits the
// Operations Console home layout: hero, graph, stat strip, projects table,
// activity ticker, top decisions strip.

interface PortalStats {
  projects: number; entities: number; facts: number; sessions: number; sources: number;
}

interface PortalProject {
  href: string; name: string; entities: number; facts: number; sessions: number; lastActivity: string;
}

interface TopDecision {
  text: string; confidence: number; entities: Array<{ name: string; href: string }>; project?: string;
}

interface RecentChange {
  date: string; project: string; status: 'APPROVED' | 'PROPOSED' | 'OTHER'; title: string;
}

function parsePortalStats(md: string): PortalStats {
  const m = md.match(/\*\*(\d+)\*\* projects · \*\*(\d+)\*\* entities · \*\*(\d+)\*\* semantic facts · \*\*(\d+)\*\* session entries · \*\*(\d+)\*\* sources/);
  if (!m) return { projects: 0, entities: 0, facts: 0, sessions: 0, sources: 0 };
  return {
    projects: Number(m[1]), entities: Number(m[2]), facts: Number(m[3]),
    sessions: Number(m[4]), sources: Number(m[5]),
  };
}

function parsePortalProjects(md: string): PortalProject[] {
  const out: PortalProject[] = [];
  const tableRegex = /\|\s*\[\[([^|\]]+)\|([^\]]+)\]\]\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*([^\|]+?)\s*\|/g;
  let m: RegExpExecArray | null;
  while ((m = tableRegex.exec(md)) !== null) {
    out.push({
      href: '/wiki/' + m[1].trim(),
      name: m[2].trim(),
      entities: Number(m[3]),
      facts: Number(m[4]),
      sessions: Number(m[5]),
      lastActivity: m[6].trim(),
    });
  }
  return out;
}

function parseTopDecisions(md: string): TopDecision[] {
  const section = md.split(/^##\s+Top Decisions\s*$/m)[1] ?? md;
  const cut = section.split(/^##\s+/m)[0] ?? section;
  const out: TopDecision[] = [];
  // Each decision is a `- text *(0.95)* -- [[link|name]], [[link|name]]` line
  const lines = cut.split('\n').filter((l) => l.trim().startsWith('- '));
  for (const line of lines) {
    const confMatch = line.match(/\*\((\d+\.\d+)\)\*/);
    if (!confMatch) continue;
    const confidence = Number(confMatch[1]);
    const beforeConf = line.slice(2, line.indexOf('*(')).trim();
    const text = beforeConf;
    const afterConf = line.slice(line.indexOf('*(' + confidence.toFixed(2) + ')*') + 8).trim();
    const ents: Array<{ name: string; href: string }> = [];
    const linkRe = /\[\[([^|\]]+)\|([^\]]+)\]\]/g;
    let lm: RegExpExecArray | null;
    while ((lm = linkRe.exec(afterConf)) !== null) {
      ents.push({ href: '/wiki/' + lm[1].trim(), name: lm[2].trim() });
    }
    // Try to derive project from first entity link path: projects/<slug>/...
    const firstHref = ents[0]?.href ?? '';
    const projMatch = firstHref.match(/\/wiki\/projects\/([^/]+)/);
    const project = projMatch ? projMatch[1] : undefined;
    out.push({ text, confidence, entities: ents, project });
  }
  return out;
}

function parseRecentChanges(md: string): RecentChange[] {
  const out: RecentChange[] = [];
  const lines = md.split('\n').filter((l) => l.trim().startsWith('- **'));
  // Match lines like: - **2026-04-29** **[APPROVED]** [agent-assist-cr] Title text
  const lineRe = /^-\s+\*\*(\d{4}-\d{2}-\d{2})\*\*\s+(?:\*\*\[([A-Z]+)\]\*\*\s+)?(?:\[([^\]]+)\]\s+)?(.*?)$/;
  for (const line of lines) {
    const m = lineRe.exec(line.trim());
    if (!m) continue;
    const status = (m[2] === 'APPROVED' || m[2] === 'PROPOSED') ? m[2] : 'OTHER';
    out.push({
      date: m[1],
      status: status as RecentChange['status'],
      project: m[3] ?? '',
      title: m[4].trim(),
    });
  }
  return out;
}

function renderOpsGraph(projects: PortalProject[]): string {
  // Build a small project-centric graph: hub "amp" + top N projects radially.
  const W = 1200, H = 520, cx = W / 2, cy = H / 2;
  const top = projects
    .filter((p) => p.entities + p.facts + p.sessions > 0)
    .sort((a, b) => (b.entities + b.facts + b.sessions) - (a.entities + a.facts + a.sessions))
    .slice(0, 12);
  const hub = { id: 'amp', label: 'amp', x: cx, y: cy, size: 28, href: '/wiki/projects/amp/_index' };
  const nodes = top.map((p, i) => {
    const angle = (2 * Math.PI * i) / top.length - Math.PI / 2;
    const r = 200 + (i % 3) * 25;
    const total = p.entities + p.facts + p.sessions;
    return {
      id: p.name,
      label: p.name,
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      size: Math.max(10, Math.min(22, 8 + Math.log2(total + 1) * 2.5)),
      href: p.href,
    };
  });

  const edges = nodes.map((n) =>
    `<line class="edge" x1="${hub.x}" y1="${hub.y}" x2="${n.x.toFixed(1)}" y2="${n.y.toFixed(1)}" />`,
  ).join('');

  const renderNode = (n: typeof hub) => `
    <g class="node" transform="translate(${n.x.toFixed(1)},${n.y.toFixed(1)})">
      <a href="${escapeHtml(n.href)}">
        <text x="0" y="0" font-size="${n.size * 2}" text-anchor="middle" dominant-baseline="central" style="user-select:none;">🔵</text>
        <text class="node-label" x="0" y="${n.size + 14}" text-anchor="middle">${escapeHtml(n.label)}</text>
      </a>
    </g>`;

  return `
  <svg id="opsGraphSvg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" data-vb-w="${W}" data-vb-h="${H}">
    <defs>
      <pattern id="opsGraphGrid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#141414" stroke-width="1"/>
      </pattern>
    </defs>
    <rect x="-2000" y="-2000" width="${W + 4000}" height="${H + 4000}" fill="url(#opsGraphGrid)" />
    <g id="opsGraphContent">
      ${edges}
      ${renderNode(hub)}
      ${nodes.map(renderNode).join('')}
    </g>
  </svg>
  <div class="controls">
    <button data-graph-zoom="in" title="Zoom in">+</button>
    <button data-graph-zoom="out" title="Zoom out">−</button>
    <button data-graph-zoom="reset" title="Reset view">⊙</button>
  </div>
  <div class="hint">SCROLL TO ZOOM · DRAG TO PAN</div>`;
}

/** Inline JS for graph pan/zoom. Runs after page load via DOMContentLoaded. */
const GRAPH_PAN_ZOOM_JS = `
(function () {
  const svg = document.getElementById('opsGraphSvg');
  if (!svg) return;
  const initialW = parseFloat(svg.dataset.vbW);
  const initialH = parseFloat(svg.dataset.vbH);
  let vb = { x: 0, y: 0, w: initialW, h: initialH };

  function apply() {
    svg.setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h);
  }
  function reset() { vb = { x: 0, y: 0, w: initialW, h: initialH }; apply(); }

  function svgPoint(clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    return {
      x: vb.x + (clientX - rect.left) / rect.width * vb.w,
      y: vb.y + (clientY - rect.top) / rect.height * vb.h,
    };
  }

  function zoomAt(clientX, clientY, factor) {
    const p = svgPoint(clientX, clientY);
    const newW = Math.max(initialW * 0.1, Math.min(initialW * 8, vb.w * factor));
    const newH = newW * (initialH / initialW);
    vb.x = p.x - (p.x - vb.x) * (newW / vb.w);
    vb.y = p.y - (p.y - vb.y) * (newH / vb.h);
    vb.w = newW; vb.h = newH;
    apply();
  }

  // Wheel zoom
  svg.addEventListener('wheel', function (e) {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    zoomAt(e.clientX, e.clientY, factor);
  }, { passive: false });

  // Drag pan
  let panning = false, panStart = null, vbStart = null, dragMoved = false;
  svg.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    panning = true; dragMoved = false;
    panStart = { x: e.clientX, y: e.clientY };
    vbStart = { ...vb };
    svg.classList.add('panning');
  });
  window.addEventListener('mousemove', function (e) {
    if (!panning) return;
    const rect = svg.getBoundingClientRect();
    const dx = (e.clientX - panStart.x) / rect.width * vb.w;
    const dy = (e.clientY - panStart.y) / rect.height * vb.h;
    if (Math.abs(e.clientX - panStart.x) + Math.abs(e.clientY - panStart.y) > 4) dragMoved = true;
    vb.x = vbStart.x - dx; vb.y = vbStart.y - dy;
    apply();
  });
  window.addEventListener('mouseup', function () {
    panning = false;
    svg.classList.remove('panning');
  });
  // Suppress click navigation if the user actually dragged
  svg.addEventListener('click', function (e) {
    if (dragMoved) { e.preventDefault(); e.stopPropagation(); dragMoved = false; }
  }, true);

  // Touch (1-finger pan, 2-finger pinch)
  let touchPan = null, pinchStart = null;
  function touchDist(t) {
    const dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY;
    return Math.hypot(dx, dy);
  }
  svg.addEventListener('touchstart', function (e) {
    if (e.touches.length === 1) {
      touchPan = { x: e.touches[0].clientX, y: e.touches[0].clientY, vb: { ...vb } };
    } else if (e.touches.length === 2) {
      pinchStart = { dist: touchDist(e.touches), vbW: vb.w, midX: (e.touches[0].clientX + e.touches[1].clientX) / 2, midY: (e.touches[0].clientY + e.touches[1].clientY) / 2 };
    }
  }, { passive: true });
  svg.addEventListener('touchmove', function (e) {
    if (e.touches.length === 1 && touchPan) {
      const rect = svg.getBoundingClientRect();
      const dx = (e.touches[0].clientX - touchPan.x) / rect.width * vb.w;
      const dy = (e.touches[0].clientY - touchPan.y) / rect.height * vb.h;
      vb.x = touchPan.vb.x - dx; vb.y = touchPan.vb.y - dy; apply();
      e.preventDefault();
    } else if (e.touches.length === 2 && pinchStart) {
      const factor = pinchStart.dist / touchDist(e.touches);
      zoomAt(pinchStart.midX, pinchStart.midY, factor);
      pinchStart.dist = touchDist(e.touches);
      e.preventDefault();
    }
  }, { passive: false });
  svg.addEventListener('touchend', function () { touchPan = null; pinchStart = null; });

  // Control buttons
  document.querySelectorAll('[data-graph-zoom]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const action = btn.getAttribute('data-graph-zoom');
      const rect = svg.getBoundingClientRect();
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      if (action === 'in') zoomAt(cx, cy, 1 / 1.4);
      else if (action === 'out') zoomAt(cx, cy, 1.4);
      else if (action === 'reset') reset();
    });
  });
})();
`;

function renderOpsHomeBody(
  indexMd: string,
  recentMd: string | null,
  decisionsMd: string | null,
): string {
  const stats = parsePortalStats(indexMd);
  const projects = parsePortalProjects(indexMd);
  const sortedProjects = [...projects].sort(
    (a, b) => (b.entities + b.facts + b.sessions) - (a.entities + a.facts + a.sessions),
  );
  const decisions = parseTopDecisions(decisionsMd ?? indexMd);
  const recent = parseRecentChanges(recentMd ?? indexMd).slice(0, 9);
  const compiled = new Date().toISOString().slice(0, 19).replace('T', ' ');

  const statCells: Array<[string, number]> = [
    ['PROJECTS', stats.projects],
    ['ENTITIES', stats.entities],
    ['FACTS', stats.facts],
    ['SESSIONS', stats.sessions],
    ['SOURCES', stats.sources],
    ['DECISIONS', decisions.length],
    ['PATTERNS', 0],
    ['TOPICS', 0],
  ];

  const heroHtml = `
  <div class="hero">
    <div class="stamp">KNOWLEDGE GRAPH · NEO4J · COMPILED ${escapeHtml(compiled)}</div>
    <h1><span class="accent">EVERY</span><br><span class="ghost">THING</span><br><span class="full">WE&nbsp;KNOW</span></h1>
    <p>Auto-generated from <span class="accent">${stats.projects} projects</span>, <span class="accent">${stats.entities} entities</span>, and <span class="accent">${stats.sessions} sessions</span> of agent work. Rebuilt every 6 hours from the AMP knowledge graph.</p>
  </div>`;

  const graphHtml = `
  <details class="graph-wrap">
    <summary>
      <div class="graph-bar-left">
        <div class="swatch"></div>
        <div class="title">GRAPH</div>
        <div class="meta">${projects.length} nodes · click row to expand</div>
      </div>
      <div class="graph-bar-right">
        <span class="status">● NEO4J ONLINE</span>
        <span class="caret"></span>
      </div>
    </summary>
    <div class="graph">${renderOpsGraph(projects)}</div>
  </details>`;

  const statBarHtml = `
  <div class="statbar">
    ${statCells.map(([label, val]) => `
      <div class="cell">
        <div class="label">${escapeHtml(label)}</div>
        <div class="value${val === 0 ? ' zero' : ''}">${val}</div>
      </div>`).join('')}
  </div>`;

  const projectsTableHtml = sortedProjects.map((p, i) => {
    const total = p.entities + p.facts + p.sessions;
    const dim = total === 0;
    return `<a class="proj-row${dim ? ' dim' : ''}" href="${escapeHtml(p.href)}">
      <span class="idx">${String(i + 1).padStart(2, '0')}</span>
      <span><span class="name">${escapeHtml(p.name)}</span></span>
      <span class="num entities${p.entities ? '' : ' zero'}">${p.entities}</span>
      <span class="num${p.facts ? '' : ' zero'}">${p.facts}</span>
      <span class="num${p.sessions ? '' : ' zero'}">${p.sessions}</span>
      <span class="date">${escapeHtml(p.lastActivity)}</span>
    </a>`;
  }).join('');

  const activityHtml = recent.map((c) => `
    <div class="item">
      <div class="meta">
        <span class="date">${escapeHtml(c.date)}</span>
        ${c.status === 'OTHER' ? '' : `<span class="badge ${c.status.toLowerCase()}">${escapeHtml(c.status)}</span>`}
        ${c.project ? `<span class="project">${escapeHtml(c.project)}</span>` : ''}
      </div>
      <div class="title">${escapeHtml(c.title)}</div>
    </div>`).join('');

  const twoColHtml = `
  <div class="two-col">
    <div class="left">
      <div class="section-header">
        <div class="title">PROJECTS</div>
        <div class="hint">${projects.length} total · sorted by activity</div>
      </div>
      <div>${projectsTableHtml}</div>
    </div>
    <div>
      <div class="section-header">
        <div class="title">ACTIVITY</div>
        <div class="hint">last 24h</div>
      </div>
      <div class="activity">
        ${activityHtml}
        <a href="/wiki/_recent"><button class="cta">VIEW ALL CHANGES →</button></a>
      </div>
    </div>
  </div>`;

  const topDecisions = decisions.slice(0, 6);
  const decisionsHtml = `
  <div>
    <div class="section-header">
      <div class="title">TOP DECISIONS</div>
      <div class="hint">ranked by confidence</div>
    </div>
    <div class="decisions-grid">
      ${topDecisions.map((d) => `
        <a class="item" href="/wiki/_decisions">
          <div class="head">
            <span class="project">${escapeHtml(d.project ?? '—')}</span>
            <span class="conf">${d.confidence.toFixed(2)}</span>
          </div>
          <div class="body">${escapeHtml(d.text)}</div>
          ${d.entities.length ? `<div class="ents">${d.entities.map((e) => `<span class="pill">${escapeHtml(e.name)}</span>`).join('')}</div>` : ''}
        </a>`).join('')}
    </div>
  </div>`;

  const panZoomScript = `<script>${GRAPH_PAN_ZOOM_JS}</script>`;
  return heroHtml + graphHtml + statBarHtml + twoColHtml + decisionsHtml + panZoomScript;
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
@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=JetBrains+Mono:wght@400;500;600&display=swap');
:root {
  --bg: #0a0a0a;
  --bg-alt: #070707;
  --surface: #0d0d0d;
  --surface-hover: #0f0f0f;
  --fg: #e8e6e3;
  --fg-muted: #a8a8a8;
  --fg-dim: #888;
  --fg-faint: #666;
  --fg-ghost: #3a3a3a;
  --border: #1a1a1a;
  --border-faint: #141414;
  --border-line: #2a2a2a;
  --accent: #ffd400;
  --ok: #22c98a;
  --warn: #ffaa55;
  --display: 'Archivo Black', 'Anton', 'Inter', sans-serif;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { background: var(--bg); color: var(--fg); }
body {
  font-family: 'JetBrains Mono', 'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace;
  font-size: 13px;
  line-height: 1.55;
}
.display { font-family: var(--display); font-weight: 900; letter-spacing: -0.02em; text-transform: uppercase; }
a { color: var(--fg); text-decoration: none; }

/* TOPBAR */
.topbar {
  display: flex; align-items: center; gap: 0;
  padding: 0 24px; height: 52px;
  border-bottom: 1px solid var(--border);
  background: linear-gradient(180deg, #0d0d0d 0%, #0a0a0a 100%);
  position: sticky; top: 0; z-index: 100;
}
.topbar .brand { display: flex; align-items: center; gap: 10px; margin-right: 32px; }
.topbar .logo {
  width: 22px; height: 22px; border-radius: 4px;
  background: var(--accent); display: grid; place-items: center;
  color: #0a0a0a; font-weight: 900; font-size: 12px; font-family: var(--display);
}
.topbar .title { font-family: var(--display); font-weight: 900; font-size: 14px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--fg); }
.topbar .stamp { font-size: 10px; color: var(--fg-faint); letter-spacing: 0.1em; text-transform: uppercase; margin-left: 4px; }
.topbar nav { display: flex; gap: 0; flex: 1; }
.topbar nav a {
  color: var(--fg-dim); padding: 0 14px; height: 52px; line-height: 52px;
  font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase;
  border-bottom: 2px solid transparent; margin-bottom: -1px;
  transition: color 100ms;
}
.topbar nav a:hover { color: var(--fg); }
.topbar nav a.active { color: var(--fg); border-bottom-color: var(--accent); }
.topbar .status { display: flex; align-items: center; gap: 12px; }
.topbar .status .label { font-size: 10px; color: var(--fg-faint); letter-spacing: 0.1em; }
.topbar .pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px; border-radius: 999px;
  background: #0f0f0f; border: 1px solid #1f1f1f;
  font-size: 10px; letter-spacing: 0.1em; color: var(--ok);
}
.topbar .pill .dot { width: 6px; height: 6px; border-radius: 999px; background: var(--ok); box-shadow: 0 0 8px var(--ok); }

/* FOOTER */
.footer {
  padding: 24px; border-top: 1px solid var(--border);
  display: flex; justify-content: space-between;
  font-size: 10px; letter-spacing: 0.15em; color: #555; text-transform: uppercase;
}

/* SECTION HEADER */
.section-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 18px 12px; border-bottom: 1px solid var(--border-faint);
}
.section-header .title { display: flex; align-items: center; gap: 10px; font-family: var(--display); font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--fg); }
.section-header .title::before { content: ''; display: inline-block; width: 4px; height: 14px; background: var(--accent); }
.section-header .hint { font-size: 10px; letter-spacing: 0.1em; color: var(--fg-faint); text-transform: uppercase; }

/* HOME — HERO */
.hero {
  padding: 48px 24px 32px;
  border-bottom: 1px solid var(--border);
  background: radial-gradient(ellipse at 80% 30%, #ffd40018 0%, transparent 50%), var(--bg);
  position: relative;
}
.hero .stamp { font-size: 10px; letter-spacing: 0.2em; color: var(--fg-dim); text-transform: uppercase; margin-bottom: 14px; }
.hero h1 { font-family: var(--display); font-size: 96px; line-height: 0.92; font-weight: 900; letter-spacing: -0.02em; text-transform: uppercase; }
.hero h1 .accent { color: var(--accent); }
.hero h1 .ghost { color: var(--fg-ghost); }
.hero h1 .full { color: var(--fg); }
.hero p { max-width: 540px; margin-top: 20px; color: var(--fg-muted); font-size: 14px; line-height: 1.6; }
.hero p .accent { color: var(--accent); }

/* GRAPH (collapsible <details>) */
.graph-wrap { position: relative; border-bottom: 1px solid var(--border); background: var(--bg-alt); }
.graph-wrap > summary {
  list-style: none; cursor: pointer; user-select: none;
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px;
  transition: background 100ms;
}
.graph-wrap > summary::-webkit-details-marker { display: none; }
.graph-wrap > summary:hover { background: var(--surface-hover); }
.graph-wrap[open] > summary { border-bottom: 1px solid var(--border-faint); }
.graph-bar-left { display: flex; align-items: center; gap: 10px; }
.graph-bar-left .swatch { width: 4px; height: 14px; background: var(--accent); }
.graph-bar-left .title { font-family: var(--display); font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; }
.graph-bar-left .meta { font-size: 10px; letter-spacing: 0.1em; color: var(--fg-faint); text-transform: uppercase; margin-left: 12px; }
.graph-bar-right { display: flex; align-items: center; gap: 14px; }
.graph-bar-right .status { font-size: 10px; letter-spacing: 0.1em; color: var(--ok); }
.graph-bar-right .caret {
  display: inline-block; width: 12px; height: 12px;
  border-right: 2px solid var(--fg-dim); border-bottom: 2px solid var(--fg-dim);
  transform: rotate(-45deg); transition: transform 200ms;
  margin-bottom: 4px;
}
.graph-wrap[open] > summary .caret { transform: rotate(45deg); margin-bottom: 0; margin-top: 4px; }
.graph-wrap > summary:hover .caret { border-color: var(--accent); }
.graph { position: relative; }
.graph svg { display: block; width: 100%; height: 520px; touch-action: none; cursor: grab; }
.graph svg.panning { cursor: grabbing; }
.graph .node-label { fill: #a0a0a0; font-size: 10px; font-family: 'JetBrains Mono', monospace; text-transform: uppercase; letter-spacing: 0.05em; }
.graph .node:hover .node-label { fill: var(--fg); }
.graph .edge { stroke: #2a2a2a; stroke-width: 0.7; opacity: 0.55; }
.graph .controls {
  position: absolute; right: 16px; top: 16px; z-index: 5;
  display: flex; gap: 0;
  background: var(--surface); border: 1px solid var(--border);
}
.graph .controls button {
  background: transparent; border: none; color: var(--fg-dim);
  width: 32px; height: 32px; padding: 0; cursor: pointer;
  font-family: var(--display); font-size: 14px; line-height: 32px;
  border-right: 1px solid var(--border);
  transition: color 100ms, background 100ms;
}
.graph .controls button:last-child { border-right: none; }
.graph .controls button:hover { color: var(--accent); background: var(--surface-hover); }
.graph .hint {
  position: absolute; left: 16px; bottom: 12px;
  font-size: 9px; letter-spacing: 0.15em; color: var(--fg-faint);
  text-transform: uppercase; pointer-events: none; user-select: none;
}

/* SCROLLBARS — match the wiki's dark theme */
* { scrollbar-width: thin; scrollbar-color: var(--border-line) var(--bg); }
::-webkit-scrollbar { width: 10px; height: 10px; background: var(--bg); }
::-webkit-scrollbar-track { background: var(--bg); border-left: 1px solid var(--border); }
::-webkit-scrollbar-thumb {
  background: var(--border-line); border: 2px solid var(--bg);
  border-radius: 0; min-height: 30px;
}
::-webkit-scrollbar-thumb:hover { background: var(--accent); }
::-webkit-scrollbar-corner { background: var(--bg); }

/* STAT BAR */
.statbar { display: grid; grid-template-columns: repeat(8, 1fr); border-bottom: 1px solid var(--border); }
.statbar .cell { padding: 14px 18px; border-right: 1px solid var(--border); }
.statbar .cell:last-child { border-right: none; }
.statbar .cell .label { font-size: 9px; letter-spacing: 0.15em; color: var(--fg-faint); text-transform: uppercase; }
.statbar .cell .value { font-family: var(--display); font-size: 28px; color: var(--fg); margin-top: 2px; }
.statbar .cell .value.zero { color: var(--fg-ghost); }

/* TWO-COL: PROJECTS + ACTIVITY */
.two-col { display: grid; grid-template-columns: 1fr 380px; border-bottom: 1px solid var(--border); }
.two-col .left { border-right: 1px solid var(--border); }
.proj-row {
  display: grid; grid-template-columns: 32px 1fr 70px 70px 70px 110px;
  align-items: center; width: 100%; text-align: left;
  padding: 10px 18px; background: transparent; border: none;
  border-bottom: 1px solid var(--border-faint);
  color: var(--fg); font-family: inherit; font-size: 13px; cursor: pointer;
  transition: background 100ms;
}
.proj-row:hover { background: var(--surface-hover); }
.proj-row.dim { color: #5a5a5a; }
.proj-row .idx { color: #444; font-size: 11px; }
.proj-row .name { color: var(--fg); }
.proj-row.dim .name { color: #5a5a5a; }
.proj-row .tag { color: #555; margin-left: 10px; font-size: 11px; }
.proj-row .num { text-align: right; }
.proj-row .num.zero { color: var(--fg-ghost); }
.proj-row .num.entities { color: var(--accent); }
.proj-row .num.entities.zero { color: var(--fg-ghost); }
.proj-row .date { text-align: right; color: #777; font-size: 11px; }
.activity { padding: 0 18px 18px; }
.activity .item { padding: 10px 0; border-bottom: 1px solid var(--border-faint); font-size: 12px; }
.activity .item:last-child { border-bottom: none; }
.activity .meta { display: flex; gap: 8px; align-items: center; margin-bottom: 4px; }
.activity .meta .date { color: var(--fg-faint); font-size: 10px; }
.activity .meta .badge { font-size: 9px; padding: 2px 6px; letter-spacing: 0.1em; }
.activity .meta .badge.approved { background: #0d2a1a; color: var(--ok); }
.activity .meta .badge.proposed { background: #2a1a0d; color: var(--warn); }
.activity .meta .project { color: var(--accent); font-size: 10px; }
.activity .item .title { color: #c8c8c8; line-height: 1.5; }
.activity .cta {
  margin-top: 12px; background: transparent; border: 1px solid var(--accent);
  color: var(--accent); padding: 8px 14px; font-family: inherit; font-size: 11px;
  letter-spacing: 0.1em; cursor: pointer; width: 100%; text-transform: uppercase;
}
.activity .cta:hover { background: var(--accent); color: #0a0a0a; }

/* TOP DECISIONS */
.decisions-grid { display: grid; grid-template-columns: repeat(2, 1fr); }
.decisions-grid .item {
  padding: 16px 18px;
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  background: transparent; cursor: pointer; color: var(--fg); font-family: inherit;
  transition: background 100ms;
}
.decisions-grid .item:nth-child(2n) { border-right: none; }
.decisions-grid .item:hover { background: var(--surface-hover); }
.decisions-grid .head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
.decisions-grid .head .project { color: var(--accent); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; }
.decisions-grid .head .conf { font-family: var(--display); font-size: 14px; color: var(--fg); }
.decisions-grid .body { color: #e0e0e0; line-height: 1.45; font-size: 13px; }
.decisions-grid .ents { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
.decisions-grid .ents .pill { font-size: 10px; color: var(--fg-dim); padding: 2px 6px; border: 1px solid var(--border-line); }

/* CRUMB */
.crumb { font-size: 10px; letter-spacing: 0.2em; color: var(--fg-faint); text-transform: uppercase; margin-bottom: 8px; }
.crumb a { color: var(--fg-faint); }
.crumb a:hover { color: var(--fg); }
.crumb .here { color: var(--accent); }

/* PAGE HEADER (project/entity) */
.page-header { padding: 32px 24px 24px; border-bottom: 1px solid var(--border); }
.page-header h1 { font-family: var(--display); font-size: 64px; line-height: 1; color: var(--fg); font-weight: 900; letter-spacing: -0.02em; text-transform: uppercase; margin-bottom: 16px; }
.page-header .meta { display: flex; gap: 16px; font-size: 12px; color: var(--fg-faint); }
.page-header .meta .accent { color: var(--accent); }

/* ARTICLE / MARKDOWN BODY (project & entity pages) */
.content { padding: 24px; }
.content h1 { font-family: var(--display); font-size: 32px; line-height: 1.1; margin: 0 0 12px; text-transform: uppercase; letter-spacing: -0.01em; }
.content h2 {
  font-family: var(--display); font-size: 14px; letter-spacing: 0.1em; text-transform: uppercase;
  margin: 32px 0 12px; padding-left: 12px; border-left: 4px solid var(--accent);
}
.content h3 { font-size: 13px; font-weight: 600; color: var(--fg); margin: 18px 0 6px; text-transform: uppercase; letter-spacing: 0.05em; }
.content p { margin: 8px 0; color: var(--fg); line-height: 1.65; }
.content em { color: var(--fg-muted); font-style: normal; }
.content strong { color: var(--fg); font-weight: 600; }
.content blockquote {
  border-left: 2px solid var(--accent);
  padding: 8px 14px; margin: 8px 0;
  color: #d8d8d8; background: var(--surface);
}
.content ul, .content ol { padding-left: 18px; margin: 6px 0; }
.content li { margin: 3px 0; line-height: 1.55; }
.content code {
  background: var(--surface); color: #c0c0c0;
  padding: 1px 6px; border: 1px solid var(--border); font-family: inherit; font-size: 12px;
}
.content pre {
  background: var(--surface); border: 1px solid var(--border);
  padding: 12px; overflow-x: auto; margin: 10px 0; font-family: inherit; font-size: 12px;
}
.content pre code { background: none; padding: 0; border: none; }
.content table {
  border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 12px;
  border: 1px solid var(--border);
}
.content th, .content td { padding: 8px 12px; border-bottom: 1px solid var(--border-faint); text-align: left; }
.content th {
  background: var(--surface); font-weight: 600; color: var(--fg);
  font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase;
}
.content tr:hover td { background: var(--surface-hover); }
.content td[align="right"] { text-align: right; }
.content a { color: var(--accent); border-bottom: 1px dotted var(--accent); }
.content a:hover { color: var(--fg); border-bottom-style: solid; }
.content a.wikilink { color: var(--accent); border-bottom: 1px dotted var(--accent); }
.content a.wikilink:hover { color: var(--fg); border-bottom-style: solid; }
.content hr { border: none; border-top: 1px solid var(--border); margin: 18px 0; }

.content .project-context {
  background: var(--surface); border: 1px solid var(--border);
  padding: 12px; margin: 0 0 20px;
}
.content .project-context .crumb { margin-bottom: 10px; }
.content .project-tools {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
}
.content .project-tools > a,
.content .project-tools button {
  border: 1px solid var(--border-line); color: var(--fg-muted);
  background: transparent; padding: 6px 10px; font-family: inherit;
  font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase;
  cursor: pointer;
}
.content .project-tools > a:hover,
.content .project-tools button:hover {
  color: var(--accent); border-color: var(--accent);
}
.content .project-search {
  display: flex; align-items: center; gap: 8px; margin-left: auto; min-width: min(100%, 340px);
}
.content .project-search input[type="text"] {
  width: 100%; min-width: 160px; background: var(--bg);
  border: 1px solid var(--border-line); color: var(--fg);
  padding: 6px 8px; font-family: inherit; font-size: 11px;
}

/* MAIN LAYOUT FOR MARKDOWN PAGES (with sidebar) */
.main-with-sidebar { display: grid; grid-template-columns: 240px 1fr; min-height: calc(100vh - 52px - 80px); }
.main-with-sidebar aside.sidebar {
  border-right: 1px solid var(--border);
  padding: 18px;
  font-size: 12px;
  background: var(--bg-alt);
  max-height: calc(100vh - 52px);
  overflow-y: auto;
  position: sticky; top: 52px;
}
.main-with-sidebar aside.sidebar h3 {
  font-size: 9px; letter-spacing: 0.15em; color: var(--fg-faint);
  text-transform: uppercase; margin: 16px 0 8px; font-weight: 600;
}
.main-with-sidebar aside.sidebar h3:first-child { margin-top: 0; }
.main-with-sidebar aside.sidebar ul { list-style: none; padding: 0; }
.main-with-sidebar aside.sidebar li { margin: 4px 0; }
.main-with-sidebar aside.sidebar a {
  color: var(--fg-muted); font-size: 12px; display: block;
  padding: 2px 0; border: none; text-transform: lowercase;
}
.main-with-sidebar aside.sidebar a:hover { color: var(--accent); }

/* SEARCH */
.search-page { padding: 32px 24px; }
.search-page .input {
  display: flex; align-items: center; gap: 14px; margin: 12px 0 18px;
  border-bottom: 1px solid var(--border); padding-bottom: 18px;
}
.search-page .input .q { font-family: var(--display); font-size: 56px; color: var(--accent); }
.search-page .input input {
  flex: 1; background: transparent; border: none; outline: none;
  font-family: var(--display); font-size: 48px; color: var(--fg);
  font-weight: 900; letter-spacing: -0.02em; text-transform: uppercase;
}
.search-page .input .hits { font-family: var(--display); font-size: 14px; color: var(--fg-faint); }
.search-page .search-filter {
  display: flex; align-items: center; gap: 10px; margin: 0 0 14px;
}
.search-page .filter-pill,
.search-page .clear-filter {
  border: 1px solid var(--border-line); padding: 5px 9px;
  font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase;
}
.search-page .filter-pill { color: var(--accent); }
.search-page .clear-filter { color: var(--fg-muted); }
.search-page .clear-filter:hover { color: var(--accent); border-color: var(--accent); }
.search-page .results .result {
  padding: 14px 24px; border-bottom: 1px solid var(--border-faint);
  display: block; color: var(--fg); cursor: pointer;
}
.search-page .results .result:hover { background: var(--surface-hover); }
.search-page .results .result .title { color: var(--fg); font-size: 13px; }
.search-page .results .result .snippet { color: var(--fg-dim); font-size: 12px; margin-top: 4px; line-height: 1.5; }
.search-page .results .result .snippet mark { background: #ffd40022; color: var(--accent); padding: 1px 2px; }

/* TAG / FRONTMATTER (legacy markdown) */
.frontmatter {
  background: var(--surface); border: 1px solid var(--border);
  padding: 8px 12px; margin: 12px 24px; font-size: 11px; color: var(--fg-faint);
  display: flex; flex-wrap: wrap; gap: 12px;
}
.tag {
  display: inline-block; background: transparent; color: var(--accent);
  padding: 2px 6px; font-size: 10px; border: 1px solid var(--border-line);
  margin: 2px; letter-spacing: 0.05em;
}

.mermaid { background: var(--surface); padding: 16px; border: 1px solid var(--border); margin: 12px 0; text-align: center; }
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

// ─── Wiki cache ────────────────────────────────────────────────────────────

interface SearchEntry {
  absPath: string;
  relPath: string;
  content: string;
  /** Pre-lowercased content for search — avoids per-query allocation. */
  contentLower: string;
  title: string;
  titleLower: string;
  pathLower: string;
  projectSlug: string | null;
}

interface WikiCache {
  /** Pre-built global sidebar HTML */
  sidebarHtml: string;
  /** Search index: wiki path (no .md extension) -> file content + metadata */
  searchIndex: Map<string, SearchEntry>;
  /** Absolute wiki directory this cache was built from */
  wikiDir: string;
}

let wikiCache: WikiCache | null = null;
let cacheWatcher: FSWatcher | null = null;
let cacheRebuildTimer: ReturnType<typeof setTimeout> | null = null;

const DEBOUNCE_MS = 500;

function extractProjectSlug(wikiPath: string): string | null {
  return wikiPath.match(/^projects\/([^/]+)\//)?.[1] ?? null;
}

function labelFromSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function tokenizeSearchQuery(query: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const term of query.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    if (seen.has(term)) continue;
    seen.add(term);
    terms.push(term);
  }
  return terms;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Build (or rebuild) sidebar HTML and search index from disk. */
async function buildCache(wikiDir: string): Promise<WikiCache> {
  const files = await discoverMarkdownFiles(wikiDir);

  // Build sidebar HTML (pure computation, no I/O)
  const sidebarHtml = buildSidebarFromFiles(files);

  // Build search index by reading all file contents
  const searchIndex = new Map<string, SearchEntry>();
  for (const file of files) {
    try {
      const content = await readFile(file.absPath, 'utf-8');
      const wikiPath = file.relPath.replace(/\.md$/, '');
      const titleMatch = content.match(/^# (.+)$/m);
      const title = titleMatch ? titleMatch[1] : wikiPath.split('/').pop() ?? wikiPath;
      searchIndex.set(wikiPath, {
        absPath: file.absPath,
        relPath: file.relPath,
        content,
        contentLower: content.toLowerCase(),
        title,
        titleLower: title.toLowerCase(),
        pathLower: wikiPath.toLowerCase(),
        projectSlug: extractProjectSlug(wikiPath),
      });
    } catch (err) {
      console.error('[wiki-viewer] Failed to read file for search index (skipping):', file.absPath, err instanceof Error ? err.message : err);
    }
  }

  return { sidebarHtml, searchIndex, wikiDir };
}

/** Invalidate the cache and schedule a debounced rebuild. */
function scheduleCacheRebuild(wikiDir: string): void {
  if (cacheRebuildTimer) clearTimeout(cacheRebuildTimer);
  cacheRebuildTimer = setTimeout(async () => {
    try {
      wikiCache = await buildCache(wikiDir);
      console.error('[wiki-viewer] Cache rebuilt after file change');
    } catch (err) {
      console.error('[wiki-viewer] Cache rebuild failed:', err instanceof Error ? err.message : err);
    }
  }, DEBOUNCE_MS);
}

/** Start watching the wiki directory for changes. */
function startWatching(wikiDir: string): void {
  stopWatching();
  try {
    cacheWatcher = watch(wikiDir, { recursive: true }, (_eventType, filename) => {
      // Only rebuild for markdown file changes
      if (filename && filename.endsWith('.md')) {
        scheduleCacheRebuild(wikiDir);
      }
    });
    cacheWatcher.on('error', (err) => {
      console.error('[wiki-viewer] File watcher error:', err instanceof Error ? err.message : err);
    });
  } catch (err) {
    console.error('[wiki-viewer] Failed to start file watcher (cache will require manual refresh):', err instanceof Error ? err.message : err);
  }
}

/** Stop watching and cancel any pending rebuild timer. */
function stopWatching(): void {
  if (cacheWatcher) {
    cacheWatcher.close();
    cacheWatcher = null;
  }
  if (cacheRebuildTimer) {
    clearTimeout(cacheRebuildTimer);
    cacheRebuildTimer = null;
  }
}

/** Get the current cache, building it on first call or when wikiDir changes. */
async function getCache(wikiDir: string): Promise<WikiCache> {
  if (wikiCache && wikiCache.wikiDir === wikiDir) return wikiCache;
  wikiCache = await buildCache(wikiDir);
  return wikiCache;
}

/**
 * Reset the module-level cache and stop the file watcher.
 * Exported for testing cleanup between test suites.
 */
export function resetViewerCache(): void {
  wikiCache = null;
  stopWatching();
}

// ─── Global sidebar builder ─────────────────────────────────────────────────

/** Build sidebar HTML from a pre-discovered file list (no disk I/O). */
function buildSidebarFromFiles(files: FileEntry[]): string {
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

/** Get cached sidebar HTML, building the cache on first call. */
async function getCachedSidebar(wikiDir: string): Promise<string> {
  const cache = await getCache(wikiDir);
  return cache.sidebarHtml;
}

async function getProjectLabel(wikiDir: string, projectSlug: string): Promise<string> {
  const cache = await getCache(wikiDir);
  return cache.searchIndex.get(`projects/${projectSlug}/_index`)?.title ?? labelFromSlug(projectSlug);
}

function buildProjectContext(slugPath: string, title: string, projectLabel: string): string {
  const match = slugPath.match(/^projects\/([^/]+)(?:\/(.+))?$/);
  if (!match) return '';

  const projectSlug = match[1];
  const childPath = match[2] ?? '_index';
  const projectHref = `/wiki/projects/${projectSlug}/_index`;
  const graphHref = `/wiki/projects/${projectSlug}/_graph`;
  const isProjectIndex = childPath === '_index';
  const currentLabel = childPath === '_graph' ? 'Knowledge Graph' : title;
  const crumbTail = isProjectIndex
    ? `<span class="here">${escapeHtml(projectLabel)}</span>`
    : `<a href="${escapeHtml(projectHref)}">${escapeHtml(projectLabel)}</a> / <span class="here">${escapeHtml(currentLabel)}</span>`;

  return `<div class="project-context">
    <div class="crumb"><a href="/wiki/_index">PORTAL</a> / ${crumbTail}</div>
    <div class="project-tools">
      <a href="${escapeHtml(projectHref)}">PROJECT HOME</a>
      <a href="${escapeHtml(graphHref)}">GRAPH</a>
      <form method="GET" action="/search" class="project-search">
        <input type="hidden" name="project" value="${escapeHtml(projectSlug)}">
        <input type="text" name="q" placeholder="Search ${escapeHtml(projectLabel)}">
        <button type="submit">SEARCH</button>
      </form>
    </div>
  </div>`;
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
    const seen = new Map<string, number>();
    lines.push('<h3>Sections</h3>');
    lines.push('<ul>');
    for (const h of headings) {
      const text = headingTextFromMarkdown(h.replace(/^## /, ''));
      const anchor = uniqueHeadingAnchor(text, seen);
      lines.push(`<li><a href="#${anchor}">${escapeHtml(text)}</a></li>`);
    }
    lines.push('</ul>');
  }

  return lines.join('\n');
}

// ─── Path confinement ───────────────────────────────────────────────────────

/**
 * Ensure a resolved path is confined within baseDir.
 * Returns the resolved path if safe, or null if the path escapes.
 * Rejects null bytes, and uses trailing-separator comparison to prevent
 * prefix tricks (e.g. /wiki_dir_evil/ matching /wiki_dir/).
 */
export function confineToDir(baseDir: string, userPath: string): string | null {
  // Reject null bytes — they can truncate paths in some runtimes
  if (userPath.includes('\0')) return null;

  const resolvedBase = resolve(baseDir) + sep;
  const resolvedPath = resolve(baseDir, userPath);

  // The resolved path must either BE the baseDir or START WITH baseDir + separator
  if (resolvedPath !== resolve(baseDir) && !resolvedPath.startsWith(resolvedBase)) {
    return null;
  }

  return resolvedPath;
}

// ─── File resolution ────────────────────────────────────────────────────────

/**
 * Resolve a URL slug path to a markdown file on disk.
 * Tries: <path>.md, <path>/_index.md
 * Returns null if the slug escapes the wiki directory.
 */
async function resolveFile(wikiDir: string, slugPath: string): Promise<string | null> {
  // Confine direct .md path
  const directConfined = confineToDir(wikiDir, `${slugPath}.md`);
  if (directConfined) {
    try {
      const s = await stat(directConfined);
      if (s.isFile()) return directConfined;
    } catch (_) { /* not found */ }
  }

  // Confine directory _index.md path
  const indexConfined = confineToDir(wikiDir, join(slugPath, '_index.md'));
  if (indexConfined) {
    try {
      const s = await stat(indexConfined);
      if (s.isFile()) return indexConfined;
    } catch (_) { /* not found */ }
  }

  return null;
}

// ─── Request handlers ───────────────────────────────────────────────────────

/** Map a slug path to the active nav id for top-bar highlighting. */
function navIdForSlug(slugPath: string): string {
  if (slugPath === '_index') return 'home';
  if (slugPath === '_decisions') return 'decisions';
  if (slugPath === '_patterns') return 'patterns';
  if (slugPath === '_recent') return 'recent';
  if (slugPath === 'topics/_index' || slugPath.startsWith('topics/')) return 'topics';
  if (slugPath === 'library/_index' || slugPath.startsWith('library/')) return 'library';
  return 'none';
}

async function handleWikiPage(wikiDir: string, slugPath: string, res: ServerResponse): Promise<void> {
  const filePath = await resolveFile(wikiDir, slugPath);

  if (!filePath) {
    res.writeHead(404);
    res.end(htmlPage('Not Found', '<h1>Page not found</h1><p>This wiki page does not exist yet.</p>'));
    return;
  }

  const content = await readFile(filePath, 'utf-8');
  const activeNav = navIdForSlug(slugPath);

  // ── Bespoke route: Operations Console home ────────────────────────────────
  // Only triggers when the markdown actually looks like a portal index (has the
  // recognizable stats line). Otherwise falls through to standard markdown rendering
  // so test fixtures and any alternate _index.md layouts still work.
  if (slugPath === '_index' && /\*\*\d+\*\* projects · \*\*\d+\*\* entities/.test(content)) {
    let recentMd: string | null = null;
    let decisionsMd: string | null = null;
    try {
      const rPath = await resolveFile(wikiDir, '_recent');
      if (rPath) recentMd = await readFile(rPath, 'utf-8');
    } catch (_) { /* optional */ }
    try {
      const dPath = await resolveFile(wikiDir, '_decisions');
      if (dPath) decisionsMd = await readFile(dPath, 'utf-8');
    } catch (_) { /* optional */ }
    const homeBody = renderOpsHomeBody(content, recentMd, decisionsMd);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(htmlPage('Portal', homeBody, '', { activeNav, contentWrap: false }));
    return;
  }

  // Build sidebar: cached global nav + page-level metadata/TOC
  const globalNav = await getCachedSidebar(wikiDir);
  const pageSidebar = buildPageSidebar(content);
  const fullSidebar = globalNav + (pageSidebar ? '\n<hr style="border-color: var(--border); margin: 0.75rem 0;">\n' + pageSidebar : '');

  // Strip frontmatter for rendering
  const bodyContent = content.replace(/^---\n[\s\S]*?\n---\n*/, '');
  const html = await renderMarkdown(bodyContent);

  // Extract title from first h1
  const titleMatch = bodyContent.match(/^# (.+)$/m);
  const title = titleMatch ? titleMatch[1] : slugPath.split('/').pop() ?? 'Wiki';
  const projectSlug = extractProjectSlug(slugPath);
  const projectContext = projectSlug
    ? buildProjectContext(slugPath, title, await getProjectLabel(wikiDir, projectSlug))
    : '';

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
  res.end(htmlPage(title, projectContext + fmBar + html, fullSidebar, { activeNav }));
}

async function handleSearch(wikiDir: string, query: string, projectFilter: string | null, res: ServerResponse): Promise<void> {
  const cache = (query || projectFilter) ? await getCache(wikiDir) : null;
  const queryLower = query.toLowerCase();
  const queryTerms = tokenizeSearchQuery(query);
  const normalizedProject = projectFilter?.trim().toLowerCase() || null;
  const projectLabel = normalizedProject
    ? cache?.searchIndex.get(`projects/${normalizedProject}/_index`)?.title ?? labelFromSlug(normalizedProject)
    : null;
  const results: Array<{ wikiPath: string; title: string; snippet: string; score: number }> = [];

  if (cache && query) {
    for (const [wikiPath, entry] of cache.searchIndex) {
      if (normalizedProject && entry.projectSlug !== normalizedProject) continue;
      const exactIdx = entry.contentLower.indexOf(queryLower);
      const termIndexes = queryTerms.map((term) => entry.contentLower.indexOf(term));
      const allTermsMatch = queryTerms.length > 1 && termIndexes.every((idx) => idx !== -1);
      const idx = exactIdx !== -1 ? exactIdx : allTermsMatch ? Math.min(...termIndexes) : -1;
      if (idx !== -1) {
        const start = Math.max(0, idx - 80);
        const matchedLength = exactIdx !== -1
          ? query.length
          : Math.max(...queryTerms.map((term) => term.length));
        const end = Math.min(entry.content.length, idx + matchedLength + 80);
        const snippet = entry.content.slice(start, end).replace(/\n/g, ' ').trim();
        let score = Math.max(0, 100 - Math.floor(idx / 20));
        if (exactIdx !== -1) score += 150;
        if (entry.titleLower === queryLower) score += 1000;
        else if (entry.titleLower.startsWith(queryLower)) score += 750;
        else if (entry.titleLower.includes(queryLower)) score += 500;
        const titleTermHits = queryTerms.filter((term) => entry.titleLower.includes(term)).length;
        score += titleTermHits * 80;
        if (entry.pathLower.includes(queryLower.replace(/\s+/g, '-'))) score += 200;
        const pathTermHits = queryTerms.filter((term) => entry.pathLower.includes(term)).length;
        score += pathTermHits * 40;
        if (wikiPath.endsWith('/_index')) score += 50;
        if (wikiPath === '_index') score -= 100;
        results.push({ wikiPath, title: entry.title, snippet, score });
      }
    }
    results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  }

  function highlightSnippet(snippet: string, q: string, terms: string[]): string {
    if (!q) return escapeHtml(snippet);
    const lower = snippet.toLowerCase();
    const i = lower.indexOf(q.toLowerCase());
    if (i !== -1) {
      return escapeHtml(snippet.slice(0, i)) +
        `<mark>${escapeHtml(snippet.slice(i, i + q.length))}</mark>` +
        escapeHtml(snippet.slice(i + q.length));
    }
    const escaped = escapeHtml(snippet);
    if (terms.length === 0) return escaped;
    const re = new RegExp(`\\b(${terms.map(escapeRegExp).join('|')})\\b`, 'gi');
    return escaped.replace(re, '<mark>$1</mark>');
  }

  const resultsHtml = results.length === 0
    ? `<div class="result"><div class="title" style="color:var(--fg-faint);">${query ? 'No results found.' : 'Type a query to search the wiki.'}</div></div>`
    : results.map((r) =>
        `<a class="result" href="/wiki/${escapeHtml(r.wikiPath)}">
           <div class="title">${escapeHtml(r.title)}</div>
           <div class="snippet">${highlightSnippet(r.snippet, query, queryTerms)}</div>
         </a>`,
      ).join('');

  const clearSearchHref = query ? `/search?q=${encodeURIComponent(query)}` : '/search';
  const searchCrumb = normalizedProject && projectLabel
    ? `<div class="crumb"><a href="/wiki/_index">PORTAL</a> / <a href="/wiki/projects/${escapeHtml(normalizedProject)}/_index">${escapeHtml(projectLabel)}</a> / <span class="here">SEARCH</span></div>`
    : '<div class="crumb"><a href="/wiki/_index">PORTAL</a> / <span class="here">SEARCH</span></div>';
  const filterHtml = normalizedProject && projectLabel
    ? `<div class="search-filter"><span class="filter-pill">PROJECT: ${escapeHtml(projectLabel)}</span><a class="clear-filter" href="${escapeHtml(clearSearchHref)}">CLEAR</a></div>`
    : '';

  const body = `
    <div class="search-page">
      ${searchCrumb}
      <form method="GET" action="/search" class="input">
        <span class="q">?</span>
        <input type="text" name="q" placeholder="search the graph…" value="${escapeHtml(query)}" autofocus>
        ${normalizedProject ? `<input type="hidden" name="project" value="${escapeHtml(normalizedProject)}">` : ''}
        <span class="hits">${results.length} HITS</span>
      </form>
      ${filterHtml}
      <div class="results">${resultsHtml}</div>
    </div>`;
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(htmlPage(query ? `Search: ${query}` : 'Search', body, '', { activeNav: 'search', contentWrap: false }));
}

// ─── Server ─────────────────────────────────────────────────────────────────

export function startWikiViewer(config: ViewerConfig): Promise<ReturnType<typeof createServer>> {
  const { port, wiki_dir } = config;

  // Pre-build the cache eagerly on startup (non-blocking — handlers will
  // await getCache() which returns instantly once this resolves)
  buildCache(wiki_dir)
    .then((cache) => {
      wikiCache = cache;
      console.error('[wiki-viewer] Initial cache built');
    })
    .catch((err) => {
      console.error('[wiki-viewer] Initial cache build failed (will retry on first request):', err instanceof Error ? err.message : err);
    });

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const url = new URL(req.url ?? '/', `http://localhost:${port}`);
      const path = url.pathname;

      if (path === '/' || path === '') {
        // Redirect root to portal
        res.writeHead(302, { Location: '/wiki/_index' });
        res.end();
      } else if (path === '/api/refresh' && req.method === 'POST') {
        // Manual cache refresh endpoint
        try {
          wikiCache = await buildCache(wiki_dir);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, files: wikiCache.searchIndex.size }));
        } catch (err) {
          console.error('[wiki-viewer] Manual refresh failed:', err instanceof Error ? err.message : err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : 'unknown' }));
        }
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
        const projectFilter = url.searchParams.get('project');
        await handleSearch(wiki_dir, query, projectFilter, res);
      } else if (path.startsWith('/api/graph/')) {
        const jsonPath = decodeURIComponent(path.slice('/api/graph/'.length));
        const filePath = confineToDir(wiki_dir, jsonPath);
        if (!filePath) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }
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

  // Clean up watcher when server closes
  server.on('close', () => {
    stopWatching();
  });

  return new Promise((resolve, reject) => {
    const onError = (err: Error & { code?: string }) => {
      // Startup failed — clean up cache/watcher resources that were eagerly started
      stopWatching();
      wikiCache = null;
      const code = err.code ?? 'UNKNOWN';
      const msg = `[wiki-viewer] Failed to start on port ${port}: ${code} — ${err.message}`;
      reject(new Error(msg, { cause: err }));
    };

    server.once('error', onError);

    server.listen(port, () => {
      // Remove the one-shot error listener to avoid a leak — runtime errors
      // after successful startup should be handled by the caller if needed.
      server.removeListener('error', onError);
      // Start file watcher only after successful bind
      startWatching(wiki_dir);
      console.error(`[wiki-viewer] Serving wiki from ${wiki_dir} on http://localhost:${port}`);
      resolve(server);
    });
  });
}
