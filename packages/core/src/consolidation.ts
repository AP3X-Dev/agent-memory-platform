// packages/core/src/consolidation.ts
import { nanoid } from 'nanoid';
import type {
  ConsolidationProposal,
  StreamSignal,
  SemanticNode,
  AMPConfig,
  FactNode,
} from './types.js';
import { SIGNAL_WEIGHTS } from './types.js';
import { extractFacts } from './extract.js';

// ─── Runtime validators ──────────────────────────────────────────────────────

const VALID_DECAY_CLASSES = new Set(['volatile', 'stable', 'permanent']);

/**
 * Validates that a Record<string, unknown> (e.g. from Redis) has all required
 * SemanticNode fields with correct types.  Returns the validated node or throws.
 */
function parseSemanticNode(raw: Record<string, unknown>, label: string): SemanticNode {
  if (typeof raw.id !== 'string' || raw.id === '') {
    throw new Error(`${label}: missing or invalid "id" (expected non-empty string)`);
  }
  if (typeof raw.content !== 'string') {
    throw new Error(`${label}: missing or invalid "content" (expected string)`);
  }
  if (typeof raw.confidence !== 'number' || !Number.isFinite(raw.confidence)) {
    throw new Error(`${label}: missing or invalid "confidence" (expected finite number)`);
  }
  if (typeof raw.signal_count !== 'number' || !Number.isFinite(raw.signal_count)) {
    throw new Error(`${label}: missing or invalid "signal_count" (expected finite number)`);
  }
  if (typeof raw.created_at !== 'string') {
    throw new Error(`${label}: missing or invalid "created_at" (expected string)`);
  }
  if (typeof raw.updated_at !== 'string') {
    throw new Error(`${label}: missing or invalid "updated_at" (expected string)`);
  }
  if (typeof raw.decay_class !== 'string' || !VALID_DECAY_CLASSES.has(raw.decay_class)) {
    throw new Error(`${label}: missing or invalid "decay_class" (expected 'volatile' | 'stable' | 'permanent')`);
  }
  if (!Array.isArray(raw.tags) || !raw.tags.every((t: unknown) => typeof t === 'string')) {
    throw new Error(`${label}: missing or invalid "tags" (expected string[])`);
  }

  return {
    id: raw.id,
    content: raw.content,
    confidence: raw.confidence,
    signal_count: raw.signal_count,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    decay_class: raw.decay_class as SemanticNode['decay_class'],
    tags: raw.tags as string[],
    ...(Array.isArray(raw.embedding) ? { embedding: raw.embedding as number[] } : {}),
  };
}

/**
 * Validates a partial SemanticNode record (the "after" side of a proposal).
 * Only present keys are type-checked; the result is Partial<SemanticNode>.
 */
function parsePartialSemanticNode(raw: Record<string, unknown>, label: string): Partial<SemanticNode> {
  const result: Partial<SemanticNode> = {};

  if ('id' in raw) {
    if (typeof raw.id !== 'string' || raw.id === '') throw new Error(`${label}: invalid "id"`);
    result.id = raw.id;
  }
  if ('content' in raw) {
    if (typeof raw.content !== 'string') throw new Error(`${label}: invalid "content"`);
    result.content = raw.content;
  }
  if ('confidence' in raw) {
    if (typeof raw.confidence !== 'number' || !Number.isFinite(raw.confidence))
      throw new Error(`${label}: invalid "confidence"`);
    result.confidence = raw.confidence;
  }
  if ('signal_count' in raw) {
    if (typeof raw.signal_count !== 'number' || !Number.isFinite(raw.signal_count))
      throw new Error(`${label}: invalid "signal_count"`);
    result.signal_count = raw.signal_count;
  }
  if ('created_at' in raw) {
    if (typeof raw.created_at !== 'string') throw new Error(`${label}: invalid "created_at"`);
    result.created_at = raw.created_at;
  }
  if ('updated_at' in raw) {
    if (typeof raw.updated_at !== 'string') throw new Error(`${label}: invalid "updated_at"`);
    result.updated_at = raw.updated_at;
  }
  if ('decay_class' in raw) {
    if (typeof raw.decay_class !== 'string' || !VALID_DECAY_CLASSES.has(raw.decay_class))
      throw new Error(`${label}: invalid "decay_class"`);
    result.decay_class = raw.decay_class as SemanticNode['decay_class'];
  }
  if ('tags' in raw) {
    if (!Array.isArray(raw.tags) || !raw.tags.every((t: unknown) => typeof t === 'string'))
      throw new Error(`${label}: invalid "tags"`);
    result.tags = raw.tags as string[];
  }

  return result;
}

// ─── Dependency interfaces ────────────────────────────────────────────────────

export interface ConsolidationRedisLayer {
  lock: {
    acquire(scope: string, holder: string, ttlSeconds?: number): Promise<boolean>;
    release(scope: string, holder: string): Promise<boolean>;
  };
  signals: {
    consume(
      group: string,
      consumer: string,
      count: number,
      startId?: string,
    ): Promise<StreamSignal[]>;
  };
  queue: {
    popHighest(): Promise<{ member: string; score: number } | null>;
  };
  proposals: {
    save(proposal: ConsolidationProposal): Promise<void>;
    get(id: string): Promise<ConsolidationProposal | null>;
    listPending(): Promise<string[]>;
    remove(id: string): Promise<void>;
  };
  cache: {
    invalidateByNodeId(nodeId: string): Promise<number>;
  };
}

export interface ConsolidationFactLayer {
  create(fact: import('./types.js').FactNode): Promise<string>;
  findBySubjectPredicate(subject: string, predicate: string): Promise<import('./types.js').FactNode[]>;
  invalidate(id: string, invalidAt: string, supersededById?: string): Promise<void>;
  dispute(id: string): Promise<void>;
}

export interface ConsolidationNeo4jLayer {
  semantic: {
    getById(id: string): Promise<SemanticNode | null>;
    updateConfidence(id: string, confidence: number): Promise<void>;
    supersede(oldId: string, newNode: SemanticNode): Promise<string>;
  };
  fact?: ConsolidationFactLayer;
}

// ─── Result types ─────────────────────────────────────────────────────────────

export interface RunResult {
  skipped: boolean;
  reason?: string;
  proposals: ConsolidationProposal[];
  applied: string[];
}

// ─── ConsolidationEngine ──────────────────────────────────────────────────────

export class ConsolidationEngine {
  private readonly lockHolder: string;

  constructor(
    private redis: ConsolidationRedisLayer,
    private neo4j: ConsolidationNeo4jLayer,
    private config: AMPConfig,
  ) {
    this.lockHolder = `consolidation-engine-${nanoid(8)}`;
  }

  // ─── run ──────────────────────────────────────────────────────────────────

  async run(scope: string): Promise<RunResult> {
    // 1. Acquire distributed lock
    const acquired = await this.redis.lock.acquire(scope, this.lockHolder);
    if (!acquired) {
      return { skipped: true, reason: 'lock_held', proposals: [], applied: [] };
    }

    try {
      // 2. Consume signals from stream
      const signals = await this.redis.signals.consume(
        'consolidation',
        this.lockHolder,
        100,
      );

      // 3. Pop queue entries (up to 20)
      const queueEntries: Array<{ member: string; score: number }> = [];
      for (let i = 0; i < 20; i++) {
        const entry = await this.redis.queue.popHighest();
        if (!entry) break;
        queueEntries.push(entry);
      }

      // 4. Generate proposals from signal clusters
      const proposals = await this._generateProposals(scope, signals, queueEntries);

      // 5. Apply or store for review
      const applied: string[] = [];
      if (this.config.consolidation.autoApply) {
        for (const proposal of proposals) {
          const ok = await this._applyProposal(proposal);
          if (ok) applied.push(proposal.id);
        }
      } else {
        // Store for manual review
        for (const proposal of proposals) {
          await this.redis.proposals.save(proposal);
        }
      }

      return { skipped: false, proposals, applied };
    } finally {
      await this.redis.lock.release(scope, this.lockHolder);
    }
  }

  // ─── review ───────────────────────────────────────────────────────────────

  async review(proposalId: string): Promise<Record<string, unknown>> {
    const proposal = await this.redis.proposals.get(proposalId);
    if (!proposal) throw new Error(`Proposal ${proposalId} not found`);
    return proposal as unknown as Record<string, unknown>;
  }

  // ─── apply ───────────────────────────────────────────────────────────────

  async apply(proposalId: string, decision: 'approve' | 'reject'): Promise<{ applied: boolean }> {
    const proposal = await this.redis.proposals.get(proposalId);
    if (!proposal) throw new Error(`Proposal ${proposalId} not found`);

    if (decision === 'reject') {
      await this.redis.proposals.remove(proposalId);
      return { applied: false };
    }

    // approve: execute the proposal
    const ok = await this._applyProposal(proposal);
    await this.redis.proposals.remove(proposalId);
    return { applied: ok };
  }

  // ─── reviewProposal (deprecated — use review + apply) ────────────────────

  async reviewProposal(id: string, decision: 'approve' | 'reject'): Promise<void> {
    const result = await this.apply(id, decision);
    if (decision === 'approve' && !result.applied) {
      throw new Error(`Failed to apply proposal ${id}`);
    }
  }

  // ─── status ───────────────────────────────────────────────────────────────

  async status(): Promise<{ pending: string[] }> {
    const pending = await this.redis.proposals.listPending();
    return { pending };
  }

  // ─── Private: generate proposals ─────────────────────────────────────────

  private async _generateProposals(
    scope: string,
    signals: StreamSignal[],
    queueEntries: Array<{ member: string; score: number }>,
  ): Promise<ConsolidationProposal[]> {
    const proposals: ConsolidationProposal[] = [];

    // Cluster signals by target_id
    const clusters = new Map<string, { signals: StreamSignal[]; totalWeight: number }>();
    for (const signal of signals) {
      const existing = clusters.get(signal.target_id) ?? { signals: [], totalWeight: 0 };
      existing.signals.push(signal);
      existing.totalWeight += SIGNAL_WEIGHTS[signal.type] ?? 1;
      clusters.set(signal.target_id, existing);
    }

    // Also factor in queue entries (high score = needs consolidation)
    for (const entry of queueEntries) {
      const existing = clusters.get(entry.member);
      if (existing) {
        // Already have signal data — boost score
        existing.totalWeight += entry.score;
      } else {
        // Queue-only entry: create a decay proposal if score is high enough
        if (entry.score >= this.config.consolidation.signalThreshold) {
          const node = await this.neo4j.semantic.getById(entry.member);
          if (node) {
            proposals.push(buildDecayProposal(scope, node, entry.score));
          }
        }
      }
    }

    // Generate proposals from signal clusters that meet threshold
    for (const [targetId, cluster] of clusters.entries()) {
      if (cluster.totalWeight < this.config.consolidation.signalThreshold) continue;

      const node = await this.neo4j.semantic.getById(targetId);
      if (!node) continue;

      const contradictions = cluster.signals.filter((s) => s.type === 'contradiction');
      const corrections = cluster.signals.filter((s) => s.type === 'correction');

      if (contradictions.length > 0 || corrections.length > 0) {
        // Propose supersede with adjusted confidence
        const newConfidence = Math.max(0, node.confidence - 0.1 * (corrections.length + contradictions.length));
        proposals.push(buildSupersedePropsal(scope, node, newConfidence, cluster.totalWeight));
      } else {
        // Reinforce — the knowledge held true, so RAISE confidence (gently, with
        // diminishing returns toward 1.0). Previously this incorrectly called
        // buildDecayProposal, which DECAYED confidence by 5% — so repeatedly-confirmed
        // (i.e. most-validated) memories lost confidence every cycle, backwards for a
        // memory layer.
        proposals.push(buildReinforceProposal(scope, node, cluster.totalWeight));
      }
    }

    return proposals;
  }

  // ─── Private: apply proposal ──────────────────────────────────────────────

  private async _applyProposal(proposal: ConsolidationProposal): Promise<boolean> {
    try {
      if (proposal.type === 'supersede') {
        const before = parseSemanticNode(proposal.before, 'proposal.before');
        const after = parsePartialSemanticNode(proposal.after, 'proposal.after');

        const newNode: SemanticNode = {
          id: nanoid(),
          content: after.content ?? before.content,
          confidence: after.confidence ?? before.confidence,
          signal_count: (before.signal_count ?? 0) + 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          decay_class: after.decay_class ?? before.decay_class,
          tags: after.tags ?? before.tags ?? [],
        };

        await this.neo4j.semantic.supersede(before.id, newNode);
        await this.redis.cache.invalidateByNodeId(before.id);
        await this.redis.cache.invalidateByNodeId(newNode.id);

        // Fact extraction: optionally extract facts from superseded content
        await this._extractAndStoreFacts(newNode.content, newNode.id, proposal.affected_ids);

        // Dispute related active facts when this is a contradiction-driven supersede
        if (this.neo4j.fact) {
          const lowerConfidence = (after.confidence ?? before.confidence) < before.confidence;
          if (lowerConfidence) {
            await this._disputeRelatedFacts(before.content);
          }
        }
      } else if (proposal.type === 'decay' || proposal.type === 'reinforce') {
        // Both are confidence adjustments applied via updateConfidence; they differ
        // only in direction (decay lowers, reinforce raises).
        const targetId = proposal.affected_ids[0];
        if (targetId) {
          const after = proposal.after as { confidence?: number };
          if (typeof after.confidence === 'number') {
            await this.neo4j.semantic.updateConfidence(targetId, after.confidence);
            await this.redis.cache.invalidateByNodeId(targetId);
          }
        }
      }
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[consolidation] _applyProposal failed for proposal ${proposal.id} (type=${proposal.type}): ${message}`,
      );
      return false;
    }
  }

  // ─── Private: fact extraction ──────────────────────────────────────────────

  private async _extractAndStoreFacts(
    content: string,
    semanticId: string,
    sourceEpisodeIds: string[] = [],
  ): Promise<void> {
    const factLayer = this.neo4j.fact;
    const apiKey = this.config.embedding.apiKey;
    if (!factLayer || !apiKey) return;

    try {
      const inputs = await extractFacts(content, apiKey, this.config.models?.extraction);
      if (inputs.length === 0) return;

      const now = new Date().toISOString();
      for (const input of inputs) {
        // Use proposal's affected_ids as source episodes for traceability
        const episodeIds = sourceEpisodeIds.length > 0
          ? sourceEpisodeIds
          : input.source_episode_ids;

        // Check for existing active fact with same subject+predicate
        const existing = await factLayer.findBySubjectPredicate(
          input.subject,
          input.predicate,
        );

        if (existing.length > 0) {
          const current = existing[0]!;
          if (current.object === input.object) {
            // Same fact — skip (reinforce by doing nothing; confidence is maintained)
            continue;
          }
          // Different object — invalidate old, create new with supersession
          const newFactId = `fact-${nanoid(12)}`;
          const newFact: FactNode = {
            id: newFactId,
            subject: input.subject,
            predicate: input.predicate,
            object: input.object,
            entity_id: null,
            source_episode_ids: episodeIds,
            valid_at: now,
            invalid_at: null,
            confidence: input.confidence ?? 0.5,
            status: 'active',
            inference_type: 'inductive',
            supersedes_fact_id: current.id,
            scope: input.scope ?? 'project',
            tags: input.tags ?? [],
            created_at: now,
            updated_at: now,
          };
          await factLayer.invalidate(current.id, now, newFactId);
          await factLayer.create(newFact);
        } else {
          // New fact
          const newFact: FactNode = {
            id: `fact-${nanoid(12)}`,
            subject: input.subject,
            predicate: input.predicate,
            object: input.object,
            entity_id: null,
            source_episode_ids: episodeIds,
            valid_at: now,
            invalid_at: null,
            confidence: input.confidence ?? 0.5,
            status: 'tentative',
            inference_type: 'inductive',
            supersedes_fact_id: null,
            scope: input.scope ?? 'project',
            tags: input.tags ?? [],
            created_at: now,
            updated_at: now,
          };
          await factLayer.create(newFact);
        }
      }
    } catch (err) {
      // Non-critical: fact extraction failure should not block consolidation
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[consolidation] fact extraction failed (non-critical): ${message}`);
    }
  }

  private async _disputeRelatedFacts(semanticContent: string): Promise<void> {
    const factLayer = this.neo4j.fact;
    const apiKey = this.config.embedding.apiKey;
    if (!factLayer || !apiKey) return;

    try {
      // Extract facts from the old (now-contradicted) content to find what to dispute
      const oldFacts = await extractFacts(semanticContent, apiKey, this.config.models?.extraction);
      for (const oldFact of oldFacts) {
        const matching = await factLayer.findBySubjectPredicate(
          oldFact.subject,
          oldFact.predicate,
        );
        for (const active of matching) {
          if (active.object === oldFact.object) {
            await factLayer.dispute(active.id);
          }
        }
      }
    } catch (err: unknown) {
      // Non-critical: dispute failure should not block consolidation
    }
  }
}

// ─── Proposal builders ────────────────────────────────────────────────────────

function buildSupersedePropsal(
  scope: string,
  node: SemanticNode,
  newConfidence: number,
  score: number,
): ConsolidationProposal {
  return {
    id: nanoid(),
    type: 'supersede',
    scope,
    affected_ids: [node.id],
    before: { ...node } as Record<string, unknown>,
    after: {
      ...node,
      confidence: newConfidence,
      updated_at: new Date().toISOString(),
    } as Record<string, unknown>,
    score,
    created_at: new Date().toISOString(),
  };
}

function buildDecayProposal(
  scope: string,
  node: SemanticNode,
  score: number,
): ConsolidationProposal {
  const decayedConfidence = Math.max(0, node.confidence * 0.95);
  return {
    id: nanoid(),
    type: 'decay',
    scope,
    affected_ids: [node.id],
    before: { ...node } as Record<string, unknown>,
    after: {
      confidence: decayedConfidence,
    } as Record<string, unknown>,
    score,
    created_at: new Date().toISOString(),
  };
}

// Gentle confidence gain on reinforcement: move a small fraction toward 1.0, so
// confidence rises with diminishing returns and is bounded at 1.0 (can never exceed it).
const REINFORCE_FACTOR = 0.05;

function buildReinforceProposal(
  scope: string,
  node: SemanticNode,
  score: number,
): ConsolidationProposal {
  const reinforcedConfidence = Math.min(1, node.confidence + (1 - node.confidence) * REINFORCE_FACTOR);
  return {
    id: nanoid(),
    type: 'reinforce',
    scope,
    affected_ids: [node.id],
    before: { ...node } as Record<string, unknown>,
    after: {
      confidence: reinforcedConfidence,
    } as Record<string, unknown>,
    score,
    created_at: new Date().toISOString(),
  };
}
