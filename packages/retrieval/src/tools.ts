// packages/retrieval/src/tools.ts
// The berry_context MCP tool — unified super-load.

import { z } from 'zod';
import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { DEFAULT_TENANT } from '@memberry/core';
import type { UnifiedContext, RetrievalStrategy } from './types.js';

// ─── Service interface (injected) ────────────────────────────────────────────

export interface IUnifiedAssembler {
  assemble(task: string, options?: {
    strategy?: RetrievalStrategy;
    include_code?: boolean;
    include_arch?: boolean;
    include_memory?: boolean;
    max_tokens?: number;
    entity_scope?: string[];
    tag_scope?: string[];
    project_name?: string;
    as_of?: string;
    tenantId?: string;
  }): Promise<UnifiedContext>;
  renderMarkdown(ctx: UnifiedContext): string;
  ask(question: string, options?: {
    level?: 'minimal' | 'low' | 'medium' | 'high' | 'max';
    entity_scope?: string[];
    tag_scope?: string[];
    project_name?: string;
    as_of?: string;
    tenantId?: string;
  }): Promise<{
    answer: string;
    cited_ids: string[];
    evidence: Array<{ id: string; content: string }>;
    level: string;
  }>;
}

export interface IFeedbackTracker {
  recordFeedback(signal: {
    query: string;
    result_id: string;
    source_type: string;
    was_useful: boolean;
    session_id: string;
    timestamp: string;
  }): Promise<void>;
}

// ─── Service container ────────────────────────────────────────────────────────
//
// The tool layer depends on a single typed container of services rather than a
// scatter of module-level singletons. A process-default container backs the
// legacy setRetrievalServiceInstances() injection point, while
// registerRetrievalTools() also accepts an explicit container — the seam that
// makes per-session / multi-tenant service isolation possible without process
// globals.

export interface RetrievalServiceContainer {
  assembler: IUnifiedAssembler | null;
  feedbackTracker: IFeedbackTracker | null;
  /** Tenant this container's tools are bound to. Threaded into every assemble/ask. */
  tenantId: string;
}

/** Build a container, defaulting any service not supplied to null. */
export function createRetrievalContainer(partial: Partial<RetrievalServiceContainer> = {}): RetrievalServiceContainer {
  return {
    assembler: partial.assembler ?? null,
    feedbackTracker: partial.feedbackTracker ?? null,
    tenantId: partial.tenantId ?? DEFAULT_TENANT,
  };
}

/** Process-default container, populated by setRetrievalServiceInstances() at bootstrap. */
const defaultContainer: RetrievalServiceContainer = createRetrievalContainer();

/** A retrieval container bound to a tenant, reusing the shared assembler. */
export function retrievalContainerForTenant(tenantId: string): RetrievalServiceContainer {
  return { ...defaultContainer, tenantId };
}

export function setRetrievalServiceInstances(services: {
  assembler: IUnifiedAssembler;
  feedbackTracker: IFeedbackTracker;
}): void {
  // Full reset of the default container (a service omitted from `services` is
  // cleared), mirroring packages/mcp/src/tools.ts setServiceInstances().
  defaultContainer.assembler = services.assembler ?? null;
  defaultContainer.feedbackTracker = services.feedbackTracker ?? null;
}

// ─── Tool names ──────────────────────────────────────────────────────────────

export const RETRIEVAL_TOOL_NAMES = ['berry_context', 'berry_ask', 'berry_feedback'] as const;

function textContent(text: string): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text' as const, text }] };
}

// ─── Tool registration ────────────────────────────────────────────────────────

export interface RetrievalRegisteredTools {
  /** Tier 1 tool — berry_context, always enabled. */
  tier1: RegisteredTool[];
  /** Tier 2 tools — berry_feedback, disabled by default. */
  tier2: RegisteredTool[];
}

export function registerRetrievalTools(
  server: McpServer,
  container: RetrievalServiceContainer = defaultContainer,
): RetrievalRegisteredTools {
  // Destructure once into closure-captured locals. Handlers reference these by
  // the same names they used as module globals, so their bodies are unchanged —
  // but each call to registerRetrievalTools can now be bound to a different container.
  const { assembler, feedbackTracker, tenantId } = container;
  const tier1: RegisteredTool[] = [];
  const tier2: RegisteredTool[] = [];

  // ─── berry_context (Tier 1) ───────────────────────────────────────────────
  tier1.push(server.tool(
    'berry_context',
    'Unified super-load: assembles context combining architecture (hierarchy, dependencies, aspects), code (symbols, signatures, docs), and memory (semantic principles, episodic history) into a single response. Three strategies: "auto" (default — classifies query intent and routes automatically), "ranked" (hybrid search with RRF fusion, query expansion, and feedback boosts — best for exploration), "deterministic" (Yggdrasil-style 5-step assembly — same graph state always produces same output, best for architectural queries). Use this as your primary context-loading tool when you need a complete picture.',
    {
      task: z.string().max(5000).describe('Task description (what you are about to do)'),
      strategy: z.enum(['auto', 'ranked', 'deterministic']).optional().default('auto')
        .describe('Retrieval strategy: "auto" (classifies intent and routes), "ranked" for exploration, "deterministic" for architectural queries'),
      include_code: z.boolean().optional().default(true).describe('Include code symbols in results'),
      include_arch: z.boolean().optional().default(true).describe('Include architectural context'),
      include_memory: z.boolean().optional().default(true).describe('Include semantic/episodic memory'),
      max_tokens: z.number().int().positive().optional().default(8000).describe('Max tokens for the assembled context'),
      entity_scope: z.array(z.string()).optional().describe('Scope to specific entities'),
      tag_scope: z.array(z.string()).optional().describe('Scope to specific tags'),
      project_name: z.string().max(2000).optional().describe('Project name for scoping'),
      as_of: z.string().optional().describe('ISO 8601 timestamp for point-in-time queries. When set, only knowledge valid at this time is included.'),
    },
    { readOnlyHint: true, idempotentHint: true } satisfies ToolAnnotations,
    async (args) => {
      if (!assembler) throw new Error('Retrieval services not initialised');
      // Tenant safety: the deterministic strategy queries un-tenant-stamped
      // Entity/Aspect nodes, so it is not safe for a named tenant. Force the
      // ranked path (memory is tenant-filtered; arch entities strict-match to
      // empty for a named tenant — no cross-tenant leak).
      const strategy = tenantId !== DEFAULT_TENANT ? 'ranked' : (args.strategy as RetrievalStrategy);
      const ctx = await assembler.assemble(args.task, {
        strategy,
        include_code: args.include_code,
        include_arch: args.include_arch,
        include_memory: args.include_memory,
        max_tokens: args.max_tokens,
        entity_scope: args.entity_scope,
        tag_scope: args.tag_scope,
        project_name: args.project_name,
        as_of: args.as_of,
        tenantId,
      });
      const md = assembler.renderMarkdown(ctx);
      return textContent(md);
    },
  ));

  // ─── berry_ask (Tier 1 — dialectic retrieval) ─────────────────────────────
  tier1.push(server.tool(
    'berry_ask',
    'Ask a natural-language question about everything in memory and get a synthesized, CITED answer — not raw chunks. Combines facts via explicit inference, says so when evidence is insufficient, and returns the supporting node IDs. reasoning_level (minimal|low|medium|high|max) trades latency/cost for depth. Use this when the answer requires reasoning over multiple memories; use berry_context when you want the raw assembled context.',
    {
      question: z.string().max(2000).describe('A natural-language question about the user/project/codebase memory'),
      reasoning_level: z.enum(['minimal', 'low', 'medium', 'high', 'max']).optional().default('medium')
        .describe('Depth/cost knob: minimal=terse lookup, max=report-style synthesis'),
      entity_scope: z.array(z.string()).optional().describe('Scope to specific entities'),
      tag_scope: z.array(z.string()).optional().describe('Scope to specific tags'),
      project_name: z.string().max(2000).optional().describe('Project name for scoping'),
      as_of: z.string().optional().describe('ISO 8601 timestamp — answer as of a point in time'),
    },
    { readOnlyHint: true, idempotentHint: true } satisfies ToolAnnotations,
    async (args) => {
      if (!assembler) throw new Error('Retrieval services not initialised');
      const r = await assembler.ask(args.question, {
        level: args.reasoning_level,
        entity_scope: args.entity_scope,
        tag_scope: args.tag_scope,
        project_name: args.project_name,
        as_of: args.as_of,
        tenantId,
      });
      const lines = [
        `# Answer`,
        ``,
        r.answer,
        ``,
        `**Reasoning level:** ${r.level} · **Cited:** ${r.cited_ids.length ? r.cited_ids.join(', ') : 'none'}`,
        ``,
        `## Evidence`,
        ...r.evidence.map((e, i) => `<!-- ${e.id} -->\n[${i + 1}] ${e.content}`),
      ];
      return textContent(lines.join('\n'));
    },
  ));

  // ─── berry_feedback (Tier 2 — retrieval domain) ──────────────────────────
  tier2.push(server.tool(
    'berry_feedback',
    'Record feedback on retrieval results. Tell MemBerry which results were useful and which were not. This improves future retrieval rankings over time.',
    {
      result_id: z.string().max(500).describe('ID of the result to give feedback on'),
      was_useful: z.boolean().describe('Whether this result was useful for your task'),
      session_id: z.string().max(500).describe('Current session ID'),
      query: z.string().max(2000).optional().default('').describe('The original query that produced this result'),
      source_type: z.enum(['semantic', 'episodic', 'symbol', 'arch_entity', 'aspect']).optional().default('semantic')
        .describe('Type of the result'),
    },
    { readOnlyHint: true } satisfies ToolAnnotations,
    async (args) => {
      if (!feedbackTracker) throw new Error('Retrieval services not initialised');
      await feedbackTracker.recordFeedback({
        query: args.query,
        result_id: args.result_id,
        source_type: args.source_type,
        was_useful: args.was_useful,
        session_id: args.session_id,
        timestamp: new Date().toISOString(),
      });
      return textContent(JSON.stringify({ recorded: true, result_id: args.result_id, was_useful: args.was_useful }));
    },
  ));

  return { tier1, tier2 };
}
