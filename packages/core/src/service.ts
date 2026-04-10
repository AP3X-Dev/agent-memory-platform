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
import { extractFacts, isTransientError } from './extract.js';

// ─── Dependency interfaces (injected, not concrete imports) ──────────────────

export interface RedisLayer {
  cache: {
    get(scopeHash: string): Promise<MemoryContext | null>;
    set(scopeHash: string, ctx: MemoryContext, sources: string[], ttl?: number, scopeTags?: string[]): Promise<void>;
    invalidateByScope(scope: string): Promise<number>;
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
  create(fact: FactNode): Promise<string>;
  findBySubjectPredicate(subject: string, predicate: string): Promise<FactNode[]>;
  invalidate(id: string, invalidAt: string, supersededById?: string): Promise<void>;
  /** Link two co-extracted facts from the same episode (optional — degrades gracefully) */
  linkCoExtracted?(factId1: string, factId2: string, episodeId: string): Promise<void>;
  /** Update confidence score of a fact (optional — used by staleness detection) */
  updateConfidence?(id: string, confidence: number): Promise<void>;
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
    /** Graph-structural retrieval: expand from seed entities via ABOUT and SAME_EPISODE edges (optional) */
    expandByGraph?(entityNames: string[], depth?: number, maxPerHop?: number, asOf?: string): Promise<SemanticNode[]>;
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
    // Budget: core=15%, working=10%, facts=15%, archive=60% of max_tokens
    const CORE_BUDGET_RATIO = 0.15;
    const WORKING_BUDGET_RATIO = 0.10;
    const FACT_BUDGET_RATIO = 0.15;

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

      // Truncate blocks that exceed their tier budget
      const coreBudget = Math.floor(maxTokens * CORE_BUDGET_RATIO);
      const workingBudget = Math.floor(maxTokens * WORKING_BUDGET_RATIO);
      coreBlocks = truncateBlocksToTokenBudget(coreBlocks, coreBudget);
      workingBlocks = truncateBlocksToTokenBudget(workingBlocks, workingBudget);
    }

    // 3. Cache miss → query Neo4j (semantics + vector)
    // Pass asOf from temporal options so semantic queries filter inactive ABOUT edges consistently
    const asOf = scope.temporal?.as_of;
    const [byScope, byVector] = await Promise.all([
      this.neo4j.query.byScope({
        entities: scope.entities,
        tags: scope.tags,
        limit: 50,
        asOf,
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

    // 3c. Graph expansion — pull in structurally connected knowledge
    if (merged.length > 0 && this.neo4j.query.expandByGraph) {
      const seedEntities = extractEntityNames(merged);
      if (seedEntities.length > 0) {
        try {
          const expanded = await this.neo4j.query.expandByGraph(seedEntities, 1, 5, asOf);
          for (const node of expanded) {
            if (!seen.has(node.id)) {
              seen.add(node.id);
              merged.push({ ...node, relevanceScore: 0.3 });
            }
          }
        } catch {
          // Graph expansion is best-effort — don't fail the load
        }
      }
    }

    // 4. Rank
    const ranked = rankMemories(merged);

    // 5. Budget tokens — per-tier allocation
    const factBudget = Math.floor(maxTokens * FACT_BUDGET_RATIO);
    const blockTokensUsed = estimateTokens(renderBlocksMarkdown(coreBlocks, workingBlocks));
    const semanticBudget = maxTokens - factBudget - blockTokensUsed;

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

    // 7. Cache (include scope tags for block-mutation invalidation)
    await this.redis.cache.set(
      scopeHash,
      ctx,
      sources,
      this.config.cache.contextTTL,
      scope.tags,
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

    // 7. Real-time fact extraction — fire-and-forget so store() returns immediately.
    // The episode is already persisted; fact extraction is a background enhancement.
    const factLayer = this.neo4j.fact;
    if (factLayer && this.config.embedding.apiKey) {
      const apiKey = this.config.embedding.apiKey;
      const episodeId = id;
      // Detach from the request path — caller gets response without waiting for extraction.
      // _extractFactsBackground handles its own retries and error logging internally.
      void this._extractFactsBackground(factLayer, apiKey, input.content, episodeId);
    }

    return { id, duplicate: false };
  }

  /**
   * Background fact extraction and auto-invalidation with retry.
   * Runs after store() has already returned the episode ID to the caller.
   * Retries up to 2 times with exponential backoff on transient errors
   * (network, rate limit). Non-transient errors (parse, validation) are not retried.
   */
  private async _extractFactsBackground(
    factLayer: FactLayer,
    apiKey: string,
    content: string,
    episodeId: string,
  ): Promise<void> {
    const MAX_RETRIES = 2;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const factInputs = await extractFacts(content, apiKey);
        const now = new Date().toISOString();
        const createdFactIds: string[] = [];

        for (const fi of factInputs) {
          // Normalize predicate before comparison
          const originalPredicate = fi.predicate;
          const normalizedPredicate = normalizePredicate(fi.predicate);

          // Check for existing active fact with same subject + normalized predicate
          const existing = await factLayer.findBySubjectPredicate(fi.subject, normalizedPredicate);
          const conflicting = existing.find(f => f.object !== fi.object);
          const reinforcing = existing.find(f => f.object === fi.object);

          if (reinforcing) {
            // Same fact already exists — skip (consolidation can boost confidence later)
            continue;
          }

          const newFactId = `fact-${nanoid(12)}`;
          const newFact: FactNode = {
            id: newFactId,
            subject: fi.subject,
            predicate: normalizedPredicate,
            object: fi.object,
            // Preserve original predicate when normalization changed it
            ...(originalPredicate !== normalizedPredicate ? { original_predicate: originalPredicate } : {}),
            entity_id: null,
            source_episode_ids: [episodeId],
            valid_at: now,
            invalid_at: null,
            confidence: fi.confidence ?? 0.5,
            status: 'active',
            supersedes_fact_id: conflicting?.id ?? null,
            scope: fi.scope ?? 'project',
            tags: fi.tags ?? [],
            created_at: now,
            updated_at: now,
          };

          // Auto-invalidate conflicting fact before creating replacement
          if (conflicting) {
            await factLayer.invalidate(conflicting.id, now, newFactId);
          }

          await factLayer.create(newFact);
          createdFactIds.push(newFactId);
        }

        // Feature 1: Link co-extracted facts with SAME_EPISODE edges
        if (createdFactIds.length > 1 && factLayer.linkCoExtracted) {
          for (let i = 0; i < createdFactIds.length; i++) {
            for (let j = i + 1; j < createdFactIds.length; j++) {
              await factLayer.linkCoExtracted(createdFactIds[i]!, createdFactIds[j]!, episodeId);
            }
          }
        }

        // Feature 3: Staleness detection for unmentioned facts
        if (factLayer.updateConfidence && factInputs.length > 0) {
          const mentionedEntities = new Set(factInputs.map(f => f.subject));
          for (const entityName of mentionedEntities) {
            const factsAboutEntity = factInputs.filter(f => f.subject === entityName);
            // Only apply staleness decay when the episode had thorough coverage
            // (at least 2 facts extracted about the entity)
            if (factsAboutEntity.length < 2) continue;

            const mentionedPredicates = new Set(
              factsAboutEntity.map(f => normalizePredicate(f.predicate)),
            );

            // Get all active facts for this entity
            const activeFacts = await factLayer.getActive(entityName);

            for (const fact of activeFacts) {
              const normalizedPred = normalizePredicate(fact.predicate);
              // Facts with predicates NOT mentioned in this episode — potential staleness
              if (!mentionedPredicates.has(normalizedPred) && fact.confidence > 0.1) {
                const newConfidence = Math.max(0.1, fact.confidence * 0.9); // 10% decay
                await factLayer.updateConfidence!(fact.id, newConfidence);
              }
            }
          }
        }

        return; // Success — exit retry loop
      } catch (err) {
        if (attempt < MAX_RETRIES && isTransientError(err)) {
          const delay = Math.pow(3, attempt) * 1000; // 1s, 3s
          console.warn(`[amp-store] Fact extraction attempt ${attempt + 1} failed, retrying in ${delay}ms:`, err instanceof Error ? err.message : err);
          await new Promise(r => setTimeout(r, delay));
        } else {
          console.error('[amp-store] Fact extraction failed after retries (non-fatal):', err instanceof Error ? err.message : err);
          return; // Give up — episode is already persisted
        }
      }
    }
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

// ─── Predicate normalization ────────────────────────────────────────────────
// Maps synonym predicates to canonical forms so "uses", "depends on", "relies on"
// all compare as the same predicate. Prevents false-negative conflict detection.

const PREDICATE_SYNONYMS: Record<string, string> = {
  // uses / depends-on family
  'uses': 'uses',
  'depends_on': 'uses',
  'depends on': 'uses',
  'relies_on': 'uses',
  'relies on': 'uses',
  'requires': 'uses',
  'built_with': 'uses',
  'built with': 'uses',
  'powered_by': 'uses',
  'powered by': 'uses',
  'utilizes': 'uses',
  // prefers family
  'prefers': 'prefers',
  'favors': 'prefers',
  'defaults_to': 'prefers',
  'defaults to': 'prefers',
  'chooses': 'prefers',
  // located-at family
  'located_at': 'located_at',
  'located at': 'located_at',
  'deployed_at': 'located_at',
  'deployed at': 'located_at',
  'deployed_to': 'located_at',
  'deployed to': 'located_at',
  'hosted_on': 'located_at',
  'hosted on': 'located_at',
  'runs_on': 'located_at',
  'runs on': 'located_at',
  // implements family
  'implements': 'implements',
  'provides': 'implements',
  'exposes': 'implements',
  'offers': 'implements',
  // owns / maintains family
  'owns': 'owns',
  'maintains': 'owns',
  'manages': 'owns',
  'responsible_for': 'owns',
  'responsible for': 'owns',
  // is / identity family
  'is': 'is',
  'is_a': 'is',
  'is a': 'is',
  'type_is': 'is',
  // version family
  'version_is': 'version_is',
  'version is': 'version_is',
  'at_version': 'version_is',
  'at version': 'version_is',
};

export function normalizePredicate(predicate: string): string {
  const lower = predicate.toLowerCase().trim();
  const canonical = PREDICATE_SYNONYMS[lower] ?? lower;
  if (canonical !== lower) {
    console.debug(`[predicate-norm] "${predicate}" → "${canonical}"`);
  }
  return canonical;
}

/**
 * Returns a copy of the current predicate synonym map.
 * Useful for debugging and inspection via amp_query.
 */
export function getPredicateSynonyms(): Record<string, string> {
  return { ...PREDICATE_SYNONYMS };
}

/**
 * Extract entity names referenced in semantic node content or tags.
 * Uses simple heuristic: looks for **bold** terms and known entity patterns.
 */
function extractEntityNames(nodes: Array<SemanticNode & { relevanceScore?: number }>): string[] {
  const names = new Set<string>();
  for (const node of nodes) {
    // Extract from tags that look like entity references (not project: prefixed)
    for (const tag of node.tags) {
      if (!tag.startsWith('project:') && !tag.includes(' ')) {
        names.add(tag);
      }
    }
    // Extract bold terms from content (common pattern: **entity-name**)
    const boldMatches = node.content.matchAll(/\*\*([^*]+)\*\*/g);
    for (const match of boldMatches) {
      const term = match[1]!.trim();
      if (term.length > 1 && term.length < 60 && !term.includes('\n')) {
        names.add(term);
      }
    }
  }
  return Array.from(names);
}

function truncateBlocksToTokenBudget(blocks: MemoryBlock[], budget: number): MemoryBlock[] {
  const result: MemoryBlock[] = [];
  let tokensUsed = 0;

  for (const block of blocks) {
    const blockTokens = estimateTokens(block.content);
    if (tokensUsed + blockTokens <= budget) {
      result.push(block);
      tokensUsed += blockTokens;
    } else {
      // Truncate the block content to fit remaining budget
      const remaining = budget - tokensUsed;
      if (remaining > 50) { // Only include if there's meaningful space
        const charLimit = remaining * 4; // ~4 chars per token
        result.push({
          ...block,
          content: block.content.slice(0, charLimit) + '\n[truncated]',
        });
      }
      break; // Budget exhausted
    }
  }

  return result;
}
