// packages/mcp/src/tools.ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { LoadScope, MemoryContext, EpisodeInput } from '@amp/core';

// ─── Service interfaces (injected, no concrete imports) ──────────────────────

export interface IAMPService {
  load(scope: LoadScope): Promise<MemoryContext>;
  store(input: EpisodeInput): Promise<{ id: string; duplicate: boolean }>;
}

export interface IConsolidationEngine {
  run(scope?: string): Promise<Record<string, unknown>>;
  status(): Promise<Record<string, unknown>>;
  review(proposalId: string): Promise<Record<string, unknown>>;
  apply(proposalId: string, decision: 'approve' | 'reject'): Promise<{ applied: boolean }>;
}

export interface IScopedQuery {
  rawCypher(cypher: string, limit: number): Promise<Record<string, unknown>[]>;
}

// ─── Injected instances ───────────────────────────────────────────────────────

let ampService: IAMPService | null = null;
let consolidationEngine: IConsolidationEngine | null = null;
let scopedQuery: IScopedQuery | null = null;

export function setServiceInstances(services: {
  ampService: IAMPService;
  consolidationEngine: IConsolidationEngine;
  scopedQuery: IScopedQuery;
}): void {
  ampService = services.ampService;
  consolidationEngine = services.consolidationEngine;
  scopedQuery = services.scopedQuery;
}

// ─── Tool name constants ──────────────────────────────────────────────────────

export const TOOL_NAMES = ['amp_load', 'amp_store', 'amp_query', 'amp_consolidate'] as const;

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const AmpLoadSchema = {
  task: z.string().describe('Task description for context assembly'),
  entities: z.array(z.string()).optional().describe('Entity names to scope the query'),
  tags: z.array(z.string()).optional().describe('Tags to scope the query'),
  max_tokens: z.number().int().positive().optional().default(4000).describe('Max tokens for context window'),
};

const AmpStoreSchema = {
  session_id: z.string().describe('Session identifier'),
  task: z.string().describe('Task description for this episode'),
  content: z.string().describe('Episodic content to store'),
  outcome: z
    .enum(['approved', 'revised', 'rejected', 'abandoned'])
    .optional()
    .describe('Outcome of the episode'),
  signals: z
    .array(
      z.object({
        type: z.enum(['reinforcement', 'correction', 'contradiction']),
        target_id: z.string(),
        detail: z.string(),
      }),
    )
    .optional()
    .describe('Signals associated with this episode'),
};

const AmpQuerySchema = {
  query: z.string().describe('Cypher query to run against Neo4j'),
  limit: z.number().int().positive().optional().default(10).describe('Maximum number of results'),
};

const AmpConsolidateSchema = {
  action: z.enum(['run', 'status', 'review']).describe('Consolidation action to perform'),
  scope: z.string().optional().describe('Entity or tag scope for "run" action'),
  proposal_id: z.string().optional().describe('Proposal ID for "review" action'),
  decision: z
    .enum(['approve', 'reject'])
    .optional()
    .describe('Decision for "review" action (approve or reject)'),
};

// ─── Handler implementations ─────────────────────────────────────────────────

export type ToolHandlers = {
  amp_load: (args: {
    task: string;
    entities?: string[];
    tags?: string[];
    max_tokens?: number;
  }) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
  amp_store: (args: {
    session_id: string;
    task: string;
    content: string;
    outcome?: 'approved' | 'revised' | 'rejected' | 'abandoned';
    signals?: Array<{ type: 'reinforcement' | 'correction' | 'contradiction'; target_id: string; detail: string }>;
  }) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
  amp_query: (args: { query: string; limit?: number }) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
  amp_consolidate: (args: {
    action: 'run' | 'status' | 'review';
    scope?: string;
    proposal_id?: string;
    decision?: 'approve' | 'reject';
  }) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
};

function textContent(text: string): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text' as const, text }] };
}

export function buildToolHandlers(): ToolHandlers {
  return {
    async amp_load(args) {
      if (!ampService) throw new Error('AMPService not initialised');
      const scope: LoadScope = {
        task: args.task,
        entities: args.entities,
        tags: args.tags,
        max_tokens: args.max_tokens ?? 4000,
      };
      const ctx = await ampService.load(scope);
      return textContent(ctx.markdown);
    },

    async amp_store(args) {
      if (!ampService) throw new Error('AMPService not initialised');
      const input: EpisodeInput = {
        session_id: args.session_id,
        agent_id: 'mcp',
        task: args.task,
        content: args.content,
        outcome: args.outcome,
        signals: args.signals,
      };
      const result = await ampService.store(input);
      if (result.duplicate) {
        return textContent('duplicate:true');
      }
      return textContent(`id:${result.id}`);
    },

    async amp_query(args) {
      if (!scopedQuery) throw new Error('ScopedQuery not initialised');
      const limit = args.limit ?? 10;
      const rows = await scopedQuery.rawCypher(args.query, limit);
      return textContent(JSON.stringify(rows, null, 2));
    },

    async amp_consolidate(args) {
      if (!consolidationEngine) throw new Error('ConsolidationEngine not initialised');
      switch (args.action) {
        case 'run': {
          const result = await consolidationEngine.run(args.scope);
          return textContent(JSON.stringify(result, null, 2));
        }
        case 'status': {
          const status = await consolidationEngine.status();
          return textContent(JSON.stringify(status, null, 2));
        }
        case 'review': {
          if (!args.proposal_id) {
            throw new Error('"proposal_id" is required for the "review" action');
          }
          if (args.decision) {
            // Apply the decision
            const applied = await consolidationEngine.apply(args.proposal_id, args.decision);
            return textContent(JSON.stringify(applied, null, 2));
          }
          // Just review / fetch the proposal
          const proposal = await consolidationEngine.review(args.proposal_id);
          return textContent(JSON.stringify(proposal, null, 2));
        }
        default: {
          const exhaustiveCheck: never = args.action;
          throw new Error(`Unknown consolidation action: ${String(exhaustiveCheck)}`);
        }
      }
    },
  };
}

// ─── Tool registration ────────────────────────────────────────────────────────

export function registerTools(server: McpServer): void {
  const handlers = buildToolHandlers();

  server.tool(
    'amp_load',
    'Load memory context for a task. Returns assembled markdown ready for the context window.',
    AmpLoadSchema,
    handlers.amp_load,
  );

  server.tool(
    'amp_store',
    'Store an episodic memory. Returns the new episode ID.',
    AmpStoreSchema,
    handlers.amp_store,
  );

  server.tool(
    'amp_query',
    'Run a raw Cypher query against the Neo4j knowledge graph. Returns JSON rows.',
    AmpQuerySchema,
    handlers.amp_query,
  );

  server.tool(
    'amp_consolidate',
    'Manage memory consolidation: run a consolidation pass, check status, or review a proposal.',
    AmpConsolidateSchema,
    handlers.amp_consolidate,
  );
}
