// packages/redis/src/session.ts
import type Redis from 'ioredis';
import type { SessionState } from '@amp/core';

const SESSION_TTL = 3600;

function keyFor(sessionId: string): string {
  return `amp:session:${sessionId}`;
}

export class SessionStore {
  constructor(private redis: Redis) {}

  async set(sessionId: string, state: SessionState): Promise<void> {
    const key = keyFor(sessionId);
    const pipeline = this.redis.pipeline();
    pipeline.hset(key, {
      agent_id: state.agent_id,
      task: state.task,
      stage: state.stage,
      loaded_memories: JSON.stringify(state.loaded_memories),
      pending_signals: JSON.stringify(state.pending_signals),
    });
    pipeline.expire(key, SESSION_TTL);
    await pipeline.exec();
  }

  async get(sessionId: string): Promise<SessionState | null> {
    const raw = await this.redis.hgetall(keyFor(sessionId));
    if (!raw || Object.keys(raw).length === 0) return null;
    return {
      agent_id: raw.agent_id,
      task: raw.task,
      stage: raw.stage,
      loaded_memories: JSON.parse(raw.loaded_memories ?? '[]'),
      pending_signals: JSON.parse(raw.pending_signals ?? '[]'),
    };
  }

  async delete(sessionId: string): Promise<void> {
    await this.redis.del(keyFor(sessionId));
  }

  async refresh(sessionId: string): Promise<void> {
    await this.redis.expire(keyFor(sessionId), SESSION_TTL);
  }
}
