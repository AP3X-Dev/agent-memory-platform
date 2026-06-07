/**
 * Graph-analysis schema setup for @memberry/graph.
 *
 * Mirrors the idempotent `CREATE ... IF NOT EXISTS` loop used by
 * `packages/neo4j/src/schema.ts`. Migration on existing graphs is purely
 * additive (every statement is `IF NOT EXISTS`), so there is no backfill.
 *
 * Teardown (documented rollback for a clean capability removal):
 *   MATCH ()-[ic:IN_COMMUNITY]->() DELETE ic;
 *   MATCH (c:Community) DETACH DELETE c;
 *   MATCH (r:GraphAnalysisRun) DETACH DELETE r;
 *   DROP CONSTRAINT graph_analysis_run_id IF EXISTS;
 *   DROP CONSTRAINT community_id IF EXISTS;
 *   DROP INDEX community_project IF EXISTS;
 *   DROP INDEX community_run IF EXISTS;
 *   DROP INDEX graph_analysis_project_created IF EXISTS;
 *   DROP INDEX source_project IF EXISTS;
 *
 * Note: persisted analysis nodes (GraphAnalysisRun / Community / IN_COMMUNITY)
 * are written only by future persisted runs and are excluded from amp_load /
 * consolidation candidate sets, so analytics never pollute memory retrieval.
 */
import type { Driver } from 'neo4j-driver';

const CONSTRAINTS: string[] = [
  'CREATE CONSTRAINT graph_analysis_run_id IF NOT EXISTS FOR (r:GraphAnalysisRun) REQUIRE r.id IS UNIQUE',
  'CREATE CONSTRAINT community_id IF NOT EXISTS FOR (c:Community) REQUIRE c.id IS UNIQUE',
];

const INDEXES: string[] = [
  'CREATE INDEX community_project IF NOT EXISTS FOR (c:Community) ON (c.project_tag)',
  'CREATE INDEX community_run IF NOT EXISTS FOR (c:Community) ON (c.run_id)',
  'CREATE INDEX graph_analysis_project_created IF NOT EXISTS FOR (r:GraphAnalysisRun) ON (r.project_tag, r.created_at)',
  // Snapshot scopes Sources by project_tag; without this the scan is unindexed
  // (Source previously had indexes on id/title/source_type only). See C-21.
  'CREATE INDEX source_project IF NOT EXISTS FOR (s:Source) ON (s.project_tag)',
];

export async function initGraphSchema(driver: Driver): Promise<void> {
  const session = driver.session();
  try {
    for (const statement of [...CONSTRAINTS, ...INDEXES]) {
      await session.run(statement);
    }
  } finally {
    await session.close();
  }
}
