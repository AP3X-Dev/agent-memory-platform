/**
 * Self-contained HTML export — an offline, dependency-free force-directed viewer
 * of the memory graph. Open the file in any browser: pan, zoom, drag nodes, and
 * click a node to inspect its (already allowlisted, secret-safe) properties.
 *
 * XSS posture (Risk: "HTML Export Creates XSS" / C-11):
 *  - The graph is embedded as JSON inside a <script type="application/json">
 *    block, with `<`/`>`/`&`/U+2028/U+2029 escaped so no markup can break out.
 *  - The browser renders every label/property via `textContent` (never
 *    innerHTML), so embedded markup is inert.
 *  - Server-rendered text (title, legend, banner) is passed through escapeHtml.
 * Generation is deterministic: layout runs client-side at view time, so the
 * emitted HTML string is a pure function of the snapshot.
 */
import type { AmpGraphSnapshot } from './types.js';
import { exportJson } from './export-json.js';

export const DEFAULT_MAX_RENDER_NODES = 1500;

const NODE_TYPE_COLORS: Record<string, string> = {
  entity: '#4fd1a0',
  component: '#6cc6ff',
  symbol: '#3d8bff',
  semantic: '#ffc861',
  episodic: '#ff9a5b',
  fact: '#9ad36b',
  source: '#c79bff',
  aspect: '#ff6cb0',
  community: '#5be0e0',
  unknown: '#9aa3b2',
};

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escape a JSON string so it cannot terminate the surrounding <script> tag. */
export function escapeJsonForScript(json: string): string {
  return json
    .replace(/&/g, '\\u0026')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export interface RenderSelection {
  nodes: AmpGraphSnapshot['nodes'];
  edges: AmpGraphSnapshot['edges'];
  render_truncated: boolean;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** When over the render cap, keep the top-degree nodes (deterministic) + their edges. */
export function selectRenderNodes(graph: AmpGraphSnapshot, cap: number): RenderSelection {
  if (graph.nodes.length <= cap) {
    return { nodes: graph.nodes, edges: graph.edges, render_truncated: false };
  }
  const degree = new Map<string, number>();
  for (const e of graph.edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }
  const kept = [...graph.nodes]
    .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || cmp(a.id, b.id))
    .slice(0, cap)
    .sort((a, b) => cmp(a.id, b.id));
  const keptIds = new Set(kept.map((n) => n.id));
  const edges = graph.edges.filter((e) => keptIds.has(e.source) && keptIds.has(e.target));
  return { nodes: kept, edges, render_truncated: true };
}

const STYLE = `
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: #0f1117; color: #d7dce5;
  font-family: -apple-system, Segoe UI, Roboto, sans-serif; overflow: hidden; }
#cv { position: fixed; inset: 0; width: 100vw; height: 100vh; cursor: grab; }
#cv:active { cursor: grabbing; }
#title { position: fixed; top: 12px; left: 16px; font-size: 14px; font-weight: 600;
  color: #aeb6c4; pointer-events: none; }
#banner { position: fixed; top: 36px; left: 16px; font-size: 12px; color: #ffb454;
  pointer-events: none; max-width: 60vw; }
#legend { position: fixed; bottom: 12px; left: 16px; font-size: 11px;
  background: rgba(20,24,33,0.85); border: 1px solid #232838; border-radius: 8px;
  padding: 8px 10px; }
#legend .row { display: flex; align-items: center; gap: 6px; margin: 2px 0; }
#legend .sw { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
#info { position: fixed; top: 12px; right: 12px; width: 300px; max-height: 92vh;
  overflow: auto; background: rgba(20,24,33,0.92); border: 1px solid #232838;
  border-radius: 10px; padding: 12px 14px; font-size: 12px; display: none; }
#info.show { display: block; }
#info .ih { font-size: 13px; font-weight: 700; color: #e8edf5; word-break: break-word; }
#info .it { color: #7d8696; margin-bottom: 8px; text-transform: uppercase;
  letter-spacing: .04em; font-size: 10px; }
#info .ir { display: flex; gap: 8px; padding: 3px 0; border-top: 1px solid #1c2130; }
#info .ik { color: #8b94a6; flex: 0 0 38%; word-break: break-word; }
#info .iv { color: #cdd5e1; flex: 1; word-break: break-word; white-space: pre-wrap; }
#hint { position: fixed; bottom: 12px; right: 16px; font-size: 11px; color: #5b6473;
  pointer-events: none; }
`;

// Browser viewer. IMPORTANT: no backticks and no ${...} here — this whole string
// is embedded verbatim. All label/property text is rendered via textContent.
const VIEWER_JS = `
(function () {
  'use strict';
  var data = JSON.parse(document.getElementById('amp-graph-data').textContent);
  var nodes = data.nodes || [], edges = data.edges || [];
  var colors = JSON.parse(document.getElementById('amp-graph-colors').textContent);
  var canvas = document.getElementById('cv'), ctx = canvas.getContext('2d');
  var dpr = window.devicePixelRatio || 1, W = 0, H = 0;
  function resize() { W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr,0,0,dpr,0,0); }
  window.addEventListener('resize', resize);
  var idx = {}, deg = {};
  for (var i = 0; i < nodes.length; i++) { idx[nodes[i].id] = i; deg[nodes[i].id] = 0; }
  for (var j = 0; j < edges.length; j++) {
    if (deg[edges[j].source] !== undefined) deg[edges[j].source]++;
    if (deg[edges[j].target] !== undefined) deg[edges[j].target]++; }
  for (var k = 0; k < nodes.length; k++) {
    var a = 2 * Math.PI * k / Math.max(1, nodes.length);
    nodes[k]._x = Math.cos(a) * 260; nodes[k]._y = Math.sin(a) * 260;
    nodes[k]._vx = 0; nodes[k]._vy = 0; }
  var cam = { x: 0, y: 0, scale: 1 }, alpha = 1;
  function tick() {
    var n = nodes.length;
    for (var a = 0; a < n; a++) {
      var na = nodes[a], fx = 0, fy = 0;
      for (var b = 0; b < n; b++) { if (a === b) continue; var nb = nodes[b];
        var dx = na._x - nb._x, dy = na._y - nb._y, d2 = dx*dx + dy*dy + 0.01;
        var f = 2400 / d2; fx += dx * f; fy += dy * f; }
      na._vx = (na._vx + fx * alpha) * 0.85; na._vy = (na._vy + fy * alpha) * 0.85; }
    for (var e = 0; e < edges.length; e++) {
      var s = nodes[idx[edges[e].source]], t = nodes[idx[edges[e].target]];
      if (!s || !t) continue; var dx = t._x - s._x, dy = t._y - s._y;
      var dist = Math.sqrt(dx*dx + dy*dy) || 1, diff = (dist - 90) / dist * 0.05 * alpha;
      s._vx += dx * diff; s._vy += dy * diff; t._vx -= dx * diff; t._vy -= dy * diff; }
    for (var c = 0; c < n; c++) { var nn = nodes[c];
      nn._vx -= nn._x * 0.0025 * alpha; nn._vy -= nn._y * 0.0025 * alpha;
      nn._x += nn._vx; nn._y += nn._vy; }
    if (alpha > 0.03) alpha *= 0.992;
  }
  function w2s(x, y) { return [ (x - cam.x) * cam.scale + W/2, (y - cam.y) * cam.scale + H/2 ]; }
  function radius(node) { return 4 + Math.min(15, deg[node.id] || 0); }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(150,160,185,0.16)';
    for (var e = 0; e < edges.length; e++) {
      var s = nodes[idx[edges[e].source]], t = nodes[idx[edges[e].target]];
      if (!s || !t) continue; var ps = w2s(s._x, s._y), pt = w2s(t._x, t._y);
      ctx.beginPath(); ctx.moveTo(ps[0], ps[1]); ctx.lineTo(pt[0], pt[1]); ctx.stroke(); }
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i], p = w2s(node._x, node._y), r = Math.max(2, radius(node) * Math.sqrt(cam.scale));
      ctx.beginPath(); ctx.fillStyle = colors[node.type] || colors.unknown;
      ctx.arc(p[0], p[1], r, 0, 2 * Math.PI); ctx.fill();
      if (cam.scale > 1.25 && (deg[node.id] || 0) >= 2) {
        ctx.fillStyle = '#c3cad6'; ctx.font = '10px sans-serif';
        ctx.fillText(String(node.label || '').slice(0, 28), p[0] + r + 3, p[1] + 3); } }
  }
  function loop() { tick(); draw(); requestAnimationFrame(loop); }
  resize(); loop();
  var dragging = false, dragNode = null, lastX = 0, lastY = 0;
  function pick(mx, my) {
    var best = null, bd = 1e9;
    for (var i = 0; i < nodes.length; i++) { var p = w2s(nodes[i]._x, nodes[i]._y);
      var dx = p[0] - mx, dy = p[1] - my, d = dx*dx + dy*dy; if (d < bd) { bd = d; best = nodes[i]; } }
    return bd < 240 ? best : null;
  }
  function evpos(ev) { var r = canvas.getBoundingClientRect(); return [ ev.clientX - r.left, ev.clientY - r.top ]; }
  canvas.addEventListener('mousedown', function (ev) { var p = evpos(ev);
    dragNode = pick(p[0], p[1]); dragging = true; lastX = p[0]; lastY = p[1];
    if (dragNode) showInfo(dragNode); });
  window.addEventListener('mouseup', function () { dragging = false; dragNode = null; });
  window.addEventListener('mousemove', function (ev) { if (!dragging) return; var p = evpos(ev);
    var dx = p[0] - lastX, dy = p[1] - lastY; lastX = p[0]; lastY = p[1];
    if (dragNode) { dragNode._x += dx / cam.scale; dragNode._y += dy / cam.scale; dragNode._vx = 0; dragNode._vy = 0; }
    else { cam.x -= dx / cam.scale; cam.y -= dy / cam.scale; } });
  canvas.addEventListener('wheel', function (ev) { ev.preventDefault();
    var f = ev.deltaY < 0 ? 1.1 : 0.9; cam.scale = Math.max(0.1, Math.min(8, cam.scale * f)); },
    { passive: false });
  function row(key, val) { var d = document.createElement('div'); d.className = 'ir';
    var k = document.createElement('span'); k.className = 'ik'; k.textContent = key;
    var v = document.createElement('span'); v.className = 'iv'; v.textContent = val;
    d.appendChild(k); d.appendChild(v); return d; }
  function fmt(v) { if (v === null || v === undefined) return '';
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'object') return JSON.stringify(v); return String(v); }
  function showInfo(node) {
    var box = document.getElementById('info'); box.innerHTML = '';
    var h = document.createElement('div'); h.className = 'ih'; h.textContent = node.label || node.id; box.appendChild(h);
    var t = document.createElement('div'); t.className = 'it'; t.textContent = node.type; box.appendChild(t);
    var props = node.properties || {}, keys = Object.keys(props).sort();
    for (var i = 0; i < keys.length; i++) box.appendChild(row(keys[i], fmt(props[keys[i]])));
    if (node.source_file) box.appendChild(row('source_file', node.source_file));
    box.className = 'show';
  }
})();
`;

export function exportHtml(
  graph: AmpGraphSnapshot,
  opts: { maxRenderNodes?: number } = {},
): { html: string; render_truncated: boolean } {
  const cap = opts.maxRenderNodes && opts.maxRenderNodes > 0 ? opts.maxRenderNodes : DEFAULT_MAX_RENDER_NODES;
  const selection = selectRenderNodes(graph, cap);

  const renderGraph: AmpGraphSnapshot = {
    ...graph,
    nodes: selection.nodes,
    edges: selection.edges,
  };

  const title = `AMP Graph — ${graph.project_name ?? graph.project_tag ?? 'all projects'}`;
  const dataJson = escapeJsonForScript(exportJson(renderGraph));
  const colorsJson = escapeJsonForScript(JSON.stringify(NODE_TYPE_COLORS));

  const legendRows = Object.keys(NODE_TYPE_COLORS)
    .sort()
    .map(
      (type) =>
        `<div class="row"><span class="sw" style="background:${escapeHtml(NODE_TYPE_COLORS[type]!)}"></span>${escapeHtml(type)}</div>`,
    )
    .join('');

  const banner = selection.render_truncated
    ? `<div id="banner">Showing the ${selection.nodes.length} most-connected of ${graph.nodes.length} nodes (render cap).</div>`
    : '';

  const html =
    '<!doctype html>\n' +
    '<html lang="en">\n<head>\n' +
    '<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    `<title>${escapeHtml(title)}</title>\n` +
    `<style>${STYLE}</style>\n` +
    '</head>\n<body>\n' +
    '<canvas id="cv"></canvas>\n' +
    `<div id="title">${escapeHtml(title)}</div>\n` +
    banner +
    `<div id="legend">${legendRows}</div>\n` +
    '<div id="info"></div>\n' +
    '<div id="hint">drag to pan · scroll to zoom · click a node</div>\n' +
    `<script type="application/json" id="amp-graph-data">${dataJson}</script>\n` +
    `<script type="application/json" id="amp-graph-colors">${colorsJson}</script>\n` +
    `<script>${VIEWER_JS}</script>\n` +
    '</body>\n</html>\n';

  return { html, render_truncated: selection.render_truncated };
}
