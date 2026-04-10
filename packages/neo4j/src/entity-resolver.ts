// packages/neo4j/src/entity-resolver.ts
import { type Driver } from 'neo4j-driver';
import { nanoid } from 'nanoid';

export interface ResolvedEntity {
  id: string;
  name: string;
  aliases: string[];
  matchType: 'exact' | 'case_insensitive' | 'alias' | 'created';
}

/**
 * Resolves a text string to a canonical Entity node.
 *
 * Resolution cascade:
 * 1. Exact name match
 * 2. Case-insensitive name match
 * 3. Alias match (case-insensitive against any alias in the entity's aliases array)
 * 4. Create new entity if no match found
 *
 * When a non-exact match is found, the input text is added as an alias
 * to accumulate alternative names over time.
 */
export class EntityResolver {
  constructor(private driver: Driver) {}

  async resolve(text: string, type: string = 'concept'): Promise<ResolvedEntity> {
    const session = this.driver.session();
    try {
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
      const caseInsensitive = await session.run(
        'MATCH (e:Entity) WHERE toLower(e.name) = toLower($text) RETURN e ORDER BY e.created_at ASC LIMIT 1',
        { text },
      );
      if (caseInsensitive.records.length > 0) {
        const props = caseInsensitive.records[0].get('e').properties;
        const id = props.id as string;
        // Add text as alias if not already present
        await this._addAlias(session, id, text);
        return {
          id,
          name: props.name as string,
          aliases: toStringArray(props.aliases),
          matchType: 'case_insensitive',
        };
      }

      // 3. Alias match (case-insensitive against any alias)
      const aliasMatch = await session.run(
        `MATCH (e:Entity)
         WHERE any(a IN COALESCE(e.aliases, []) WHERE toLower(a) = toLower($text))
         RETURN e ORDER BY e.created_at ASC LIMIT 1`,
        { text },
      );
      if (aliasMatch.records.length > 0) {
        const props = aliasMatch.records[0].get('e').properties;
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
      await session.run(
        `CREATE (e:Entity {id: $id, name: $text, type: $type, aliases: [], created_at: $now})`,
        { id, text, type, now },
      );
      return {
        id,
        name: text,
        aliases: [],
        matchType: 'created',
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Resolve without creating — returns null if no match found.
   * Useful for queries where you don't want to create entities as a side effect.
   */
  async resolveExisting(text: string): Promise<ResolvedEntity | null> {
    const session = this.driver.session();
    try {
      // Try exact, case-insensitive, then alias — same cascade but no create
      const result = await session.run(
        `OPTIONAL MATCH (exact:Entity {name: $text})
         WITH exact
         OPTIONAL MATCH (ci:Entity) WHERE exact IS NULL AND toLower(ci.name) = toLower($text)
         WITH COALESCE(exact, ci) AS matched
         OPTIONAL MATCH (al:Entity) WHERE matched IS NULL AND any(a IN COALESCE(al.aliases, []) WHERE toLower(a) = toLower($text))
         WITH COALESCE(matched, al) AS entity
         WHERE entity IS NOT NULL
         RETURN entity LIMIT 1`,
        { text },
      );

      if (result.records.length === 0 || result.records[0].get('entity') === null) {
        return null;
      }

      const props = result.records[0].get('entity').properties;
      const name = props.name as string;
      const matchType = name === text ? 'exact'
        : name.toLowerCase() === text.toLowerCase() ? 'case_insensitive'
        : 'alias';

      return {
        id: props.id as string,
        name,
        aliases: toStringArray(props.aliases),
        matchType,
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Add an alias to an entity if not already present.
   */
  private async _addAlias(session: { run: Function }, entityId: string, alias: string): Promise<void> {
    await session.run(
      `MATCH (e:Entity {id: $id})
       WHERE NOT any(a IN COALESCE(e.aliases, []) WHERE toLower(a) = toLower($alias))
         AND toLower(e.name) <> toLower($alias)
       SET e.aliases = COALESCE(e.aliases, []) + $alias`,
      { id: entityId, alias },
    );
  }
}

function toStringArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String);
  return [];
}
