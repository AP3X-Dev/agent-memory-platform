// packages/core/src/consolidation.ts
import { nanoid } from 'nanoid';
import type {
  ConsolidationProposal,
  StreamSignal,
  SemanticNode,
  AMPConfig,
} from './types.js';
import { SIGNAL_WEIGHTS } from './types.js';

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

export interface ConsolidationNeo4jLayer {
  semantic: {
    getById(id: string): Promise<SemanticNode | null>;
    updateConfidence(id: string, confidence: number): Promise<void>;
    supersede(oldId: string, newNode: SemanticNode): Promise<string>;
  };
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

  // ─── reviewProposal ───────────────────────────────────────────────────────

  async reviewProposal(id: string, decision: 'approve' | 'reject'): Promise<void> {
    const proposal = await this.redis.proposals.get(id);
    if (!proposal) throw new Error(`Proposal ${id} not found`);

    if (decision === 'reject') {
      await this.redis.proposals.remove(id);
      return;
    }

    // approve: execute the proposal
    await this._applyProposal(proposal);
    await this.redis.proposals.remove(id);
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
        const newConfidence = Math.min(1.0, node.confidence + 0.1 * corrections.length);
        proposals.push(buildSupersedePropsal(scope, node, newConfidence, cluster.totalWeight));
      } else {
        // Reinforce — decay proposal: bump confidence gently
        proposals.push(buildDecayProposal(scope, node, cluster.totalWeight));
      }
    }

    return proposals;
  }

  // ─── Private: apply proposal ──────────────────────────────────────────────

  private async _applyProposal(proposal: ConsolidationProposal): Promise<boolean> {
    try {
      if (proposal.type === 'supersede') {
        const after = proposal.after as Partial<SemanticNode>;
        const before = proposal.before as SemanticNode;

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
      } else if (proposal.type === 'decay') {
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
    } catch {
      return false;
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
