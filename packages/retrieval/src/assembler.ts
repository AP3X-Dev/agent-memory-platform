// packages/retrieval/src/assembler.ts
// The unified context assembler — the "super-load" that blends
// architecture + code + memory into a single context package.

import { type Driver } from 'neo4j-driver';
import type {
  UnifiedContext,
  ContextSection,
  ContextItem,
  RetrievalResult,
  RetrievalOptions,
  BoostFactors,
} from './types.js';
import { rrfFusion, dedup } from './fusion.js';
import { DeterministicAssembler } from './deterministic.js';
import { FeedbackTracker, type FeedbackRedisLayer } from './feedback.js';
import { expandQuery } from './expand.js';
import { computeQueryStats, lexicalTextScore, adaptiveWeights } from './scoring.js';
import { classifyIntent } from './intent.js';
import type { QueryIntent } from './intent.js';
import type { EmbeddingProvider } from '@amp/core';

// ─── Dependency interfaces ───────────────────────────────────────────────────

export interface AssemblerCodeLayer {
  search(query: string, options?: { limit?: number; include_semantics?: boolean; expandedTokens?: string[] }): Promise<
    Array<{ id: string; source_type: string; name: string; kind: string; file_path: string; start_line: number; signature: string; doc_comment: string; score: number }>
  >;
}

export interface AssemblerMemoryLayer {
  load(scope: { task: string; entities?: string[]; tags?: string[]; max_tokens?: number; temporal?: { time_mode?: string; as_of?: string; from?: string; to?: string; include_invalidated?: boolean } }): Promise<{
    markdown: string; tokens: number; sources: string[];
  }>;
}

// ─── Unified assembler ──────────────────────────────────────────────────────

export class UnifiedAssembler {
  private deterministic: DeterministicAssembler;
  private feedback: FeedbackTracker;
  private cachedCollectionSize: number | undefined;
  private collectionSizeCachedAt = 0;
  private static readonly COLLECTION_SIZE_TTL_MS = 60_000; // 60s cache

  constructor(
    private driver: Driver,
    private redis: FeedbackRedisLayer,
    private codeLayer: AssemblerCodeLayer | null,
    private memoryLayer: AssemblerMemoryLayer | null,
    private embedding: EmbeddingProvider,
  ) {
    this.deterministic = new DeterministicAssembler(driver);
    this.feedback = new FeedbackTracker(redis);
  }

  private async getCollectionSize(): Promise<number | undefined> {
    const now = Date.now();
    if (this.cachedCollectionSize !== undefined && now - this.collectionSizeCachedAt < UnifiedAssembler.COLLECTION_SIZE_TTL_MS) {
      return this.cachedCollectionSize;
    }
    try {
      const session = this.driver.session();
      try {
        const result = await session.run('MATCH (s:Symbol) RETURN count(s) AS c');
        const raw = result.records[0]?.get('c');
        this.cachedCollectionSize = typeof raw === 'number' ? raw : raw?.toNumber?.() ?? undefined;
        this.collectionSizeCachedAt = now;
      } finally {
        await session.close();
      }
    } catch { /* proceed without scaling */ }
    return this.cachedCollectionSize;
  }

  /**
   * Assemble unified context combining architecture, code, and memory.
   *
   * Two strategies:
   * - 'ranked': Hybrid search + RRF fusion + feedback boosts. Best for exploration.
   * - 'deterministic': Yggdrasil 5-step algorithm. Same graph → same output. Best for architecture queries.
   */
  async assemble(task: string, options?: Partial<RetrievalOptions>): Promise<UnifiedContext> {
    const opts: RetrievalOptions = {
      strategy: options?.strategy ?? 'auto',
      include_code: options?.include_code ?? true,
      include_arch: options?.include_arch ?? true,
      include_memory: options?.include_memory ?? true,
      max_tokens: options?.max_tokens ?? 8000,
      entity_scope: options?.entity_scope,
      tag_scope: options?.tag_scope,
      project_name: options?.project_name,
      as_of: options?.as_of,
    };

    // Auto strategy: classify intent and route accordingly
    if (opts.strategy === 'auto') {
      let intentResult: { intent: QueryIntent; confidence: number; method: string };
      try {
        intentResult = await classifyIntent(task, this.embedding);
      } catch (err) {
        console.error('[amp-retrieval] Intent classification failed:', err instanceof Error ? err.message : err);
        intentResult = { intent: 'HYBRID', confidence: 0.4, method: 'fallback' };
      }

      if (intentResult.intent === 'GRAPH') {
        return this.assembleDeterministic(task, opts);
      }
      return this.assembleRanked(task, opts, intentResult.intent);
    }

    if (opts.strategy === 'deterministic') {
      return this.assembleDeterministic(task, opts);
    }

    return this.assembleRanked(task, opts, 'HYBRID');
  }

  /**
   * Render unified context as markdown.
   */
  renderMarkdown(ctx: UnifiedContext): string {
    const lines: string[] = [];
    lines.push(`# Unified Context`);
    lines.push(`**Task:** ${ctx.task}`);

    // Real provenance: count items per source type and list IDs
    const sourceCounts: Record<string, number> = {};
    const sourceIds: string[] = [];
    for (const section of ctx.sections) {
      for (const item of section.items) {
        sourceCounts[section.source_type] = (sourceCounts[section.source_type] ?? 0) + 1;
        sourceIds.push(item.id);
      }
    }
    const provenance = Object.entries(sourceCounts).map(([type, count]) => `${type}:${count}`).join(', ');
    lines.push(`**Strategy:** ${ctx.strategy} | **Tokens:** ~${ctx.token_count} | **Sources:** ${provenance || 'none'} | **IDs:** ${sourceIds.length}`);
    lines.push('');

    for (const section of ctx.sections) {
      if (section.items.length === 0) continue;
      lines.push(`## ${section.heading}`);
      lines.push('');
      for (const item of section.items) {
        // Include item ID for traceability
        const filePath = item.metadata.file_path ? ` — ${item.metadata.file_path}` : '';
        lines.push(`<!-- ${item.id}${filePath} -->`);
        lines.push(item.content);
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  // ─── Ranked assembly ───────────────────────────────────────────────────

  private async assembleRanked(
    task: string,
    opts: RetrievalOptions,
    intent: QueryIntent = 'HYBRID',
  ): Promise<UnifiedContext> {
    const lists: RetrievalResult[][] = [];

    // Intent-aware query expansion
    const expansion = expandQuery(task, intent);

    // Gather results from each layer in parallel (individual failures don't crash assembly)
    const promises: Promise<void>[] = [];

    if (opts.include_arch) {
      const archQuery = expansion.expanded.slice(0, 3).join(' OR ');
      promises.push(
        this.searchArchEntities(archQuery, opts)
          .then((results) => { lists.push(results); })
          .catch((err) => { console.error('[amp-retrieval] Arch search failed:', err instanceof Error ? err.message : err); }),
      );
    }

    if (opts.include_code && this.codeLayer) {
      promises.push(
        this.codeLayer.search(task, { limit: 20, include_semantics: false, expandedTokens: expansion.tokens })
          .then((results) => {
            lists.push(results.map((r) => ({
              id: r.id,
              source_type: 'symbol' as const,
              title: `${r.name} (${r.kind})`,
              content: `**${r.name}** (${r.kind}) — \`${r.file_path}:${r.start_line}\`\n\`${r.signature}\`${r.doc_comment ? '\n> ' + r.doc_comment.split('\n')[0] : ''}`,
              score: r.score,
              metadata: { kind: r.kind, file_path: r.file_path },
            })));
          })
          .catch((err) => { console.error('[amp-retrieval] Code search failed:', err instanceof Error ? err.message : err); }),
      );
    }

    if (opts.include_memory && this.memoryLayer) {
      promises.push(
        this.memoryLayer.load({
          task,
          entities: opts.entity_scope,
          tags: opts.tag_scope,
          max_tokens: Math.floor(opts.max_tokens / 3),
          ...(opts.as_of ? { temporal: { as_of: opts.as_of } } : {}),
        })
          .then((ctx) => { lists.push(parseMemoryMarkdown(ctx.markdown, ctx.sources)); })
          .catch((err) => { console.error('[amp-retrieval] Memory layer failed:', err instanceof Error ? err.message : err); }),
      );
    }

    await Promise.all(promises);

    // Get feedback boosts (non-critical)
    let boosts: BoostFactors | undefined;
    try {
      boosts = await this.feedback.getBoosts();
    } catch { /* proceed without boosts */ }

    // Get collection size for dynamic k scaling (cached 60s to avoid per-request query)
    const collectionSize = await this.getCollectionSize();

    // Build lexical text boost function (applied inside fusion, between normalization and MMR)
    const queryStats = computeQueryStats(task);
    const weights = adaptiveWeights(queryStats);
    const textBoostFn = (result: RetrievalResult): number => {
      try {
        const boost = lexicalTextScore(
          expansion.tokens,
          { name: result.title, file_path: result.metadata.file_path as string, signature: result.content },
        );
        return result.score * (1.0 + boost * weights.lexicalTextWeight);
      } catch {
        return result.score; // Non-critical — return unmodified
      }
    };

    // Fuse all lists via RRF (dynamic k, normalization, text boost, then MMR diversity)
    const fused = rrfFusion(lists, 50, 60, boosts, collectionSize, textBoostFn);
    const deduped = dedup(fused);

    // Budget tokens and group by source type
    const sections = groupAndBudget(deduped, opts.max_tokens);

    const tokenCount = sections.reduce(
      (sum, s) => sum + s.items.reduce((isum, i) => isum + Math.ceil(i.content.length / 4), 0),
      0,
    );

    return {
      task,
      strategy: 'ranked',
      sections,
      token_count: tokenCount,
      assembled_at: new Date().toISOString(),
    };
  }

  // ─── Deterministic assembly ────────────────────────────────────────────

  private async assembleDeterministic(task: string, opts: RetrievalOptions): Promise<UnifiedContext> {
    const sections = await this.deterministic.assemble(task, {
      entity_scope: opts.entity_scope,
      project_name: opts.project_name,
      max_tokens: opts.max_tokens,
      as_of: opts.as_of,
    });

    const tokenCount = sections.reduce(
      (sum, s) => sum + s.items.reduce((isum, i) => isum + Math.ceil(i.content.length / 4), 0),
      0,
    );

    return {
      task,
      strategy: 'deterministic',
      sections,
      token_count: tokenCount,
      assembled_at: new Date().toISOString(),
    };
  }

  // ─── Arch entity search ────────────────────────────────────────────────

  private async searchArchEntities(task: string, opts: RetrievalOptions): Promise<RetrievalResult[]> {
    const session = this.driver.session();
    try {
      // Fulltext search on entity architectural properties
      const escaped = task
        .replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, '\\$&')
        .replace(/\b(AND|OR|NOT|TO)\b/g, '"$1"');
      const result = await session.run(
        `CALL db.index.fulltext.queryNodes('entity_arch_content', $query)
         YIELD node AS e, score
         RETURN e, score
         ORDER BY score DESC LIMIT 15`,
        { query: `${escaped}*` },
      );

      return result.records.map((r) => {
        const props = r.get('e').properties as Record<string, unknown>;
        const parts: string[] = [`**${props.name}** (${props.category ?? props.type ?? 'entity'})`];
        if (props.responsibility) parts.push(`Responsibility: ${props.responsibility}`);
        if (props.interface_desc) parts.push(`Interface: ${(props.interface_desc as string).slice(0, 200)}`);

        return {
          id: props.id as string,
          source_type: 'arch_entity' as const,
          title: props.name as string,
          content: parts.join('\n'),
          score: r.get('score') as number,
          metadata: { category: props.category, name: props.name },
        };
      });
    } catch (err) {
      console.error('[amp-retrieval] Arch entity search failed (index may not exist):', err instanceof Error ? err.message : err);
      return [];
    } finally {
      await session.close();
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseMemoryMarkdown(markdown: string, sourceIds: string[]): RetrievalResult[] {
  // Parse the rendered memory markdown back into individual results
  const results: RetrievalResult[] = [];
  const sections = markdown.split(/^## /m).filter(Boolean);

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const firstLine = section.split('\n')[0] ?? '';
    const id = sourceIds[i] ?? `mem-${i}`;

    // Extract confidence from the heading if present
    const confMatch = firstLine.match(/confidence:\s*([\d.]+)/);
    const score = confMatch ? parseFloat(confMatch[1]) : 0.5;

    results.push({
      id,
      source_type: 'semantic',
      title: firstLine.slice(0, 80),
      content: section.trim(),
      score,
      metadata: {},
    });
  }

  return results;
}

function groupAndBudget(results: RetrievalResult[], maxTokens: number): ContextSection[] {
  const groups = new Map<string, { heading: string; items: ContextItem[] }>();
  let tokenCount = 0;

  const headingMap: Record<string, string> = {
    arch_entity: 'Architecture',
    symbol: 'Code',
    semantic: 'Knowledge',
    episodic: 'History',
    aspect: 'Cross-Cutting Concerns',
  };

  for (const result of results) {
    const itemTokens = Math.ceil(result.content.length / 4);
    if (tokenCount + itemTokens > maxTokens) break;

    const key = result.source_type;
    if (!groups.has(key)) {
      groups.set(key, { heading: headingMap[key] ?? key, items: [] });
    }
    groups.get(key)!.items.push({
      id: result.id,
      content: result.content,
      score: result.score,
      metadata: result.metadata,
    });
    tokenCount += itemTokens;
  }

  return [...groups.entries()].map(([key, group]) => ({
    heading: group.heading,
    source_type: key as ContextSection['source_type'],
    items: group.items,
  }));
}
