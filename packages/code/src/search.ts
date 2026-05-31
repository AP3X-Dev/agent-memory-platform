// packages/code/src/search.ts
// Hybrid search: vector + fulltext + graph-boosted with RRF fusion.
// Blends code symbols with semantic memories into a unified result set.

import neo4j, { type Driver } from 'neo4j-driver';
import type { CodeSearchResult, CodeContext } from './types.js';
import type { EmbeddingProvider } from '@amp/core';
import { generateLexicalVector } from './vectors.js';

interface CodeContextFilters {
  language?: string;
  file_path?: string;
  kind?: string;
}

export class CodeSearch {
  constructor(
    private driver: Driver,
    private embedding: EmbeddingProvider,
  ) {}

  /**
   * Hybrid search across Symbol nodes AND Semantic memories.
   * 1. Fulltext search on symbol names/signatures/doc_comments
   * 2. Vector search on symbol embeddings (if available)
   * 3. Vector search on semantic memories
   * 4. RRF fusion to produce a single ranked list
   */
  async search(
    query: string,
    options?: {
      language?: string;
      file_path?: string;
      kind?: string;
      limit?: number;
      include_semantics?: boolean;
      expandedTokens?: string[];
      as_of?: string;
    },
  ): Promise<CodeSearchResult[]> {
    const limit = options?.limit ?? 20;
    const includeSemantics = options?.include_semantics ?? true;

    // 4-way parallel: fulltext + dense vector + lexical vector + semantic
    const [fulltextResults, vectorResults, lexicalResults, semanticResults] = await Promise.all([
      this.fulltextSearch(options?.expandedTokens?.join(' ') ?? query, limit, options),
      this.vectorSearch(query, limit, options),
      this.lexicalVectorSearch(query, limit, options),
      includeSemantics ? this.semanticVectorSearch(query, limit, options?.as_of) : Promise.resolve([]),
    ]);

    // RRF fusion across all result lists (source_type already set per list)
    const allLists: CodeSearchResult[][] = [fulltextResults, lexicalResults, vectorResults, semanticResults];
    const fused = rrfFusion(allLists, limit);

    return fused;
  }

  /**
   * Build code-aware context for a task.
   * Returns relevant symbols + semantic memories, token-budgeted.
   */
  async buildContext(
    task: string,
    maxTokens = 6000,
    as_of?: string,
    filters?: CodeContextFilters,
  ): Promise<CodeContext> {
    const results = await this.search(task, { limit: 30, include_semantics: true, as_of, ...filters });

    const symbols: CodeSearchResult[] = [];
    const semantics: Array<{ id: string; content: string; confidence: number }> = [];
    let tokenCount = 0;

    for (const result of results) {
      const estimatedTokens = Math.ceil((result.signature.length + result.doc_comment.length + 50) / 4);
      if (tokenCount + estimatedTokens > maxTokens) continue;

      if (result.source_type === 'symbol') {
        symbols.push(result);
      } else {
        semantics.push({
          id: result.id,
          content: result.doc_comment || result.signature,
          confidence: result.score,
        });
      }
      tokenCount += estimatedTokens;
    }

    return { task, symbols, semantic_memories: semantics, token_count: tokenCount };
  }

  /**
   * Render code context as markdown.
   */
  renderContextMarkdown(ctx: CodeContext): string {
    const lines: string[] = [];
    lines.push(`# Code Context`);
    lines.push(`**Task:** ${ctx.task}`);
    lines.push('');

    if (ctx.symbols.length > 0) {
      lines.push('## Relevant Symbols');
      lines.push('');
      for (const s of ctx.symbols) {
        lines.push(`### ${s.name} (${s.kind}) — ${s.file_path}:${s.start_line}`);
        lines.push(`\`${s.signature}\``);
        if (s.doc_comment) lines.push(`> ${s.doc_comment.split('\n')[0]}`);
        lines.push('');
      }
    }

    if (ctx.semantic_memories.length > 0) {
      lines.push('## Related Knowledge');
      lines.push('');
      for (const m of ctx.semantic_memories) {
        lines.push(`- [${m.confidence.toFixed(2)}] ${m.content}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  // ─── Private search strategies ──────────────────────────────────────────

  private async fulltextSearch(
    query: string,
    limit: number,
    options?: { language?: string; file_path?: string; kind?: string },
  ): Promise<CodeSearchResult[]> {
    const session = this.driver.session();
    try {
      // Escape special Lucene characters for fulltext search
      const escaped = query
        .replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, '\\$&')
        .replace(/\b(AND|OR|NOT|TO)\b/g, '"$1"');

      const filters: string[] = [];
      const params: Record<string, unknown> = {
        query: `${escaped}*`,
        limit: neo4j.int(limit),
      };

      if (options?.language) {
        filters.push('s.language = $language');
        params.language = options.language;
      }
      if (options?.file_path) {
        filters.push('toLower(s.file_path) CONTAINS toLower($file_path)');
        params.file_path = options.file_path;
      }
      if (options?.kind) {
        filters.push('s.kind = $kind');
        params.kind = options.kind;
      }

      const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

      const result = await session.run(
        `CALL db.index.fulltext.queryNodes('symbol_search', $query)
         YIELD node AS s, score
         ${whereClause}
         RETURN s, score
         ORDER BY score DESC
         LIMIT $limit`,
        params,
      );

      return result.records.map((r) => {
        const props = r.get('s').properties as Record<string, unknown>;
        return {
          id: props.id as string,
          source_type: 'symbol' as const,
          name: props.name as string,
          kind: props.kind as string,
          language: (props.language as string) ?? '',
          file_path: props.file_path as string,
          start_line: toNum(props.start_line),
          signature: (props.signature as string) ?? '',
          doc_comment: (props.doc_comment as string) ?? '',
          score: r.get('score') as number,
        };
      });
    } finally {
      await session.close();
    }
  }

  private async vectorSearch(
    query: string,
    limit: number,
    options?: { language?: string; file_path?: string; kind?: string },
  ): Promise<CodeSearchResult[]> {
    try {
      const queryEmbedding = await this.embedding.embed(query);
      const candidateLimit = candidateLimitForPostFilters(limit, options);
      const session = this.driver.session();
      try {
        const result = await session.run(
          `CALL db.index.vector.queryNodes('symbol_embedding', $limit, $embedding)
           YIELD node AS s, score
           RETURN s, score`,
          { limit: neo4j.int(candidateLimit), embedding: queryEmbedding },
        );

        let results = result.records.map((r) => {
          const props = r.get('s').properties as Record<string, unknown>;
          return {
            id: props.id as string,
            source_type: 'symbol' as const,
            name: props.name as string,
            kind: props.kind as string,
            language: (props.language as string) ?? '',
            file_path: props.file_path as string,
            start_line: toNum(props.start_line),
            signature: (props.signature as string) ?? '',
            doc_comment: (props.doc_comment as string) ?? '',
            score: r.get('score') as number,
          };
        });

        // Apply post-filters (language matches the symbol's language property, not file extension)
        if (options?.language) results = results.filter((r) => r.language === options.language);
        if (options?.file_path) results = results.filter((r) => includesCaseInsensitive(r.file_path, options.file_path!));
        if (options?.kind) results = results.filter((r) => r.kind === options.kind);

        return results.slice(0, limit);
      } finally {
        await session.close();
      }
    } catch (err) {
      console.error('[amp-code] Symbol vector search failed (falling back to fulltext):', err instanceof Error ? err.message : err);
      return [];
    }
  }

  private async lexicalVectorSearch(
    query: string,
    limit: number,
    options?: { language?: string; file_path?: string; kind?: string },
  ): Promise<CodeSearchResult[]> {
    try {
      const lexVec = generateLexicalVector(query);
      const candidateLimit = candidateLimitForPostFilters(limit, options);
      const session = this.driver.session();
      try {
        const result = await session.run(
          `CALL db.index.vector.queryNodes('symbol_lexical', $limit, $vector)
           YIELD node AS s, score
           RETURN s, score`,
          { limit: neo4j.int(candidateLimit), vector: lexVec },
        );

        let results = result.records.map((r) => {
          const props = r.get('s').properties as Record<string, unknown>;
          return {
            id: props.id as string,
            source_type: 'symbol' as const,
            name: props.name as string,
            kind: props.kind as string,
            language: (props.language as string) ?? '',
            file_path: props.file_path as string,
            start_line: toNum(props.start_line),
            signature: (props.signature as string) ?? '',
            doc_comment: (props.doc_comment as string) ?? '',
            score: r.get('score') as number,
          };
        });

        if (options?.language) results = results.filter((r) => r.language === options.language);
        if (options?.file_path) results = results.filter((r) => includesCaseInsensitive(r.file_path, options.file_path!));
        if (options?.kind) results = results.filter((r) => r.kind === options.kind);

        return results.slice(0, limit);
      } finally {
        await session.close();
      }
    } catch (err) {
      console.error('[amp-code] Lexical vector search failed:', err instanceof Error ? err.message : err);
      return [];
    }
  }

  private async semanticVectorSearch(
    query: string,
    limit: number,
    asOf?: string,
  ): Promise<CodeSearchResult[]> {
    try {
      const queryEmbedding = await this.embedding.embed(query);
      const semanticLimit = Math.min(limit, 10);
      const candidateLimit = candidateLimitForTemporalFilter(semanticLimit, Boolean(asOf));
      const session = this.driver.session();
      try {
        // When as_of is provided, post-filter semantic nodes to those created before the cutoff
        const temporalFilter = asOf ? 'WHERE s.created_at <= $asOf' : '';
        const result = await session.run(
          `CALL db.index.vector.queryNodes('semantic_embedding', $limit, $embedding)
           YIELD node AS s, score
           ${temporalFilter}
           RETURN s, score`,
          { limit: neo4j.int(candidateLimit), embedding: queryEmbedding, ...(asOf ? { asOf } : {}) },
        );

        return result.records.map((r) => {
          const props = r.get('s').properties as Record<string, unknown>;
          return {
            id: props.id as string,
            source_type: 'semantic' as const,
            name: `[Semantic] ${(props.id as string).slice(0, 12)}`,
            kind: 'semantic',
            file_path: '',
            start_line: 0,
            signature: (props.content as string) ?? '',
            doc_comment: '',
            score: (r.get('score') as number) * 0.8, // Slightly discount semantics vs code matches
          };
        }).slice(0, semanticLimit);
      } finally {
        await session.close();
      }
    } catch (err) {
      console.error('[amp-code] Semantic vector search failed:', err instanceof Error ? err.message : err);
      return [];
    }
  }
}

// ─── Reciprocal Rank Fusion (generic) ─────────────────────────────────────────
// Same algorithm as @amp/retrieval's rrfFusion but operates on any
// { id: string; score: number } type. The retrieval version adds dynamic k,
// normalization, feedback boosts, and MMR — this is the lightweight path for
// direct amp_code_search calls.

function rrfFusion<T extends { id: string; score: number }>(
  rankedLists: T[][],
  limit: number,
  k = 60,
): T[] {
  const scores = new Map<string, { result: T; score: number }>();

  for (const list of rankedLists) {
    for (let rank = 0; rank < list.length; rank++) {
      const result = list[rank];
      const existing = scores.get(result.id);
      const rrfScore = 1 / (k + rank + 1);

      if (existing) {
        existing.score += rrfScore;
        if (result.score > existing.result.score) {
          existing.result = result;
        }
      } else {
        scores.set(result.id, { result, score: rrfScore });
      }
    }
  }

  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => ({ ...entry.result, score: entry.score }));
}

function toNum(val: unknown): number {
  if (typeof val === 'number') return val;
  if (val != null && typeof val === 'object' && 'toNumber' in val) {
    return (val as { toNumber: () => number }).toNumber();
  }
  return 0;
}

function candidateLimitForPostFilters(
  limit: number,
  options?: { language?: string; file_path?: string; kind?: string },
): number {
  if (!options?.language && !options?.file_path && !options?.kind) return limit;
  return boundedOverfetchLimit(limit);
}

function candidateLimitForTemporalFilter(limit: number, hasTemporalFilter: boolean): number {
  if (!hasTemporalFilter) return limit;
  return boundedOverfetchLimit(limit);
}

function boundedOverfetchLimit(limit: number): number {
  return Math.min(Math.max(limit * 5, 50), 200);
}

function includesCaseInsensitive(value: string, search: string): boolean {
  return value.toLowerCase().includes(search.toLowerCase());
}
