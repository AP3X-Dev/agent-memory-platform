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
    // Copy to aligned buffer — ioredis may return buffers with non-4-byte-aligned offsets
    const aligned = new Uint8Array(buf.byteLength);
    aligned.set(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
    const floats = new Float32Array(aligned.buffer);
    return Array.from(floats);
  }

  async set(content: string, embedding: number[], ttl: number = DEFAULT_TTL): Promise<void> {
    const float32 = new Float32Array(embedding);
    const buf = Buffer.from(float32.buffer);
    await this.redis.setex(contentKey(content), ttl, buf);
  }
}
