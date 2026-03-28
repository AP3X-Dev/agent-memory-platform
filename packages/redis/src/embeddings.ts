// packages/redis/src/embeddings.ts
import { createHash } from 'crypto';
import type { Redis } from 'ioredis';

const DEFAULT_TTL = 86400; // 24 hours

function contentKey(content: string): string {
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);
  return `amp:emb:${hash}`;
}

export class EmbeddingCache {
  constructor(private redis: Redis) {}

  async get(content: string): Promise<number[] | null> {
    const buf = await this.redis.getBuffer(contentKey(content));
    if (!buf) return null;
    const floats = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    return Array.from(floats);
  }

  async set(content: string, embedding: number[], ttl: number = DEFAULT_TTL): Promise<void> {
    const float32 = new Float32Array(embedding);
    const buf = Buffer.from(float32.buffer);
    await this.redis.setex(contentKey(content), ttl, buf);
  }
}
