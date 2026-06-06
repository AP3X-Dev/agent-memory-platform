import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Driver } from 'neo4j-driver';
import { exportJson, buildJsonDocument } from '../export-json.js';
import {
  exportHtml,
  escapeHtml,
  escapeJsonForScript,
  selectRenderNodes,
} from '../export-html.js';
import { GraphExportService, resolveSafeOutputPath } from '../export.js';
import { GraphSnapshotService } from '../snapshot.js';
import type { AmpGraphEdge, AmpGraphNode, AmpGraphSnapshot } from '../types.js';

function n(id: string, type: AmpGraphNode['type'], label: string, properties: Record<string, unknown> = {}): AmpGraphNode {
  return { id, type, label, properties };
}
function e(source: string, target: string, relation: string): AmpGraphEdge {
  return { id: `${source}|${relation}|${target}`, source, target, relation, weight: 1, properties: {} };
}

const SNAP: AmpGraphSnapshot = {
  project_tag: 'project:amp',
  project_name: 'amp',
  generated_at: '2026-06-06T00:00:00.000Z',
  truncated: false,
  total_available: 3,
  nodes: [
    n('a', 'entity', 'Alice', { name: 'Alice', type: 'person' }),
    n('b', 'entity', 'Bob', { name: 'Bob', type: 'person' }),
    n('c', 'semantic', 'a note', { confidence: 0.8, tags: ['project:amp'] }),
  ],
  edges: [e('a', 'b', 'USES'), e('c', 'a', 'ABOUT')],
};

// ─── JSON export ─────────────────────────────────────────────────────────────

describe('exportJson', () => {
  it('emits a valid, deterministic amp-graph document', () => {
    const out1 = exportJson(SNAP);
    const out2 = exportJson(SNAP);
    expect(out1).toBe(out2);
    const parsed = JSON.parse(out1);
    expect(parsed.format).toBe('amp-graph');
    expect(parsed.version).toBe(1);
    expect(parsed.nodes).toHaveLength(3);
    expect(parsed.edges).toHaveLength(2);
    expect(parsed.project_tag).toBe('project:amp');
  });

  it('omits project fields when absent', () => {
    const doc = buildJsonDocument({ ...SNAP, project_tag: undefined, project_name: undefined });
    expect(doc).not.toHaveProperty('project_tag');
    expect(doc).not.toHaveProperty('project_name');
  });
});

// ─── HTML export: XSS safety ─────────────────────────────────────────────────

describe('exportHtml XSS safety', () => {
  it('escapes markup so embedded payloads cannot execute', () => {
    const payloadSnap: AmpGraphSnapshot = {
      generated_at: '2026-06-06T00:00:00.000Z',
      truncated: false,
      total_available: 1,
      nodes: [
        n('x', 'entity', '<script>__XSS_PAYLOAD__</script>', {
          name: '<img src=x onerror=__XSS_IMG__>',
          type: 'person',
        }),
      ],
      edges: [],
    };
    const { html } = exportHtml(payloadSnap);
    // Raw, executable forms of the payload must NOT be present.
    expect(html).not.toContain('<script>__XSS_PAYLOAD__</script>');
    expect(html).not.toContain('<script>__XSS');
    expect(html).not.toContain('<img');
    // The data is still present, but only in escaped (inert) JSON form.
    expect(html).toContain('\\u003cscript\\u003e__XSS_PAYLOAD__');
    expect(html).toContain('__XSS_PAYLOAD__'); // inert text inside the JSON block
  });

  it('escapes the project name in the server-rendered title', () => {
    const { html } = exportHtml({ ...SNAP, project_name: 'a<b>c' });
    expect(html).toContain('a&lt;b&gt;c');
    expect(html).not.toContain('<title>AMP Graph — a<b>c');
  });

  it('produces a self-contained document with embedded data', () => {
    const { html } = exportHtml(SNAP);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('id="amp-graph-data"');
    expect(html).toContain('id="cv"'); // canvas
    expect(html).not.toContain('http://');
    expect(html).not.toContain('https://'); // no external resources
  });
});

describe('escape helpers', () => {
  it('escapeHtml handles the dangerous five', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&`)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;');
  });
  it('escapeJsonForScript neutralizes script terminators', () => {
    expect(escapeJsonForScript('</script>')).toBe('\\u003c/script\\u003e');
  });
});

// ─── HTML render cap ─────────────────────────────────────────────────────────

describe('selectRenderNodes (render cap)', () => {
  it('keeps the top-degree nodes when over the cap and flags truncation', () => {
    const nodes = Array.from({ length: 10 }, (_, i) => n(`n${i}`, 'entity', `N${i}`));
    // n0 is highly connected; others are leaves.
    const edges = Array.from({ length: 5 }, (_, i) => e('n0', `n${i + 1}`, 'USES'));
    const big: AmpGraphSnapshot = {
      generated_at: 't',
      truncated: false,
      total_available: 10,
      nodes,
      edges,
    };
    const sel = selectRenderNodes(big, 3);
    expect(sel.render_truncated).toBe(true);
    expect(sel.nodes).toHaveLength(3);
    expect(sel.nodes.map((x) => x.id)).toContain('n0'); // highest degree kept
    // edges only among kept nodes
    for (const ed of sel.edges) {
      expect(sel.nodes.find((x) => x.id === ed.source)).toBeDefined();
      expect(sel.nodes.find((x) => x.id === ed.target)).toBeDefined();
    }
  });

  it('keeps everything (no truncation) under the cap', () => {
    const sel = selectRenderNodes(SNAP, 100);
    expect(sel.render_truncated).toBe(false);
    expect(sel.nodes).toHaveLength(3);
  });
});

// ─── Path safety ─────────────────────────────────────────────────────────────

describe('resolveSafeOutputPath', () => {
  const base = '/tmp/amp-graph-out';
  it('resolves a relative path inside the base', () => {
    expect(resolveSafeOutputPath('graph.html', base)).toBe('/tmp/amp-graph-out/graph.html');
    expect(resolveSafeOutputPath('sub/graph.json', base)).toBe('/tmp/amp-graph-out/sub/graph.json');
  });
  it('rejects absolute paths and traversal', () => {
    expect(() => resolveSafeOutputPath('/etc/passwd', base)).toThrow();
    expect(() => resolveSafeOutputPath('../escape.html', base)).toThrow();
    expect(() => resolveSafeOutputPath('a/../../b.html', base)).toThrow();
    expect(() => resolveSafeOutputPath('', base)).toThrow();
  });
});

// ─── Service: end-to-end with a mock snapshot service ────────────────────────

function mockDriver(symbolSecret?: string): Driver {
  const rec = (m: Record<string, unknown>) => ({ get: (k: string) => m[k] });
  const session = {
    run: async (query: string) => {
      if (symbolSecret && query.includes('(s:Symbol)')) {
        return {
          records: [
            rec({
              s: {
                labels: ['Symbol'],
                properties: {
                  id: 's1',
                  name: 'getKey',
                  kind: 'function',
                  file_path: '/repo/amp/a.ts',
                  signature: `const K = "${symbolSecret}"`,
                },
              },
              c: { labels: ['Entity', 'Component'], properties: { id: 'c1', name: 'a.ts', path: '/repo/amp/a.ts' } },
            }),
          ],
        };
      }
      if (query.includes('(e:Entity)') && !query.includes('-[r]->')) {
        return { records: [rec({ e: { labels: ['Entity'], properties: { id: 'e1', name: 'amp', type: 'project' } } })] };
      }
      return { records: [] };
    },
    close: async () => {},
  };
  return { session: () => session } as unknown as Driver;
}

describe('GraphExportService', () => {
  it('returns inline JSON content when no output_path is given', async () => {
    const svc = new GraphExportService(new GraphSnapshotService(mockDriver()));
    const res = await svc.export({ project_name: 'amp', format: 'json' });
    expect(res.format).toBe('json');
    expect(res.output_path).toBeUndefined();
    expect(res.content).toBeDefined();
    expect(res.node_count).toBe(1);
    expect(JSON.parse(res.content!).format).toBe('amp-graph');
  });

  it('writes a file under the allowed base dir and reports the path', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'amp-graph-export-'));
    const svc = new GraphExportService(new GraphSnapshotService(mockDriver()), dir);
    const res = await svc.export({ project_name: 'amp', format: 'html', output_path: 'g.html' });
    expect(res.output_path).toBe(path.join(dir, 'g.html'));
    expect(res.content).toBeUndefined();
    const written = await readFile(res.output_path!, 'utf8');
    expect(written.startsWith('<!doctype html>')).toBe(true);
  });

  it('refuses to write outside the allowed base dir', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'amp-graph-export-'));
    const svc = new GraphExportService(new GraphSnapshotService(mockDriver()), dir);
    await expect(svc.export({ project_name: 'amp', output_path: '../escape.json' })).rejects.toThrow();
  });

  it('a planted secret in a Symbol signature never reaches the exported artifact', async () => {
    const SECRET = 'sk-live-EXPORTSECRET1234567890ABCD';
    const svc = new GraphExportService(new GraphSnapshotService(mockDriver(SECRET)));
    const json = await svc.export({ project_name: 'amp', format: 'json' });
    const html = await svc.export({ project_name: 'amp', format: 'html' });
    expect(json.content).not.toContain(SECRET);
    expect(html.content).not.toContain(SECRET);
  });
});
