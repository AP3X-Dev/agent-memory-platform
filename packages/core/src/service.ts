// packages/core/src/service.ts
import { createHash } from 'crypto';
import { nanoid } from 'nanoid';
import type {
  LoadScope,
  MemoryContext,
  EpisodeInput,
  EpisodicNode,
  SemanticNode,
  FactNode,
  TemporalOptions,
  Signal,
  StreamSignal,
  EmbeddingProvider,
  AMPConfig,
  MemoryBlock,
} from './types.js';
import { rankMemories, rankFacts, budgetTokens, estimateTokens } from './ranking.js';
import type { RedisBlockLayer, Neo4jBlockLayer } from './blocks.js';
import { MemoryBlockService } from './blocks.js';

// ─── Dependency interfaces (injected, not concrete imports) ──────────────────

export interface RedisLayer {
  cache: {
    get(scopeHash: string): Promise<MemoryContext | null>;
    set(scopeHash: string, ctx: MemoryContext, sources: string[], ttl?: number): Promise<void>;
    invalidateByNodeId(nodeId: string): Promise<number>;
  };
  embeddings: {
    get(content: string): Promise<number[] | null>;
    set(content: string, embedding: number[], ttl?: number): Promise<void>;
  };
  dedup: {
    isDuplicate(agentId: string, contentHash: string): Promise<boolean>;
    markSeen(agentId: string, contentHash: string, ttl?: number): Promise<void>;
    checkAndMark(agentId: string, contentHash: string, ttl?: number): Promise<boolean>;
  };
  signals: {
    publish(signal: StreamSignal): Promise<string>;
  };
  queue: {
    incrementScore(member: string, increment: number): Promise<number>;
  };
}

export interface FactLayer {
  getActive(entityName: string, options?: TemporalOptions): Promise<FactNode[]>;
}

export interface Neo4jLayer {
  episodic: {
    create(node: EpisodicNode): Promise<string>;
    linkToAgent(episodicId: string, agentId: string): Promise<void>;
    linkToEntity(episodicId: string, entityId: string): Promise<void>;
    linkToModel(episodicId: string, modelId: string): Promise<void>;
    linkSignal(episodicId: string, signal: Signal): Promise<void>;
  };
  query: {
    byScope(scope: { entities?: string[]; tags?: string[]; limit: number }): Promise<SemanticNode[]>;
    byVector(embedding: number[], limit: number): Promise<Array<SemanticNode & { score: number }>>;
  };
  fact?: FactLayer;
}

// ─── AMPService ──────────────────────────────────────────────────────────────

export interface BlocksLayer {
  listBlocks(scope: string, tier?: 'core' | 'working' | 'archive', sessionId?: string): Promise<MemoryBlock[]>;
}

export class AMPService {
  private blocks?: BlocksLayer;

  constructor(
    private redis: RedisLayer,
    private neo4j: Neo4jLayer,
    private embedding: EmbeddingProvider,
    private config: AMPConfig,
    blocks?: BlocksLayer,
  ) {
    this.blocks = blocks;
  }

  // ─── LOAD ──────────────────────────────────────────────────────────────────

  async load(scope: LoadScope): Promise<MemoryContext> {
    const scopeHash = hashScope(scope);
    const maxTokens = scope.max_tokens ?? 4096;

    // 1. Cache hit
    const cached = await this.redis.cache.get(scopeHash);
    if (cached) return cached;

    // 2. Fetch memory blocks (if blocks service available)
    let coreBlocks: MemoryBlock[] = [];
    let workingBlocks: MemoryBlock[] = [];
    const projectTag = scope.tags?.find((t) => t.startsWith('project:')) ?? scope.tags?.[0];

    if (this.blocks && projectTag) {
      const blockResults = await Promise.all([
        this.blocks.listBlocks(projectTag, 'core'),
        scope.session_id
          ? this.blocks.listBlocks(projectTag, 'working', scope.session_id)
          : Promise.resolve([]),
      ]);
      coreBlocks = blockResults[0].filter((b) => b.content.length > 0);
      workingBlocks = blockResults[1].filter((b) => b.content.length > 0);
    }

    // 3. Cache miss → query Neo4j (semantics + vector)
    const [byScope, byVector] = await Promise.all([
      this.neo4j.query.byScope({
        entities: scope.entities,
        tags: scope.tags,
        limit: 50,
      }),
      this._vectorSearch(scope.task, 20),
    ]);

    // 3b. Query facts if fact layer is available
    let facts: FactNode[] = [];
    if (this.neo4j.fact && scope.entities && scope.entities.length > 0) {
      const factResults = await Promise.all(
        scope.entities.map((e) => this.neo4j.fact!.getActive(e, scope.temporal)),
      );
      const seenFactIds = new Set<string>();
      for (const entityFacts of factResults) {
        for (const fact of entityFacts) {
          if (!seenFactIds.has(fact.id)) {
            seenFactIds.add(fact.id);
            facts.push(fact);
          }
        }
      }
      facts = rankFacts(facts);
    }

    // Merge and de-duplicate semantics by id
    const seen = new Set<string>();
    const merged: Array<SemanticNode & { relevanceScore?: number }> = [];
    for (const node of byScope) {
      if (!seen.has(node.id)) {
        seen.add(node.id);
        merged.push(node);
      }
    }
    for (const node of byVector) {
      if (!seen.has(node.id)) {
        seen.add(node.id);
        merged.push({ ...node, relevanceScore: node.score });
      }
    }

    // 4. Rank
    const ranked = rankMemories(merged);

    // 5. Budget tokens — reserve 20% for facts, remainder for semantics
    const factBudget = Math.floor(maxTokens * 0.2);
    const semanticBudget = maxTokens - factBudget;

    const withTokens = ranked.map((m) => ({
      ...m,
      tokens: estimateTokens(m.content),
    }));
    const budgeted = budgetTokens(withTokens, semanticBudget);

    // Budget facts: render each fact as a line, keep highest-ranked that fit
    const factsWithTokens = facts.map((f) => ({
      ...f,
      tokens: estimateTokens(`${f.subject} ${f.predicate} ${f.object}`),
    }));
    const budgetedFacts = budgetTokens(factsWithTokens, factBudget);

    // 6. Render markdown with blocks and budgeted facts prepended
    const blocksMarkdown = renderBlocksMarkdown(coreBlocks, workingBlocks);
    const factsMarkdown = renderFactsMarkdown(budgetedFacts, scope.temporal);
    const archiveMarkdown = renderMarkdown(scope.task, budgeted);

    const sections = [blocksMarkdown, factsMarkdown, archiveMarkdown]
      .filter((s) => s.length > 0);
    const markdown = sections.join('\n');

    const blockTokens = estimateTokens(blocksMarkdown);
    const factTokens = estimateTokens(factsMarkdown);
    const archiveTokens = budgeted.reduce((sum, m) => sum + m.tokens, 0);
    const sources = [
      ...budgetedFacts.map((f) => f.id),
      ...budgeted.map((m) => m.id),
    ];

    const ctx: MemoryContext = {
      markdown,
      tokens: blockTokens + factTokens + archiveTokens,
      sources,
      assembled_at: new Date().toISOString(),
    };

    // 7. Cache
    await this.redis.cache.set(
      scopeHash,
      ctx,
      sources,
      this.config.cache.contextTTL,
    );

    return ctx;
  }

  // ─── STORE ─────────────────────────────────────────────────────────────────

  async store(input: EpisodeInput): Promise<{ id: string; duplicate: boolean }> {
    // 1. Atomic dedup check-and-mark (prevents TOCTOU race between isDuplicate/markSeen)
    const contentHash = createHash('sha256').update(input.content).digest('hex');
    const isDup = await this.redis.dedup.checkAndMark(input.agent_id, contentHash);
    if (isDup) {
      return { id: '', duplicate: true };
    }

    // 2. Generate embedding with cache
    let embedding: number[] | undefined;
    const cachedEmb = await this.redis.embeddings.get(input.content);
    if (cachedEmb) {
      embedding = cachedEmb;
    } else {
      embedding = await this.embedding.embed(input.content);
      await this.redis.embeddings.set(
        input.content,
        embedding,
        this.config.cache.embeddingTTL,
      );
    }

    // 3. Create Episodic in Neo4j
    const id = nanoid();
    const node: EpisodicNode = {
      id,
      session_id: input.session_id,
      agent_id: input.agent_id,
      task: input.task,
      content: input.content,
      outcome: input.outcome,
      signals: input.signals,
      embedding,
      created_at: new Date().toISOString(),
    };
    await this.neo4j.episodic.create(node);

    // 4. Link relationships
    await this.neo4j.episodic.linkToAgent(id, input.agent_id);

    if (input.entities) {
      for (const entityId of input.entities) {
        await this.neo4j.episodic.linkToEntity(id, entityId);
      }
    }

    if (input.model_id) {
      await this.neo4j.episodic.linkToModel(id, input.model_id);
    }

    // 5. Publish signals and link them
    if (input.signals && input.signals.length > 0) {
      for (const signal of input.signals) {
        // Link in Neo4j
        await this.neo4j.episodic.linkSignal(id, signal);

        // Publish to stream
        const streamSignal: StreamSignal = {
          ...signal,
          source_session: input.session_id,
          agent_id: input.agent_id,
          timestamp: new Date().toISOString(),
        };
        await this.redis.signals.publish(streamSignal);

        // Invalidate caches for the signal target
        await this.redis.cache.invalidateByNodeId(signal.target_id);

        // Update consolidation queue
        await this.redis.queue.incrementScore(signal.target_id, 1);
      }
    }

    // 6. Dedup mark already done atomically in step 1 via checkAndMark

    return { id, duplicate: false };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async _vectorSearch(
    text: string,
    limit: number,
  ): Promise<Array<SemanticNode & { score: number }>> {
    try {
      const emb = await this._getEmbedding(text);
      return await this.neo4j.query.byVector(emb, limit);
    } catch {
      return [];
    }
  }

  private async _getEmbedding(text: string): Promise<number[]> {
    const cached = await this.redis.embeddings.get(text);
    if (cached) return cached;
    const emb = await this.embedding.embed(text);
    await this.redis.embeddings.set(text, emb, this.config.cache.embeddingTTL);
    return emb;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hashScope(scope: LoadScope): string {
  const canonical = JSON.stringify({
    task: scope.task,
    entities: (scope.entities ?? []).slice().sort(),
    tags: (scope.tags ?? []).slice().sort(),
    max_tokens: scope.max_tokens ?? 4096,
    temporal: scope.temporal ?? null,
  });
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

function renderBlocksMarkdown(coreBlocks: MemoryBlock[], workingBlocks: MemoryBlock[]): string {
  if (coreBlocks.length === 0 && workingBlocks.length === 0) return '';

  const lines: string[] = [];

  if (coreBlocks.length > 0) {
    lines.push('## Core Memory');
    lines.push('');
    for (const block of coreBlocks) {
      lines.push(`### ${block.name}`);
      lines.push(block.content);
      lines.push('');
    }
  }

  if (workingBlocks.length > 0) {
    lines.push('## Working Memory');
    lines.push('');
    for (const block of workingBlocks) {
      lines.push(`### ${block.name}`);
      lines.push(block.content);
      lines.push('');
    }
  }

  return lines.join('\n');
}

function renderFactsMarkdown(facts: FactNode[], temporal?: TemporalOptions): string {
  if (facts.length === 0) return '';

  const lines: string[] = [];
  const isEvolution = temporal?.time_mode === 'evolution';

  if (isEvolution) {
    lines.push('## Fact Timeline');
    lines.push('');
    for (const f of facts) {
      const status = f.status !== 'active' ? ` [${f.status}]` : '';
      const validRange = f.invalid_at
        ? `${f.valid_at} → ${f.invalid_at}`
        : `${f.valid_at} → present`;
      lines.push(`- **${f.subject}** ${f.predicate} **${f.object}**${status} (${validRange})`);
    }
  } else {
    lines.push('## Current Facts');
    lines.push('');
    for (const f of facts) {
      const since = f.valid_at.split('T')[0];
      const status = f.status === 'disputed' ? ' [disputed]' : '';
      lines.push(`- **${f.subject}** ${f.predicate} **${f.object}**${status} (confidence: ${f.confidence.toFixed(2)}, since: ${since})`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

function renderMarkdown(
  task: string,
  memories: Array<SemanticNode & { score: number }>,
): string {
  if (memories.length === 0) {
    return `# Memory Context\n\n_No relevant memories found for task: ${task}_\n`;
  }

  const lines: string[] = [
    `# Memory Context`,
    ``,
    `**Task:** ${task}`,
    ``,
  ];

  for (const m of memories) {
    lines.push(`## [${m.id}] (confidence: ${m.confidence.toFixed(2)}, score: ${m.score.toFixed(3)})`);
    if (m.tags.length > 0) {
      lines.push(`**Tags:** ${m.tags.join(', ')}`);
    }
    lines.push(``);
    lines.push(m.content);
    lines.push(``);
  }

  return lines.join('\n');
}
