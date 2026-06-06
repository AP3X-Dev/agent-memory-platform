/**
 * @amp/graph MCP tool registration.
 *
 * Follows the established satellite-package pattern (see @amp/wiki tools.ts):
 *  - services injected via a module-level `setGraphServiceInstances()` singleton
 *    called from bootstrap.ts (NOT passed as registration args);
 *  - `registerGraphTools(server)` takes ONLY the server and reads the singletons;
 *  - every tool registers with a NON-EMPTY `ToolAnnotations` — passing `{}` makes
 *    the MCP SDK misparse the handler slot ("typedHandler is not a function").
 *
 * This PR ships exactly one tool, `amp_graph_report`, under a `graph` domain that
 * is disabled by default.
 */
import { z } from 'zod';
import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type {
  AmpGraphSnapshot,
  GraphExportInput,
  GraphExportResult,
  GraphReportInput,
  GraphReportResult,
  SnapshotInput,
} from './types.js';

export const GRAPH_TOOL_NAMES = ['amp_graph_report', 'amp_graph_export'] as const;

// ─── Injected service interfaces (no concrete imports) ───────────────────────

export interface IGraphSnapshotService {
  snapshot(input: SnapshotInput): Promise<AmpGraphSnapshot>;
}

export interface IGraphReportService {
  generate(input: GraphReportInput): Promise<GraphReportResult>;
}

export interface IGraphExportService {
  export(input: GraphExportInput): Promise<GraphExportResult>;
}

let snapshotService: IGraphSnapshotService | null = null;
let reportService: IGraphReportService | null = null;
let exportService: IGraphExportService | null = null;

export function setGraphServiceInstances(services: {
  snapshotService?: IGraphSnapshotService;
  reportService: IGraphReportService;
  exportService: IGraphExportService;
}): void {
  snapshotService = services.snapshotService ?? null;
  reportService = services.reportService;
  exportService = services.exportService;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function textContent(text: string): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text' as const, text }] };
}

// ─── Tool schema ─────────────────────────────────────────────────────────────

const AmpGraphReportSchema = {
  project_tag: z
    .string()
    .max(200)
    .optional()
    .describe('Project scope tag, e.g. "project:amp". Omit for all projects.'),
  project_name: z
    .string()
    .max(200)
    .optional()
    .describe('Project root entity name for exact-match scoping (e.g. "amp").'),
  max_items: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .describe('Per-section item cap (default 10).'),
  include_symbols: z.boolean().optional().describe('Include code symbols (default true).'),
  include_semantics: z.boolean().optional().describe('Include semantic memories (default true).'),
  include_facts: z.boolean().optional().describe('Include temporal facts (default true).'),
  include_sources: z.boolean().optional().describe('Include ingested sources (default true).'),
  include_episodes: z
    .boolean()
    .optional()
    .describe('Include episodic memories (default false; most numerous).'),
};

const AmpGraphExportSchema = {
  project_tag: z.string().max(200).optional().describe('Project scope tag, e.g. "project:amp".'),
  project_name: z.string().max(200).optional().describe('Project root entity name for exact-match scoping.'),
  format: z
    .enum(['json', 'html'])
    .optional()
    .describe('"json" (default) or "html" (self-contained interactive graph viewer).'),
  output_path: z
    .string()
    .max(300)
    .optional()
    .describe('Relative path under the amp-graph-out/ directory to write the artifact to. Omit to return inline.'),
  include_symbols: z.boolean().optional().describe('Include code symbols (default true).'),
  include_semantics: z.boolean().optional().describe('Include semantic memories (default true).'),
  include_facts: z.boolean().optional().describe('Include temporal facts (default true).'),
  include_sources: z.boolean().optional().describe('Include ingested sources (default true).'),
  include_episodes: z.boolean().optional().describe('Include episodic memories (default false).'),
  max_render_nodes: z
    .number()
    .int()
    .positive()
    .max(20000)
    .optional()
    .describe('HTML render cap; larger graphs draw only the top-degree nodes (default 1500).'),
};

// ─── Registration ────────────────────────────────────────────────────────────

export function registerGraphTools(server: McpServer): RegisteredTool[] {
  const handles: RegisteredTool[] = [];

  handles.push(
    server.tool(
      'amp_graph_report',
      'Generate a deterministic markdown audit of the AMP knowledge graph: corpus summary, node/relation counts, memory-confidence summary, high-centrality "Core Abstractions" (weighted degree), import/dependency cycles, low-confidence knowledge, and knowledge gaps. Read-only; project-scoped via project_tag/project_name.',
      AmpGraphReportSchema,
      // Non-empty annotations are MANDATORY — `{}` re-triggers the SDK
      // "typedHandler is not a function" overload bug.
      { readOnlyHint: true, idempotentHint: true } satisfies ToolAnnotations,
      async (args) => {
        if (!reportService) throw new Error('GraphReportService not initialised');
        const result = await reportService.generate({
          project_tag: args.project_tag,
          project_name: args.project_name,
          max_items: args.max_items,
          include_symbols: args.include_symbols,
          include_semantics: args.include_semantics,
          include_facts: args.include_facts,
          include_sources: args.include_sources,
          include_episodes: args.include_episodes,
        });
        return textContent(result.markdown);
      },
    ),
  );

  handles.push(
    server.tool(
      'amp_graph_export',
      'Export the AMP knowledge graph as a portable artifact: "json" (the secret-safe graph snapshot) or "html" (a self-contained, offline, interactive force-directed viewer you open in a browser — pan/zoom/drag, click a node to inspect its properties). Works for any memory graph (code, people, orgs, topics). Project-scoped; writes to amp-graph-out/ when output_path is given, otherwise returns the artifact inline.',
      AmpGraphExportSchema,
      // Writes a file when output_path is set, so this is not purely read-only.
      // Non-empty annotations are MANDATORY (empty {} re-triggers the SDK bug).
      { readOnlyHint: false, idempotentHint: true } satisfies ToolAnnotations,
      async (args) => {
        if (!exportService) throw new Error('GraphExportService not initialised');
        const result = await exportService.export({
          project_tag: args.project_tag,
          project_name: args.project_name,
          format: args.format,
          output_path: args.output_path,
          include_symbols: args.include_symbols,
          include_semantics: args.include_semantics,
          include_facts: args.include_facts,
          include_sources: args.include_sources,
          include_episodes: args.include_episodes,
          max_render_nodes: args.max_render_nodes,
        });
        if (result.output_path) {
          const truncNote = result.render_truncated
            ? ' (HTML render capped to the top-degree subset)'
            : '';
          return textContent(
            `Wrote ${result.format.toUpperCase()} export to ${result.output_path} — ${result.bytes} bytes, ${result.node_count} nodes, ${result.edge_count} edges${truncNote}.`,
          );
        }
        return textContent(result.content ?? '');
      },
    ),
  );

  return handles;
}

/** Exposed for tests/diagnostics: whether services have been injected. */
export function graphServicesReady(): boolean {
  return reportService != null && snapshotService != null && exportService != null;
}
