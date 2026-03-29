// packages/retrieval/src/tools.ts
// The amp_context MCP tool — unified super-load.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
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
  }): Promise<UnifiedContext>;
  renderMarkdown(ctx: UnifiedContext): string;
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

// ─── Injected instances ──────────────────────────────────────────────────────

let assembler: IUnifiedAssembler | null = null;
let feedbackTracker: IFeedbackTracker | null = null;

export function setRetrievalServiceInstances(services: {
  assembler: IUnifiedAssembler;
  feedbackTracker: IFeedbackTracker;
}): void {
  assembler = services.assembler;
  feedbackTracker = services.feedbackTracker;
}

// ─── Tool names ──────────────────────────────────────────────────────────────

export const RETRIEVAL_TOOL_NAMES = ['amp_context', 'amp_feedback'] as const;

function textContent(text: string): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text' as const, text }] };
}

// ─── Tool registration ────────────────────────────────────────────────────────

export function registerRetrievalTools(server: McpServer): void {

  // ─── amp_context ────────────────────────────────────────────────────────
  server.tool(
    'amp_context',
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
    },
    async (args) => {
      if (!assembler) throw new Error('Retrieval services not initialised');
      const ctx = await assembler.assemble(args.task, {
        strategy: args.strategy as RetrievalStrategy,
        include_code: args.include_code,
        include_arch: args.include_arch,
        include_memory: args.include_memory,
        max_tokens: args.max_tokens,
        entity_scope: args.entity_scope,
        tag_scope: args.tag_scope,
        project_name: args.project_name,
      });
      const md = assembler.renderMarkdown(ctx);
      return textContent(md);
    },
  );

  // ─── amp_feedback ───────────────────────────────────────────────────────
  server.tool(
    'amp_feedback',
    'Record feedback on retrieval results. Tell AMP which results were useful and which were not. This improves future retrieval rankings over time.',
    {
      result_id: z.string().max(500).describe('ID of the result to give feedback on'),
      was_useful: z.boolean().describe('Whether this result was useful for your task'),
      session_id: z.string().max(500).describe('Current session ID'),
      query: z.string().max(2000).optional().default('').describe('The original query that produced this result'),
      source_type: z.enum(['semantic', 'episodic', 'symbol', 'arch_entity', 'aspect']).optional().default('semantic')
        .describe('Type of the result'),
    },
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
  );
}
