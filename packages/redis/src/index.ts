// packages/redis/src/index.ts
export { createRedisClient, healthCheck } from './client.js';
export type { HealthResult } from './client.js';
export { ContextCache } from './cache.js';
export { SignalStream, EpisodicBuffer } from './streams.js';
export type { BufferEvent } from './streams.js';
export { EmbeddingCache } from './embeddings.js';
export { ProposalStore } from './proposals.js';
export { SessionStore } from './session.js';
export { ConsolidationQueue } from './queue.js';
export { ExtractionQueue, EXTRACTION_STREAM, EXTRACTION_DLQ, EXTRACTION_GROUP } from './extraction.js';
export type { ExtractionJob, ExtractionJobEntry, ExtractionQueueStats } from './extraction.js';
export { DistributedLock } from './locks.js';
export { DedupChecker } from './dedup.js';
export { BlockStore } from './blocks.js';
