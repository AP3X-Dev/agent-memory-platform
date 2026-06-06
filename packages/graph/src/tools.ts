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
  GraphReportInput,
  GraphReportResult,
  SnapshotInput,
} from './types.js';

export const GRAPH_TOOL_NAMES = ['amp_graph_report'] as const;

// ─── Injected service interfaces (no concrete imports) ───────────────────────

export interface IGraphSnapshotService {
  snapshot(input: SnapshotInput): Promise<AmpGraphSnapshot>;
}

export interface IGraphReportService {
  generate(input: GraphReportInput): Promise<GraphReportResult>;
}

let snapshotService: IGraphSnapshotService | null = null;
let reportService: IGraphReportService | null = null;

export function setGraphServiceInstances(services: {
  snapshotService?: IGraphSnapshotService;
  reportService: IGraphReportService;
}): void {
  snapshotService = services.snapshotService ?? null;
  reportService = services.reportService;
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

  return handles;
}

/** Exposed for tests/diagnostics: whether services have been injected. */
export function graphServicesReady(): boolean {
  return reportService != null && snapshotService != null;
}
