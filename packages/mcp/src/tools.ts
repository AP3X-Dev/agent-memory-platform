// packages/mcp/src/tools.ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { LoadScope, MemoryContext, EpisodeInput } from '@amp/core';
import { parseAmpUri, uriToLoadScope } from './uri.js';

// ─── Service interfaces (injected, no concrete imports) ──────────────────────

export interface IAMPService {
  load(scope: LoadScope): Promise<MemoryContext>;
  store(input: EpisodeInput): Promise<{ id: string; duplicate: boolean }>;
}

export interface IConsolidationEngine {
  run(scope?: string): Promise<unknown>;
  status(): Promise<unknown>;
  review(proposalId: string): Promise<unknown>;
  apply(proposalId: string, decision: 'approve' | 'reject'): Promise<{ applied: boolean }>;
}

export interface IScopedQuery {
  rawCypher(cypher: string, limit: number): Promise<Record<string, unknown>[]>;
}

export interface IBootstrapGraphService {
  bootstrap(input: {
    project_name: string;
    project_tag: string;
    description: string;
    domain: string;
    entities: Array<{ name: string; type: string; description?: string; parent?: string }>;
    semantic_seeds: Array<{ claim: string; domain: string; confidence?: number; about?: string[]; tags?: string[] }>;
    agents: Array<{ id: string; name: string; type: string }>;
  }): Promise<{
    entities_created: number;
    entities_existing: number;
    agents_created: number;
    agents_existing: number;
    semantics_created: number;
    relationships_created: number;
    project_entity_id: string;
  }>;
  isBootstrapped(projectName: string): Promise<boolean>;
  status(projectName: string): Promise<Record<string, unknown>>;
}

// ─── Injected instances ───────────────────────────────────────────────────────

let ampService: IAMPService | null = null;
let consolidationEngine: IConsolidationEngine | null = null;
let scopedQuery: IScopedQuery | null = null;
let bootstrapService: IBootstrapGraphService | null = null;

export function setServiceInstances(services: {
  ampService: IAMPService;
  consolidationEngine: IConsolidationEngine;
  scopedQuery: IScopedQuery;
  bootstrapService: IBootstrapGraphService;
}): void {
  ampService = services.ampService;
  consolidationEngine = services.consolidationEngine;
  scopedQuery = services.scopedQuery;
  bootstrapService = services.bootstrapService;
}

// ─── Tool name constants ──────────────────────────────────────────────────────

export const TOOL_NAMES = ['amp_load', 'amp_store', 'amp_query', 'amp_consolidate', 'amp_resolve', 'amp_bootstrap'] as const;

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const AmpLoadSchema = {
  task: z.string().max(5000).describe('Task description for context assembly'),
  entities: z.array(z.string()).optional().describe('Entity names to scope the query'),
  tags: z.array(z.string()).optional().describe('Tags to scope the query'),
  max_tokens: z.number().int().positive().optional().default(4000).describe('Max tokens for context window'),
};

const AmpStoreSchema = {
  session_id: z.string().max(500).describe('Session identifier'),
  task: z.string().max(5000).describe('Task description for this episode'),
  content: z.string().max(10000).describe('Episodic content to store'),
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
  query: z.string().max(5000).describe('Cypher query to run against Neo4j'),
  limit: z.number().int().positive().optional().default(10).describe('Maximum number of results'),
};

const AmpConsolidateSchema = {
  action: z.enum(['run', 'status', 'review']).describe('Consolidation action to perform'),
  scope: z.string().max(2000).optional().describe('Entity or tag scope for "run" action'),
  proposal_id: z.string().max(2000).optional().describe('Proposal ID for "review" action'),
  decision: z
    .enum(['approve', 'reject'])
    .optional()
    .describe('Decision for "review" action (approve or reject)'),
};

const AmpResolveSchema = {
  uri: z.string().max(500).describe('AMP URI to resolve (amp://entity/Name or amp://tag/name)'),
  max_tokens: z.number().int().positive().optional().default(2000).describe('Max tokens for resolved content'),
  stage_context: z.string().max(2000).optional().describe('Current stage description for relevance ranking'),
};

const AmpBootstrapSchema = {
  project_name: z.string().max(500).describe('Project name (e.g. "oni-core", "my-api")'),
  project_tag: z.string().max(500).describe('Project scope tag (e.g. "project:oni-core")'),
  description: z.string().max(10000).describe('One-line project description'),
  domain: z.string().max(2000).describe('Project domain (e.g. "agent-orchestration", "e-commerce", "ml-training")'),
  entities: z.array(z.object({
    name: z.string().max(500).describe('Entity name'),
    type: z.string().max(2000).describe('Entity type: project, module, service, component, team, person, tool'),
    description: z.string().max(2000).optional().describe('What this entity is'),
    parent: z.string().max(2000).optional().describe('Parent entity name — creates a CONTAINS relationship'),
  })).describe('Entities to create (modules, services, components, teams, etc.)'),
  semantic_seeds: z.array(z.object({
    claim: z.string().max(2000).describe('The principle or observation, stated concisely'),
    domain: z.string().max(500).describe('Domain tag (architecture, performance, testing, security, etc.)'),
    confidence: z.number().min(0).max(1).optional().default(0.3).describe('Initial confidence (default 0.3 = prior/observation)'),
    about: z.array(z.string()).optional().describe('Entity names this principle is ABOUT'),
    tags: z.array(z.string()).optional().describe('Additional tags'),
  })).optional().default([]).describe('Seed semantic principles — low-confidence priors from repo analysis'),
  agents: z.array(z.object({
    id: z.string().max(500).describe('Agent identifier (e.g. "mcp", "researcher-1")'),
    name: z.string().max(500).describe('Human-readable name'),
    type: z.string().max(5000).describe('Agent type: assistant, sentinel, fixer, researcher'),
  })).optional().default([{ id: 'mcp', name: 'Claude Code', type: 'assistant' }])
    .describe('Agents that will interact with this project'),
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
  amp_resolve: (args: {
    uri: string;
    max_tokens?: number;
    stage_context?: string;
  }) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
  amp_bootstrap: (args: {
    project_name: string;
    project_tag: string;
    description: string;
    domain: string;
    entities: Array<{ name: string; type: string; description?: string; parent?: string }>;
    semantic_seeds?: Array<{ claim: string; domain: string; confidence?: number; about?: string[]; tags?: string[] }>;
    agents?: Array<{ id: string; name: string; type: string }>;
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

      // Block write operations — amp_query is read-only
      const upper = args.query.toUpperCase().trim();
      const writeOps = ['CREATE', 'MERGE', 'DELETE', 'DETACH', 'SET ', 'REMOVE', 'DROP', 'CALL {'];
      if (writeOps.some((op) => upper.startsWith(op) || upper.includes(` ${op}`))) {
        throw new Error('amp_query is read-only. Use amp_store, amp_bootstrap, or domain-specific tools for writes.');
      }

      const limit = args.limit ?? 10;
      const rows = await scopedQuery.rawCypher(args.query, limit);
      return textContent(JSON.stringify(rows, null, 2));
    },

    async amp_consolidate(args) {
      if (!consolidationEngine) throw new Error('ConsolidationEngine not initialised');
      switch (args.action) {
        case 'run': {
          const effectiveScope = args.scope ?? 'global';
          const result = await consolidationEngine.run(effectiveScope);
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

    async amp_resolve(args) {
      if (!ampService) throw new Error('AMPService not initialised');
      const parsed = parseAmpUri(args.uri);
      const scopeParts = uriToLoadScope(parsed);
      const task = args.stage_context ?? `Resolve ${args.uri}`;
      const scope: LoadScope = {
        task,
        ...scopeParts,
        max_tokens: args.max_tokens ?? 2000,
      };
      const ctx = await ampService.load(scope);
      return textContent(ctx.markdown);
    },

    async amp_bootstrap(args) {
      if (!bootstrapService) throw new Error('BootstrapGraphService not initialised');
      const result = await bootstrapService.bootstrap({
        project_name: args.project_name,
        project_tag: args.project_tag,
        description: args.description,
        domain: args.domain,
        entities: args.entities,
        semantic_seeds: args.semantic_seeds ?? [],
        agents: args.agents ?? [{ id: 'mcp', name: 'Claude Code', type: 'assistant' }],
      });
      return textContent(JSON.stringify(result, null, 2));
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

  server.tool(
    'amp_resolve',
    'Resolve an AMP URI (amp://entity/Name or amp://tag/name) to rendered markdown. Use for loading Layer 3 reference material referenced in MWP stage CONTEXT.md files.',
    AmpResolveSchema,
    handlers.amp_resolve,
  );

  server.tool(
    'amp_bootstrap',
    'Bootstrap the knowledge graph for a project. Creates Entity nodes (project, modules, services, components), Agent nodes, seed Semantic principles, and CONTAINS/ABOUT relationships. Idempotent — safe to run multiple times. Call this ONCE when first working with a new project to seed the graph so that amp_store/amp_load/amp_consolidate have structure to work with.',
    AmpBootstrapSchema,
    handlers.amp_bootstrap,
  );
}
