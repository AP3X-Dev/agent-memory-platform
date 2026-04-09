// packages/core/src/service.ts
import { createHash } from 'crypto';
import { nanoid } from 'nanoid';
import type {
  LoadScope,
  MemoryContext,
  EpisodeInput,
  EpisodicNode,
  SemanticNode,
  Signal,
  StreamSignal,
  EmbeddingProvider,
  AMPConfig,
  MemoryBlock,
} from './types.js';
import { rankMemories, budgetTokens, estimateTokens } from './ranking.js';
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

    // 3. Cache miss → query Neo4j
    const [byScope, byVector] = await Promise.all([
      this.neo4j.query.byScope({
        entities: scope.entities,
        tags: scope.tags,
        limit: 50,
      }),
      this._vectorSearch(scope.task, 20),
    ]);

    // Merge and de-duplicate by id
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

    // 5. Budget tokens (blocks are NOT subject to token budgeting)
    const withTokens = ranked.map((m) => ({
      ...m,
      tokens: estimateTokens(m.content),
    }));
    const budgeted = budgetTokens(withTokens, maxTokens);

    // 6. Render markdown with blocks prepended
    const blocksMarkdown = renderBlocksMarkdown(coreBlocks, workingBlocks);
    const archiveMarkdown = renderMarkdown(scope.task, budgeted);
    const markdown = blocksMarkdown
      ? blocksMarkdown + '\n' + archiveMarkdown
      : archiveMarkdown;

    const blockTokens = estimateTokens(blocksMarkdown);
    const archiveTokens = budgeted.reduce((sum, m) => sum + m.tokens, 0);
    const sources = budgeted.map((m) => m.id);

    const ctx: MemoryContext = {
      markdown,
      tokens: blockTokens + archiveTokens,
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
