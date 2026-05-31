// packages/neo4j/src/entity-resolver.ts
import { type Driver, type Session, type Transaction } from 'neo4j-driver';
import { nanoid } from 'nanoid';

export interface ResolvedEntity {
  id: string;
  name: string;
  aliases: string[];
  matchType: 'exact' | 'case_insensitive' | 'alias' | 'created';
}

/** Anything that supports session.run() — a Session or a Transaction. */
type Queryable = { run: Session['run'] | Transaction['run'] };

/**
 * Resolves a text string to a canonical Entity node.
 *
 * Resolution cascade:
 * 1. Exact name match
 * 2. Case-insensitive name match (adds alias on hit)
 * 3. Alias match (case-insensitive against entity aliases array)
 * 4. Create new entity if no match found
 *
 * When a non-exact match is found, the input text is added as an alias
 * to accumulate alternative names over time.
 */
export class EntityResolver {
  constructor(private driver: Driver) {}

  /**
   * Resolve text to a canonical entity. Creates the entity if no match exists.
   *
   * @param text - The entity name to resolve
   * @param type - Entity type for creation (default: 'concept')
   * @param tx - Optional transaction to run within (for atomicity with fact creation)
   */
  async resolve(text: string, type: string = 'concept', tx?: Transaction): Promise<ResolvedEntity> {
    // Trim surrounding whitespace before resolving/creating — otherwise "auth-module" and
    // " auth-module " resolve to different entities, the exact fragmentation this resolver
    // exists to prevent (the exact and toLower matches are both whitespace-sensitive).
    text = text.trim();
    // If a transaction is provided, run within it (caller manages session lifecycle).
    // Otherwise, open a session for the duration of this resolution.
    if (tx) {
      return this._resolveWith(tx, text, type);
    }

    const session = this.driver.session();
    try {
      return await this._resolveWith(session, text, type);
    } finally {
      await session.close();
    }
  }

  /**
   * Resolve without creating — returns null if no match found.
   * Useful for queries where you don't want to create entities as a side effect.
   */
  async resolveExisting(text: string): Promise<ResolvedEntity | null> {
    text = text.trim(); // same whitespace-insensitivity as resolve(), so lookups match
    const session = this.driver.session();
    try {
      // Staged queries with deterministic ordering (ORDER BY created_at ASC)
      // to ensure consistent resolution when multiple entities match.

      // 1. Exact name match
      const exact = await session.run(
        'MATCH (e:Entity {name: $text}) RETURN e LIMIT 1',
        { text },
      );
      if (exact.records.length > 0) {
        const props = exact.records[0].get('e').properties;
        return {
          id: props.id as string,
          name: props.name as string,
          aliases: toStringArray(props.aliases),
          matchType: 'exact',
        };
      }

      // 2. Case-insensitive name match
      const ci = await session.run(
        'MATCH (e:Entity) WHERE toLower(e.name) = toLower($text) RETURN e ORDER BY e.created_at ASC LIMIT 1',
        { text },
      );
      if (ci.records.length > 0) {
        const props = ci.records[0].get('e').properties;
        return {
          id: props.id as string,
          name: props.name as string,
          aliases: toStringArray(props.aliases),
          matchType: 'case_insensitive',
        };
      }

      // 3. Alias match
      const al = await session.run(
        `MATCH (e:Entity)
         WHERE any(a IN COALESCE(e.aliases, []) WHERE toLower(a) = toLower($text))
         RETURN e ORDER BY e.created_at ASC LIMIT 1`,
        { text },
      );
      if (al.records.length > 0) {
        const props = al.records[0].get('e').properties;
        return {
          id: props.id as string,
          name: props.name as string,
          aliases: toStringArray(props.aliases),
          matchType: 'alias',
        };
      }

      return null;
    } finally {
      await session.close();
    }
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private async _resolveWith(q: Queryable, text: string, type: string): Promise<ResolvedEntity> {
    // 1. Exact name match
    const exact = await q.run(
      'MATCH (e:Entity {name: $text}) RETURN e LIMIT 1',
      { text },
    );
    if (exact.records.length > 0) {
      const props = exact.records[0].get('e').properties;
      return {
        id: props.id as string,
        name: props.name as string,
        aliases: toStringArray(props.aliases),
        matchType: 'exact',
      };
    }

    // 2. Case-insensitive name match
    const ci = await q.run(
      'MATCH (e:Entity) WHERE toLower(e.name) = toLower($text) RETURN e ORDER BY e.created_at ASC LIMIT 1',
      { text },
    );
    if (ci.records.length > 0) {
      const props = ci.records[0].get('e').properties;
      const id = props.id as string;
      // Add text as alias and return the updated aliases
      const updatedAliases = await this._addAlias(q, id, text, toStringArray(props.aliases));
      return {
        id,
        name: props.name as string,
        aliases: updatedAliases,
        matchType: 'case_insensitive',
      };
    }

    // 3. Alias match (case-insensitive against any alias)
    const al = await q.run(
      `MATCH (e:Entity)
       WHERE any(a IN COALESCE(e.aliases, []) WHERE toLower(a) = toLower($text))
       RETURN e ORDER BY e.created_at ASC LIMIT 1`,
      { text },
    );
    if (al.records.length > 0) {
      const props = al.records[0].get('e').properties;
      return {
        id: props.id as string,
        name: props.name as string,
        aliases: toStringArray(props.aliases),
        matchType: 'alias',
      };
    }

    // 4. No match — create new entity
    const id = `ent-${nanoid(12)}`;
    const now = new Date().toISOString();
    await q.run(
      'CREATE (e:Entity {id: $id, name: $text, type: $type, aliases: [], created_at: $now})',
      { id, text, type, now },
    );
    return {
      id,
      name: text,
      aliases: [],
      matchType: 'created',
    };
  }

  /**
   * Add an alias to an entity if not already present.
   * Returns the updated aliases array.
   */
  private async _addAlias(q: Queryable, entityId: string, alias: string, currentAliases: string[]): Promise<string[]> {
    // Check if alias is already present (case-insensitive) or matches the canonical name
    const alreadyExists = currentAliases.some((a) => a.toLowerCase() === alias.toLowerCase());
    if (alreadyExists) return currentAliases;

    await q.run(
      `MATCH (e:Entity {id: $id})
       WHERE NOT any(a IN COALESCE(e.aliases, []) WHERE toLower(a) = toLower($alias))
         AND toLower(e.name) <> toLower($alias)
       SET e.aliases = COALESCE(e.aliases, []) + $alias`,
      { id: entityId, alias },
    );

    // Return updated aliases reflecting the addition
    return [...currentAliases, alias];
  }
}

function toStringArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String);
  return [];
}
