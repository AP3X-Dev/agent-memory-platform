// packages/redis/src/proposals.ts
import type { Redis } from 'ioredis';
import type { ConsolidationProposal } from '@memberry/core';

const DEFAULT_TTL = 604800; // 7 days
const PENDING_SET = 'amp:proposals:pending';

function proposalKey(id: string): string {
  return `amp:proposals:${id}`;
}

export class ProposalStore {
  constructor(private redis: Redis) {}

  async save(proposal: ConsolidationProposal): Promise<void> {
    const key = proposalKey(proposal.id);
    const pipeline = this.redis.pipeline();
    pipeline.setex(key, DEFAULT_TTL, JSON.stringify(proposal));
    pipeline.sadd(PENDING_SET, proposal.id);
    await pipeline.exec();
  }

  async get(id: string): Promise<ConsolidationProposal | null> {
    const raw = await this.redis.get(proposalKey(id));
    if (!raw) return null;
    return JSON.parse(raw) as ConsolidationProposal;
  }

  async listPending(): Promise<string[]> {
    return this.redis.smembers(PENDING_SET);
  }

  async remove(id: string): Promise<void> {
    const pipeline = this.redis.pipeline();
    pipeline.del(proposalKey(id));
    pipeline.srem(PENDING_SET, id);
    await pipeline.exec();
  }
}
