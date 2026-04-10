// packages/neo4j/src/temporal-edges.ts
// Temporal validity helpers for graph relationships.
// Relationships carry valid_at / invalid_at properties to support
// point-in-time graph queries ("as of time T").

export interface TemporalEdgeProperties {
  valid_at: string;       // ISO timestamp — when this relationship became active
  invalid_at?: string;    // ISO timestamp — when this relationship was superseded (null = active)
}

/**
 * Build a SET clause fragment that stamps temporal properties on a relationship.
 * Uses COALESCE so existing valid_at is never overwritten on MERGE.
 *
 * @param alias  Cypher alias for the relationship variable (e.g. 'r')
 * @param paramName  Name of the Cypher parameter holding the timestamp (default 'now')
 * @returns Cypher SET fragment, e.g. "SET r.valid_at = COALESCE(r.valid_at, $now)"
 */
export function temporalSetClause(alias: string, paramName = 'now'): string {
  return `SET ${alias}.valid_at = COALESCE(${alias}.valid_at, $${paramName})`;
}

/**
 * Build a WHERE clause fragment that filters for active relationships.
 *
 * When asOf is provided (via $asOf param), returns relationships that were
 * active at that point in time. Otherwise returns currently-active relationships.
 *
 * Missing valid_at is treated as "always been valid" (epoch).
 * Missing invalid_at is treated as "still active".
 *
 * @param alias  Cypher alias for the relationship variable
 * @param asOfParam  Name of the Cypher parameter for the as-of timestamp, or undefined for "current"
 * @returns Cypher WHERE fragment (without leading WHERE/AND — caller adds that)
 */
export function activeRelationshipFilter(alias: string, asOfParam?: string): string {
  if (asOfParam) {
    return `(COALESCE(${alias}.valid_at, '1970-01-01T00:00:00.000Z') <= $${asOfParam} AND (${alias}.invalid_at IS NULL OR ${alias}.invalid_at > $${asOfParam}))`;
  }
  return `${alias}.invalid_at IS NULL`;
}

/**
 * Invalidate a relationship by setting its invalid_at timestamp.
 * Only invalidates the currently-active instance (where invalid_at IS NULL).
 *
 * @param session  A neo4j session or transaction with a run() method
 * @param fromId   The id property of the source node
 * @param toId     The id property of the target node
 * @param relType  The relationship type (must be from a validated allowlist)
 * @param invalidAt  ISO timestamp for invalidation (defaults to now)
 */
export async function invalidateRelationship(
  session: { run: (query: string, params?: Record<string, unknown>) => Promise<unknown> },
  fromId: string,
  toId: string,
  relType: string,
  invalidAt?: string,
): Promise<void> {
  const now = invalidAt ?? new Date().toISOString();
  // relType is caller-validated (enum/allowlist) before reaching here.
  await session.run(
    `MATCH (a {id: $fromId})-[r:${relType}]->(b {id: $toId})
     WHERE r.invalid_at IS NULL
     SET r.invalid_at = $now`,
    { fromId, toId, now },
  );
}
