/**
 * @memberry/graph MCP tool registration.
 *
 * Follows the established service-container DI pattern (see @memberry/mcp tools.ts):
 *  - services live in a typed `GraphServiceContainer`; a process-default container
 *    backs the legacy `setGraphServiceInstances()` injection point called from
 *    bootstrap.ts;
 *  - `registerGraphTools(server, container?)` defaults to the process container but
 *    accepts an explicit one for per-session / multi-tenant isolation;
 *  - every tool registers with a NON-EMPTY `ToolAnnotations` — passing `{}` makes
 *    the MCP SDK misparse the handler slot ("typedHandler is not a function").
 *
 * This PR ships exactly one tool, `berry_graph_report`, under a `graph` domain that
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
  PrConflictsInput,
  PrConflictsResult,
  PrImpactInput,
  PrImpactResult,
  SnapshotInput,
} from './types.js';

export const GRAPH_TOOL_NAMES = [
  'berry_graph_report',
  'berry_graph_export',
  'berry_pr_impact',
  'berry_pr_conflicts',
] as const;

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

export interface IPrImpactService {
  impact(input: PrImpactInput): Promise<PrImpactResult>;
  conflicts(input: PrConflictsInput): Promise<PrConflictsResult>;
}

// ─── Service container ────────────────────────────────────────────────────────
//
// The tool layer depends on a single typed container of services rather than a
// scatter of module-level singletons. A process-default container backs the
// legacy setGraphServiceInstances() injection point, while registerGraphTools()
// also accepts an explicit container — the seam that makes per-session /
// multi-tenant service isolation possible without process globals.

export interface GraphServiceContainer {
  snapshotService: IGraphSnapshotService | null;
  reportService: IGraphReportService | null;
  exportService: IGraphExportService | null;
  prImpactService: IPrImpactService | null;
}

/** Build a container, defaulting any service not supplied to null. */
export function createGraphContainer(partial: Partial<GraphServiceContainer> = {}): GraphServiceContainer {
  return {
    snapshotService: partial.snapshotService ?? null,
    reportService: partial.reportService ?? null,
    exportService: partial.exportService ?? null,
    prImpactService: partial.prImpactService ?? null,
  };
}

/** Process-default container, populated by setGraphServiceInstances() at bootstrap. */
const defaultContainer: GraphServiceContainer = createGraphContainer();

export function setGraphServiceInstances(services: {
  snapshotService?: IGraphSnapshotService;
  reportService: IGraphReportService;
  exportService: IGraphExportService;
  prImpactService?: IPrImpactService;
}): void {
  // Assign into the process-default container, preserving the prior param→field
  // mapping and optionality (snapshot/prImpact default to null when omitted).
  defaultContainer.snapshotService = services.snapshotService ?? null;
  defaultContainer.reportService = services.reportService;
  defaultContainer.exportService = services.exportService;
  defaultContainer.prImpactService = services.prImpactService ?? null;
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

const AmpPrImpactSchema = {
  pr: z.string().max(300).describe('PR reference: number, branch, or URL (passed to `gh pr view`).'),
  project_tag: z.string().max(200).optional().describe('Project scope tag for the graph snapshot.'),
  project_name: z.string().max(200).optional().describe('Project root entity name for exact-match scoping.'),
  max_items: z.number().int().positive().max(100).optional().describe('Per-section item cap (default 10).'),
};

const AmpPrConflictsSchema = {
  prs: z
    .array(z.string().max(300))
    .max(50)
    .optional()
    .describe('Specific PR refs to compare. Omit to analyze all open PRs.'),
  project_tag: z.string().max(200).optional().describe('Project scope tag for the graph snapshot.'),
  project_name: z.string().max(200).optional().describe('Project root entity name for exact-match scoping.'),
};

// ─── Registration ────────────────────────────────────────────────────────────

export function registerGraphTools(
  server: McpServer,
  container: GraphServiceContainer = defaultContainer,
): RegisteredTool[] {
  // Destructure once into closure-captured locals. Handlers reference these by
  // the same names they used as module globals, so their bodies are unchanged —
  // but each call can now be bound to a different container.
  const { snapshotService, reportService, exportService, prImpactService } = container;
  const handles: RegisteredTool[] = [];

  handles.push(
    server.tool(
      'berry_graph_report',
      'Generate a deterministic markdown audit of the MemBerry knowledge graph: corpus summary, node/relation counts, memory-confidence summary, high-centrality "Core Abstractions" (weighted degree), import/dependency cycles, low-confidence knowledge, and knowledge gaps. Read-only; project-scoped via project_tag/project_name.',
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
      'berry_graph_export',
      'Export the MemBerry knowledge graph as a portable artifact: "json" (the secret-safe graph snapshot) or "html" (a self-contained, offline, interactive force-directed viewer you open in a browser — pan/zoom/drag, click a node to inspect its properties). Works for any memory graph (code, people, orgs, topics). Project-scoped; writes to amp-graph-out/ when output_path is given, otherwise returns the artifact inline.',
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

  handles.push(
    server.tool(
      'berry_pr_impact',
      'Analyze the blast radius of a GitHub pull request over the code graph: changed files → their symbols → files that import/call them (dependents), plus the knowledge areas and high-centrality nodes touched. Requires the `gh` CLI to be installed and authenticated. Read-only.',
      AmpPrImpactSchema,
      { readOnlyHint: true } satisfies ToolAnnotations,
      async (args) => {
        if (!prImpactService) throw new Error('PrImpactService not initialised');
        const result = await prImpactService.impact({
          pr: args.pr,
          project_tag: args.project_tag,
          project_name: args.project_name,
          max_items: args.max_items,
        });
        return textContent(result.markdown);
      },
    ),
  );

  handles.push(
    server.tool(
      'berry_pr_conflicts',
      'Find pull requests whose impact overlaps — pairs of PRs that touch (or whose dependents touch) the same files, signalling likely merge/review conflicts. Compares the given PR refs, or all open PRs if none are given. Requires the `gh` CLI. Read-only.',
      AmpPrConflictsSchema,
      { readOnlyHint: true } satisfies ToolAnnotations,
      async (args) => {
        if (!prImpactService) throw new Error('PrImpactService not initialised');
        const result = await prImpactService.conflicts({
          prs: args.prs,
          project_tag: args.project_tag,
          project_name: args.project_name,
        });
        return textContent(result.markdown);
      },
    ),
  );

  return handles;
}

/** Exposed for tests/diagnostics: whether services have been injected. */
export function graphServicesReady(): boolean {
  return (
    defaultContainer.reportService != null &&
    defaultContainer.snapshotService != null &&
    defaultContainer.exportService != null
  );
}
