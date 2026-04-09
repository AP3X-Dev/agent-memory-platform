// packages/core/src/blocks.ts
import { nanoid } from 'nanoid';
import type { MemoryBlock, MemoryTier } from './types.js';
import { DEFAULT_BLOCKS } from './types.js';

// ─── Dependency interfaces (injected, not concrete imports) ──────────────────

export interface RedisBlockLayer {
  get(scope: string, name: string, sessionId?: string): Promise<MemoryBlock | null>;
  set(block: MemoryBlock): Promise<void>;
  list(scope: string, tier?: MemoryTier, sessionId?: string): Promise<MemoryBlock[]>;
  delete(scope: string, name: string, sessionId?: string): Promise<void>;
}

export interface Neo4jBlockLayer {
  save(block: MemoryBlock): Promise<void>;
  get(scope: string, name: string): Promise<MemoryBlock | null>;
  list(scope: string, tier?: MemoryTier): Promise<MemoryBlock[]>;
  delete(scope: string, name: string): Promise<void>;
}

// ─── MemoryBlockService ─────────────────────────────────────────────────────

export class MemoryBlockService {
  constructor(
    private redisBlocks: RedisBlockLayer,
    private neo4jBlocks: Neo4jBlockLayer,
  ) {}

  async read(scope: string, name: string, sessionId?: string): Promise<MemoryBlock | null> {
    // Try Redis first, fall back to Neo4j
    const cached = await this.redisBlocks.get(scope, name, sessionId);
    if (cached) return cached;
    return this.neo4jBlocks.get(scope, name);
  }

  async insert(scope: string, name: string, text: string, sessionId?: string): Promise<MemoryBlock> {
    const existing = await this.read(scope, name, sessionId);
    const now = new Date().toISOString();

    if (existing) {
      const updated: MemoryBlock = {
        ...existing,
        content: existing.content + text,
        updated_at: now,
      };
      await this._persist(updated);
      return updated;
    }

    // Create new block — determine tier from defaults or default to working
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

    await this._persist(block);
    return block;
  }

  async replace(scope: string, name: string, oldText: string, newText: string, sessionId?: string): Promise<MemoryBlock> {
    const block = await this.read(scope, name, sessionId);
    if (!block) {
      throw new Error(`Block "${name}" not found in scope "${scope}"`);
    }
    if (!block.content.includes(oldText)) {
      throw new Error(`old_text not found in block "${name}"`);
    }
    const updated: MemoryBlock = {
      ...block,
      content: block.content.replace(oldText, newText),
      updated_at: new Date().toISOString(),
    };
    await this._persist(updated);
    return updated;
  }

  async rewrite(scope: string, name: string, content: string, sessionId?: string): Promise<MemoryBlock> {
    const block = await this.read(scope, name, sessionId);
    const now = new Date().toISOString();

    if (block) {
      const updated: MemoryBlock = {
        ...block,
        content,
        updated_at: now,
      };
      await this._persist(updated);
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

    await this._persist(newBlock);
    return newBlock;
  }

  async promote(scope: string, name: string, fromTier: MemoryTier, toTier: MemoryTier): Promise<MemoryBlock> {
    const block = await this.read(scope, name);
    if (!block) {
      throw new Error(`Block "${name}" not found in scope "${scope}"`);
    }
    if (block.tier !== fromTier) {
      throw new Error(`Block "${name}" is tier "${block.tier}", expected "${fromTier}"`);
    }

    const updated: MemoryBlock = {
      ...block,
      tier: toTier,
      updated_at: new Date().toISOString(),
    };

    // Always write to Redis
    await this.redisBlocks.set(updated);

    // If promoting to core, persist to Neo4j
    if (toTier === 'core') {
      await this.neo4jBlocks.save(updated);
    }

    return updated;
  }

  async archive(scope: string, name: string, sessionId?: string): Promise<string> {
    const block = await this.read(scope, name, sessionId);
    if (!block) {
      throw new Error(`Block "${name}" not found in scope "${scope}"`);
    }

    const content = block.content;

    // Delete from both stores
    await this.redisBlocks.delete(scope, name, sessionId);
    await this.neo4jBlocks.delete(scope, name);

    return content;
  }

  async listBlocks(scope: string, tier?: MemoryTier, sessionId?: string): Promise<MemoryBlock[]> {
    const [redisBlocks, neo4jBlocks] = await Promise.all([
      this.redisBlocks.list(scope, tier, sessionId),
      this.neo4jBlocks.list(scope, tier),
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

  private async _persist(block: MemoryBlock): Promise<void> {
    // Always write to Redis
    await this.redisBlocks.set(block);

    // Write to Neo4j if core tier
    if (block.tier === 'core') {
      await this.neo4jBlocks.save(block);
    }
  }
}
