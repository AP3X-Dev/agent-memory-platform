// packages/mcp/src/tools.ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { LoadScope, MemoryContext, EpisodeInput, MemoryTier, FactTimeline, FactDiff, TemporalOptions } from '@amp/core';
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

export interface IMemoryBlockService {
  read(scope: string, name: string, sessionId?: string): Promise<{ id: string; name: string; tier: string; content: string; scope: string; session_id?: string; created_at: string; updated_at: string } | null>;
  insert(scope: string, name: string, text: string, sessionId?: string): Promise<{ id: string; name: string; tier: string; content: string; scope: string }>;
  replace(scope: string, name: string, oldText: string, newText: string, sessionId?: string): Promise<{ id: string; name: string; tier: string; content: string; scope: string }>;
  rewrite(scope: string, name: string, content: string, sessionId?: string): Promise<{ id: string; name: string; tier: string; content: string; scope: string }>;
  promote(scope: string, name: string, fromTier: string, toTier: string): Promise<{ id: string; name: string; tier: string; content: string; scope: string }>;
  archive(scope: string, name: string, sessionId?: string): Promise<string>;
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

export interface IFactStore {
  timeline(entityName: string): Promise<FactTimeline>;
  diff(entityName: string, from: string, to: string): Promise<FactDiff>;
}

// ─── Injected instances ───────────────────────────────────────────────────────

let ampService: IAMPService | null = null;
let consolidationEngine: IConsolidationEngine | null = null;
let scopedQuery: IScopedQuery | null = null;
let bootstrapService: IBootstrapGraphService | null = null;
let memoryBlockService: IMemoryBlockService | null = null;
let factStore: IFactStore | null = null;

export function setServiceInstances(services: {
  ampService: IAMPService;
  consolidationEngine: IConsolidationEngine;
  scopedQuery: IScopedQuery;
  bootstrapService: IBootstrapGraphService;
  memoryBlockService?: IMemoryBlockService;
  factStore?: IFactStore;
}): void {
  ampService = services.ampService;
  consolidationEngine = services.consolidationEngine;
  scopedQuery = services.scopedQuery;
  bootstrapService = services.bootstrapService;
  memoryBlockService = services.memoryBlockService ?? null;
  factStore = services.factStore ?? null;
}

// ─── Tool name constants ──────────────────────────────────────────────────────

export const TOOL_NAMES = [
  'amp_load', 'amp_store', 'amp_query', 'amp_consolidate', 'amp_resolve', 'amp_bootstrap',
  'amp_memory_read', 'amp_memory_insert', 'amp_memory_replace', 'amp_memory_rewrite',
  'amp_memory_promote', 'amp_memory_archive',
  'amp_timeline', 'amp_fact_diff',
] as const;

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const AmpLoadSchema = {
  task: z.string().max(5000).describe('Task description for context assembly'),
  entities: z.array(z.string()).optional().describe('Entity names to scope the query'),
  tags: z.array(z.string()).optional().describe('Tags to scope the query'),
  max_tokens: z.number().int().positive().optional().default(4000).describe('Max tokens for context window'),
  temporal: z.object({
    time_mode: z.enum(['current', 'historical', 'interval', 'evolution']).optional().describe('Temporal query mode'),
    as_of: z.string().optional().describe('ISO timestamp for historical mode'),
    from: z.string().optional().describe('Interval start (ISO timestamp)'),
    to: z.string().optional().describe('Interval end (ISO timestamp)'),
    include_invalidated: z.boolean().optional().describe('Include invalidated facts in evolution mode'),
  }).optional().describe('Temporal filtering options for fact queries'),
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

const AmpMemoryReadSchema = {
  block: z.string().max(500).describe('Block name (e.g. "persona", "user", "working_state")'),
  scope: z.string().max(500).optional().describe('Project scope tag (e.g. "project:my-project")'),
  session_id: z.string().max(500).optional().describe('Session ID for working-tier blocks'),
};

const AmpMemoryInsertSchema = {
  block: z.string().max(500).describe('Block name'),
  text: z.string().max(5000).describe('Text to append to the block'),
  scope: z.string().max(500).optional().describe('Project scope tag'),
  session_id: z.string().max(500).optional().describe('Session ID for working-tier blocks'),
};

const AmpMemoryReplaceSchema = {
  block: z.string().max(500).describe('Block name'),
  old_text: z.string().max(5000).describe('Exact text to find and replace'),
  new_text: z.string().max(5000).describe('Replacement text'),
  scope: z.string().max(500).optional().describe('Project scope tag'),
  session_id: z.string().max(500).optional().describe('Session ID for working-tier blocks'),
};

const AmpMemoryRewriteSchema = {
  block: z.string().max(500).describe('Block name'),
  content: z.string().max(10000).describe('New content to overwrite the entire block'),
  scope: z.string().max(500).optional().describe('Project scope tag'),
  session_id: z.string().max(500).optional().describe('Session ID for working-tier blocks'),
};

const AmpMemoryPromoteSchema = {
  block: z.string().max(500).describe('Block name'),
  from_tier: z.enum(['core', 'working', 'archive']).describe('Current tier of the block'),
  to_tier: z.enum(['core', 'working', 'archive']).describe('Target tier to promote/demote to'),
  scope: z.string().max(500).optional().describe('Project scope tag'),
};

const AmpMemoryArchiveSchema = {
  block: z.string().max(500).describe('Block name to archive'),
  scope: z.string().max(500).optional().describe('Project scope tag'),
  session_id: z.string().max(500).optional().describe('Session ID for working-tier blocks'),
};

const AmpTimelineSchema = {
  entity: z.string().max(200).describe('Entity name to get timeline for'),
  include_episodes: z.boolean().optional().describe('Include linked episodes in timeline (default false)'),
  limit: z.number().int().max(100).optional().describe('Maximum number of facts to return'),
};

const AmpFactDiffSchema = {
  entity: z.string().max(200).describe('Entity name to diff'),
  from: z.string().describe('Start timestamp (ISO format)'),
  to: z.string().describe('End timestamp (ISO format)'),
};

// ─── Handler implementations ─────────────────────────────────────────────────

type ToolResult = Promise<{ content: Array<{ type: 'text'; text: string }> }>;

export type ToolHandlers = {
  amp_load: (args: {
    task: string;
    entities?: string[];
    tags?: string[];
    max_tokens?: number;
    temporal?: TemporalOptions;
  }) => ToolResult;
  amp_store: (args: {
    session_id: string;
    task: string;
    content: string;
    outcome?: 'approved' | 'revised' | 'rejected' | 'abandoned';
    signals?: Array<{ type: 'reinforcement' | 'correction' | 'contradiction'; target_id: string; detail: string }>;
  }) => ToolResult;
  amp_query: (args: { query: string; limit?: number }) => ToolResult;
  amp_consolidate: (args: {
    action: 'run' | 'status' | 'review';
    scope?: string;
    proposal_id?: string;
    decision?: 'approve' | 'reject';
  }) => ToolResult;
  amp_resolve: (args: {
    uri: string;
    max_tokens?: number;
    stage_context?: string;
  }) => ToolResult;
  amp_bootstrap: (args: {
    project_name: string;
    project_tag: string;
    description: string;
    domain: string;
    entities: Array<{ name: string; type: string; description?: string; parent?: string }>;
    semantic_seeds?: Array<{ claim: string; domain: string; confidence?: number; about?: string[]; tags?: string[] }>;
    agents?: Array<{ id: string; name: string; type: string }>;
  }) => ToolResult;
  amp_memory_read: (args: { block: string; scope?: string; session_id?: string }) => ToolResult;
  amp_memory_insert: (args: { block: string; text: string; scope?: string; session_id?: string }) => ToolResult;
  amp_memory_replace: (args: { block: string; old_text: string; new_text: string; scope?: string; session_id?: string }) => ToolResult;
  amp_memory_rewrite: (args: { block: string; content: string; scope?: string; session_id?: string }) => ToolResult;
  amp_memory_promote: (args: { block: string; from_tier: MemoryTier; to_tier: MemoryTier; scope?: string }) => ToolResult;
  amp_memory_archive: (args: { block: string; scope?: string; session_id?: string }) => ToolResult;
  amp_timeline: (args: { entity: string; include_episodes?: boolean; limit?: number }) => ToolResult;
  amp_fact_diff: (args: { entity: string; from: string; to: string }) => ToolResult;
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
        temporal: args.temporal,
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

    async amp_memory_read(args) {
      if (!memoryBlockService) throw new Error('MemoryBlockService not initialised');
      const scope = args.scope ?? 'default';
      const block = await memoryBlockService.read(scope, args.block, args.session_id);
      if (!block) {
        return textContent(JSON.stringify({ found: false, block: args.block }));
      }
      return textContent(JSON.stringify(block, null, 2));
    },

    async amp_memory_insert(args) {
      if (!memoryBlockService) throw new Error('MemoryBlockService not initialised');
      const scope = args.scope ?? 'default';
      const block = await memoryBlockService.insert(scope, args.block, args.text, args.session_id);
      return textContent(JSON.stringify({ ok: true, block: block.name, tier: block.tier, length: block.content.length }));
    },

    async amp_memory_replace(args) {
      if (!memoryBlockService) throw new Error('MemoryBlockService not initialised');
      const scope = args.scope ?? 'default';
      const block = await memoryBlockService.replace(scope, args.block, args.old_text, args.new_text, args.session_id);
      return textContent(JSON.stringify({ ok: true, block: block.name, tier: block.tier, length: block.content.length }));
    },

    async amp_memory_rewrite(args) {
      if (!memoryBlockService) throw new Error('MemoryBlockService not initialised');
      const scope = args.scope ?? 'default';
      const block = await memoryBlockService.rewrite(scope, args.block, args.content, args.session_id);
      return textContent(JSON.stringify({ ok: true, block: block.name, tier: block.tier, length: block.content.length }));
    },

    async amp_memory_promote(args) {
      if (!memoryBlockService) throw new Error('MemoryBlockService not initialised');
      const scope = args.scope ?? 'default';
      const block = await memoryBlockService.promote(scope, args.block, args.from_tier, args.to_tier);
      return textContent(JSON.stringify({ ok: true, block: block.name, tier: block.tier }));
    },

    async amp_memory_archive(args) {
      if (!memoryBlockService) throw new Error('MemoryBlockService not initialised');
      const scope = args.scope ?? 'default';
      const content = await memoryBlockService.archive(scope, args.block, args.session_id);
      return textContent(JSON.stringify({ ok: true, block: args.block, archived_length: content.length }));
    },

    async amp_timeline(args) {
      if (!factStore) throw new Error('FactStore not initialised');
      const tl = await factStore.timeline(args.entity);
      const facts = args.limit ? tl.facts.slice(0, args.limit) : tl.facts;

      const lines: string[] = [
        `# Timeline: ${tl.entity}`,
        '',
      ];
      for (const f of facts) {
        const status = f.status !== 'active' ? ` [${f.status}]` : '';
        const validRange = f.invalid_at
          ? `${f.valid_at} → ${f.invalid_at}`
          : `${f.valid_at} → present`;
        lines.push(`- **${f.event}** at ${f.at}: **${f.subject}** ${f.predicate} **${f.object}**${status} (${validRange}, confidence: ${f.confidence.toFixed(2)})`);
      }
      if (facts.length === 0) {
        lines.push('_No facts found for this entity._');
      }
      return textContent(lines.join('\n'));
    },

    async amp_fact_diff(args) {
      if (!factStore) throw new Error('FactStore not initialised');
      const d = await factStore.diff(args.entity, args.from, args.to);

      const lines: string[] = [
        `# Fact Diff: ${d.entity}`,
        `**From:** ${d.from}`,
        `**To:** ${d.to}`,
        '',
      ];

      if (d.added.length > 0) {
        lines.push('## Added');
        for (const f of d.added) {
          lines.push(`- **${f.subject}** ${f.predicate} **${f.object}** (confidence: ${f.confidence.toFixed(2)}, since: ${f.valid_at.split('T')[0]})`);
        }
        lines.push('');
      }

      if (d.invalidated.length > 0) {
        lines.push('## Invalidated');
        for (const f of d.invalidated) {
          lines.push(`- ~~**${f.subject}** ${f.predicate} **${f.object}**~~ (was valid: ${f.valid_at.split('T')[0]} → ${f.invalid_at?.split('T')[0] ?? '?'})`);
        }
        lines.push('');
      }

      if (d.changed.length > 0) {
        lines.push('## Changed');
        for (const c of d.changed) {
          lines.push(`- **${c.before.subject}** ${c.before.predicate}: ~~${c.before.object}~~ → **${c.after.object}** (confidence: ${c.after.confidence.toFixed(2)})`);
        }
        lines.push('');
      }

      if (d.added.length === 0 && d.invalidated.length === 0 && d.changed.length === 0) {
        lines.push('_No changes detected in this time range._');
      }

      return textContent(lines.join('\n'));
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

  server.tool(
    'amp_memory_read',
    'Read a memory block by name. Returns the block content, tier, and metadata.',
    AmpMemoryReadSchema,
    handlers.amp_memory_read,
  );

  server.tool(
    'amp_memory_insert',
    'Append text to a memory block. Creates the block if it does not exist.',
    AmpMemoryInsertSchema,
    handlers.amp_memory_insert,
  );

  server.tool(
    'amp_memory_replace',
    'Find and replace text within a memory block. Throws if old_text is not found.',
    AmpMemoryReplaceSchema,
    handlers.amp_memory_replace,
  );

  server.tool(
    'amp_memory_rewrite',
    'Overwrite the entire content of a memory block. Creates the block if it does not exist.',
    AmpMemoryRewriteSchema,
    handlers.amp_memory_rewrite,
  );

  server.tool(
    'amp_memory_promote',
    'Change the tier of a memory block (e.g. working → core). Promoting to core persists to Neo4j.',
    AmpMemoryPromoteSchema,
    handlers.amp_memory_promote,
  );

  server.tool(
    'amp_memory_archive',
    'Archive a memory block: returns its content for the caller to store as an episodic entry, then deletes the block.',
    AmpMemoryArchiveSchema,
    handlers.amp_memory_archive,
  );

  server.tool(
    'amp_timeline',
    'Chronological fact history for an entity. Shows all facts with creation, invalidation, dispute, and supersession events ordered by time.',
    AmpTimelineSchema,
    handlers.amp_timeline,
  );

  server.tool(
    'amp_fact_diff',
    'Show what facts changed about an entity between two timestamps. Returns added, invalidated, and changed facts.',
    AmpFactDiffSchema,
    handlers.amp_fact_diff,
  );
}
