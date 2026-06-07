// packages/core/src/blocks.ts
import { nanoid } from 'nanoid';
import type { MemoryBlock, MemoryTier } from './types.js';
import { DEFAULT_BLOCKS } from './types.js';

export const MAX_BLOCK_SIZE = 50_000;

// ─── Dependency interfaces (injected, not concrete imports) ──────────────────

export interface RedisBlockLayer {
  get(scope: string, name: string, sessionId?: string, tenantId?: string): Promise<MemoryBlock | null>;
  set(block: MemoryBlock, tenantId?: string): Promise<void>;
  list(scope: string, tier?: MemoryTier, sessionId?: string, tenantId?: string): Promise<MemoryBlock[]>;
  delete(scope: string, name: string, sessionId?: string, tenantId?: string): Promise<void>;
}

export interface Neo4jBlockLayer {
  save(block: MemoryBlock, tenantId?: string): Promise<void>;
  get(scope: string, name: string, sessionId?: string, tenantId?: string): Promise<MemoryBlock | null>;
  list(scope: string, tier?: MemoryTier, sessionId?: string, tenantId?: string): Promise<MemoryBlock[]>;
  delete(scope: string, name: string, sessionId?: string, tenantId?: string): Promise<void>;
}

export interface CacheInvalidator {
  invalidateByScope(scope: string): Promise<void>;
}

// ─── MemoryBlockService ─────────────────────────────────────────────────────

export class MemoryBlockService {
  private cacheInvalidator?: CacheInvalidator;

  constructor(
    private redisBlocks: RedisBlockLayer,
    private neo4jBlocks: Neo4jBlockLayer,
    cacheInvalidator?: CacheInvalidator,
    private readonlyMode = false,
  ) {
    this.cacheInvalidator = cacheInvalidator;
  }

  /** Reject mutations when the deployment is read-only. */
  private _assertWritable(): void {
    if (this.readonlyMode) {
      throw new Error('MemBerry is in read-only mode (MEMBERRY_READONLY=true); memory block writes are disabled.');
    }
  }

  private async _invalidateContext(scope: string): Promise<void> {
    if (this.cacheInvalidator) {
      try {
        await this.cacheInvalidator.invalidateByScope(scope);
      } catch (err) {
        console.warn('[MemoryBlockService] Context cache invalidation failed:', err);
      }
    }
  }

  async read(scope: string, name: string, sessionId?: string, tenantId?: string): Promise<MemoryBlock | null> {
    // The Redis key is tenant-namespaced, so the cache is safe for every tenant.
    // Try Redis first, fall back to Neo4j.
    const cached = await this.redisBlocks.get(scope, name, sessionId, tenantId);
    if (cached) return cached;
    const block = await this.neo4jBlocks.get(scope, name, sessionId, tenantId);
    if (block) {
      // Cache-aside: write back to Redis on cache miss
      try {
        await this.redisBlocks.set(block, tenantId);
      } catch (err) {
        console.warn('[MemoryBlockService] Failed to cache Neo4j block in Redis:', err);
      }
    }
    return block;
  }

  async insert(scope: string, name: string, text: string, sessionId?: string, tenantId?: string): Promise<MemoryBlock> {
    const existing = await this.read(scope, name, sessionId, tenantId);
    const now = new Date().toISOString();

    if (existing) {
      const newContent = existing.content + text;
      if (newContent.length > MAX_BLOCK_SIZE) {
        throw new Error(`Block "${name}" would exceed max size (${newContent.length} > ${MAX_BLOCK_SIZE} chars)`);
      }
      const updated: MemoryBlock = {
        ...existing,
        content: newContent,
        updated_at: now,
      };
      await this._persist(updated, tenantId);
      return updated;
    }

    // Create new block — determine tier from defaults or default to working
    if (text.length > MAX_BLOCK_SIZE) {
      throw new Error(`Block "${name}" would exceed max size (${text.length} > ${MAX_BLOCK_SIZE} chars)`);
    }
    const defaultDef = DEFAULT_BLOCKS.find((d) => d.name === name);
    const tier: MemoryTier = defaultDef?.tier ?? 'working';

    const block: MemoryBlock = {
      id: nanoid(),
      name,
      tier,
      content: text,
      scope,
      ...(sessionId && { session_id: sessionId }),
      created_at: now,
      updated_at: now,
    };

    await this._persist(block, tenantId);
    return block;
  }

  async replace(scope: string, name: string, oldText: string, newText: string, sessionId?: string, tenantId?: string): Promise<MemoryBlock> {
    const block = await this.read(scope, name, sessionId, tenantId);
    if (!block) {
      throw new Error(`Block "${name}" not found in scope "${scope}"`);
    }
    if (!block.content.includes(oldText)) {
      throw new Error(`old_text not found in block "${name}"`);
    }
    const newContent = block.content.replaceAll(oldText, newText);
    if (newContent.length > MAX_BLOCK_SIZE) {
      throw new Error(`Block "${name}" would exceed max size (${newContent.length} > ${MAX_BLOCK_SIZE} chars)`);
    }
    const updated: MemoryBlock = {
      ...block,
      content: newContent,
      updated_at: new Date().toISOString(),
    };
    // Optimistic concurrency: verify block wasn't modified between read and write
    await this._persistWithVersionCheck(updated, block.updated_at, tenantId);
    return updated;
  }

  async rewrite(scope: string, name: string, content: string, sessionId?: string, tenantId?: string): Promise<MemoryBlock> {
    if (content.length > MAX_BLOCK_SIZE) {
      throw new Error(`Block "${name}" would exceed max size (${content.length} > ${MAX_BLOCK_SIZE} chars)`);
    }
    const block = await this.read(scope, name, sessionId, tenantId);
    const now = new Date().toISOString();

    if (block) {
      const updated: MemoryBlock = {
        ...block,
        content,
        updated_at: now,
      };
      await this._persist(updated, tenantId);
      return updated;
    }

    // Create new block
    const defaultDef = DEFAULT_BLOCKS.find((d) => d.name === name);
    const tier: MemoryTier = defaultDef?.tier ?? 'working';

    const newBlock: MemoryBlock = {
      id: nanoid(),
      name,
      tier,
      content,
      scope,
      ...(sessionId && { session_id: sessionId }),
      created_at: now,
      updated_at: now,
    };

    await this._persist(newBlock, tenantId);
    return newBlock;
  }

  async promote(scope: string, name: string, fromTier: MemoryTier, toTier: MemoryTier, sessionId?: string, tenantId?: string): Promise<MemoryBlock> {
    const block = await this.read(scope, name, sessionId, tenantId);
    if (!block) {
      throw new Error(`Block "${name}" not found in scope "${scope}"`);
    }
    if (block.tier !== fromTier) {
      throw new Error(`Block "${name}" is tier "${block.tier}", expected "${fromTier}"`);
    }

    const originalSessionId = block.session_id;
    const updated: MemoryBlock = {
      ...block,
      tier: toTier,
      updated_at: new Date().toISOString(),
    };

    // Strip session_id when promoting to core — core blocks are session-agnostic
    if (toTier === 'core') {
      delete updated.session_id;
    }

    // Always write to Redis
    await this.redisBlocks.set(updated, tenantId);

    // If promoting to core, persist to Neo4j
    if (toTier === 'core') {
      await this.neo4jBlocks.save(updated, tenantId);
      // Stripping session_id changes the Redis key, so the old session-scoped entry would
      // linger as a stale duplicate (read/list would surface the pre-promotion block).
      // Delete it under its original key.
      if (originalSessionId) {
        try {
          await this.redisBlocks.delete(scope, name, originalSessionId, tenantId);
        } catch (err) {
          console.warn('[MemoryBlockService] Failed to remove pre-promotion block copy:', err);
        }
      }
    }

    await this._invalidateContext(scope);
    return updated;
  }

  async archive(scope: string, name: string, sessionId?: string, tenantId?: string): Promise<string> {
    this._assertWritable();
    const block = await this.read(scope, name, sessionId, tenantId);
    if (!block) {
      throw new Error(`Block "${name}" not found in scope "${scope}"`);
    }

    const content = block.content;

    // Delete from both stores (pass sessionId to scope deletion correctly)
    await this.redisBlocks.delete(scope, name, sessionId, tenantId);
    await this.neo4jBlocks.delete(scope, name, sessionId, tenantId);

    await this._invalidateContext(scope);
    return content;
  }

  async listBlocks(scope: string, tier?: MemoryTier, sessionId?: string, tenantId?: string): Promise<MemoryBlock[]> {
    // The Redis key is tenant-namespaced, so the cache is safe for every tenant.
    // Merge both stores (Redis wins on conflict).
    const [redisBlocks, neo4jBlocks] = await Promise.all([
      this.redisBlocks.list(scope, tier, sessionId, tenantId),
      this.neo4jBlocks.list(scope, tier, sessionId, tenantId),
    ]);

    // Dedup by name — Redis wins on conflict
    const byName = new Map<string, MemoryBlock>();
    for (const block of neo4jBlocks) {
      byName.set(block.name, block);
    }
    for (const block of redisBlocks) {
      byName.set(block.name, block);
    }

    return Array.from(byName.values());
  }

  async initDefaults(scope: string): Promise<MemoryBlock[]> {
    const created: MemoryBlock[] = [];

    for (const def of DEFAULT_BLOCKS) {
      const existing = await this.read(scope, def.name);
      if (!existing) {
        const now = new Date().toISOString();
        const block: MemoryBlock = {
          id: nanoid(),
          name: def.name,
          tier: def.tier,
          content: '',
          scope,
          created_at: now,
          updated_at: now,
        };
        await this._persist(block);
        created.push(block);
      }
    }

    return created;
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async _persist(block: MemoryBlock, tenantId?: string): Promise<void> {
    this._assertWritable();
    // Write to Neo4j first (source of truth) for core tier
    if (block.tier === 'core') {
      await this.neo4jBlocks.save(block, tenantId);
    }

    // Then write to Redis (cache) — if this fails, Neo4j still has the data.
    // tenantId is threaded through so a future tenant-namespaced Redis key can
    // use it; for now non-default tenants read straight from Neo4j (see read()).
    try {
      await this.redisBlocks.set(block, tenantId);
    } catch (err) {
      if (block.tier === 'core') {
        // Neo4j succeeded, Redis failed — log warning but don't fail
        console.warn('[MemoryBlockService] Redis cache write failed, Neo4j has the data:', err);
      } else {
        // Non-core blocks only live in Redis, so this is a real failure
        throw err;
      }
    }

    // Invalidate assembled context cache so next load() picks up changes
    await this._invalidateContext(block.scope);
  }

  /**
   * Persist with optimistic concurrency check.
   * Re-reads the block and verifies updated_at matches expectedVersion.
   * Throws if another writer modified the block between our read and write.
   */
  private async _persistWithVersionCheck(block: MemoryBlock, expectedVersion: string, tenantId?: string): Promise<void> {
    // Re-read current state to detect concurrent modification. The Redis key is
    // tenant-namespaced, so the cache is safe for every tenant.
    const current = await this.redisBlocks.get(block.scope, block.name, block.session_id, tenantId);
    if (current && current.updated_at !== expectedVersion) {
      throw new Error(
        `Concurrent modification detected on block "${block.name}": ` +
        `expected version ${expectedVersion}, found ${current.updated_at}. ` +
        `Read the block again and retry.`,
      );
    }
    await this._persist(block, tenantId);
  }
}
