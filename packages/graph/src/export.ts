/**
 * GraphExportService — render a snapshot to a portable artifact (JSON or a
 * self-contained interactive HTML viewer), optionally writing it to a file under
 * an allowed output directory.
 *
 * Side effects: when `output_path` is given, writes one file under `baseDir`
 * (default `<cwd>/amp-graph-out`, which is gitignored). Path is resolved
 * defensively — no absolute paths, no `..`, must stay within `baseDir`.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { exportJson } from './export-json.js';
import { exportHtml } from './export-html.js';
import type { GraphSnapshotService } from './snapshot.js';
import type { GraphExportInput, GraphExportResult } from './types.js';

/** Resolve a user-supplied relative path safely inside `baseDir`. */
export function resolveSafeOutputPath(outputPath: string, baseDir: string): string {
  if (typeof outputPath !== 'string' || outputPath.trim().length === 0) {
    throw new Error('output_path must be a non-empty string');
  }
  if (path.isAbsolute(outputPath)) {
    throw new Error('output_path must be relative (it is written under the allowed output directory)');
  }
  if (outputPath.split(/[\\/]/).includes('..')) {
    throw new Error('output_path must not contain ".."');
  }
  const base = path.resolve(baseDir);
  const resolved = path.resolve(base, outputPath);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error('output_path escapes the allowed output directory');
  }
  return resolved;
}

export class GraphExportService {
  constructor(
    private snapshotService: GraphSnapshotService,
    private baseDir?: string,
  ) {}

  async export(input: GraphExportInput = {}): Promise<GraphExportResult> {
    const format = input.format ?? 'json';
    if (format !== 'json' && format !== 'html') {
      throw new Error(`Unsupported export format: ${String(format)} (expected 'json' or 'html')`);
    }

    const graph = await this.snapshotService.snapshot({
      project_tag: input.project_tag,
      project_name: input.project_name,
      include_symbols: input.include_symbols,
      include_semantics: input.include_semantics,
      include_facts: input.include_facts,
      include_episodes: input.include_episodes,
      include_sources: input.include_sources,
    });

    let content: string;
    let renderTruncated = false;
    if (format === 'json') {
      content = exportJson(graph);
    } else {
      const rendered = exportHtml(graph, { maxRenderNodes: input.max_render_nodes });
      content = rendered.html;
      renderTruncated = rendered.render_truncated;
    }

    const result: GraphExportResult = {
      format,
      bytes: Buffer.byteLength(content, 'utf8'),
      node_count: graph.nodes.length,
      edge_count: graph.edges.length,
      truncated: graph.truncated,
      render_truncated: renderTruncated,
    };

    if (input.output_path) {
      const baseDir = this.baseDir ?? path.resolve(process.cwd(), 'amp-graph-out');
      const target = resolveSafeOutputPath(input.output_path, baseDir);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content, 'utf8');
      result.output_path = target;
    } else {
      result.content = content;
    }

    return result;
  }
}
