// packages/neo4j/src/migrations.ts
//
// Forward-only schema migration runner for the MemBerry graph.
//
// DESIGN PRINCIPLE — "neutral IDs, additive schema":
//   Runtime node identity is assigned by the application (nanoid with neutral
//   prefixes: sem-/ep-/fact-/ent-/sym-/...), never by the schema. Node *labels*
//   and *properties* are additive and backward-compatible by construction, so a
//   fresh `initSchema()` is safe to re-run on any existing graph. That is why we
//   do not need destructive/down migrations for ordinary evolution.
//
// What this runner ADDS on top of idempotent `initSchema()`:
//   1. A persisted, auditable record of which migrations ran and when
//      (a singleton :SchemaVersion node).
//   2. An ordered way to apply *new* schema changes exactly once (e.g. a new
//      index, or recreating a vector index after an embedding-dimension change)
//      without re-running expensive backfills on every boot.
//   3. Drift detection for vector-index dimensions (see checkVectorIndexDimensions).
//
// The runner is idempotent: migrations already recorded in :SchemaVersion.applied
// are skipped. Because every individual statement also uses `IF NOT EXISTS`, an
// interrupted run is safe to retry.

import type { Driver } from 'neo4j-driver';
import { EMBEDDING_DIM } from '@memberry/core';
import { initSchema } from './schema.js';

export interface Migration {
  /** Stable, unique, ordered id. Convention: NNNN-kebab-description. */
  id: string;
  description: string;
  up(driver: Driver): Promise<void>;
}

/** Singleton node id used to track applied migrations. */
export const SCHEMA_VERSION_ID = 'memberry-schema';

/**
 * Ordered migration list. APPEND new migrations — never reorder or rewrite
 * an already-shipped entry, or deployments will diverge.
 */
export const MIGRATIONS: Migration[] = [
  {
    id: '0001-initial-schema',
    description:
      'Baseline constraints, plain/fulltext/vector indexes for episodic, semantic, ' +
      'entity, agent, model, memory-block and fact nodes.',
    up: async (driver) => {
      await initSchema(driver);
    },
  },
  {
    id: '0002-audit-log',
    description: 'Append-only audit trail: unique id constraint + (actor, at) lookup indexes.',
    up: async (driver) => {
      const session = driver.session();
      try {
        for (const stmt of [
          'CREATE CONSTRAINT audit_id IF NOT EXISTS FOR (a:AuditLog) REQUIRE a.id IS UNIQUE',
          'CREATE INDEX audit_at IF NOT EXISTS FOR (a:AuditLog) ON (a.at)',
          'CREATE INDEX audit_actor IF NOT EXISTS FOR (a:AuditLog) ON (a.actor)',
          'CREATE INDEX audit_scope IF NOT EXISTS FOR (a:AuditLog) ON (a.scope)',
        ]) {
          await session.run(stmt);
        }
      } finally {
        await session.close();
      }
    },
  },
];

export interface MigrationResult {
  /** Migration ids applied during this run (in order). */
  applied: string[];
  /** Migration ids skipped because they were already recorded. */
  skipped: string[];
  /** Total number of migrations now recorded as applied. */
  version: number;
}

async function readAppliedMigrations(driver: Driver): Promise<string[]> {
  const session = driver.session();
  try {
    const res = await session.run(
      'MATCH (v:SchemaVersion {id: $id}) RETURN v.applied AS applied',
      { id: SCHEMA_VERSION_ID },
    );
    if (res.records.length === 0) return [];
    const applied = res.records[0].get('applied');
    if (!Array.isArray(applied)) return [];
    return applied.map((x) => String(x));
  } finally {
    await session.close();
  }
}

async function recordApplied(driver: Driver, applied: string[]): Promise<void> {
  const session = driver.session();
  try {
    await session.run(
      `MERGE (v:SchemaVersion {id: $id})
       SET v.applied = $applied, v.version = $version, v.updated_at = $ts`,
      { id: SCHEMA_VERSION_ID, applied, version: applied.length, ts: new Date().toISOString() },
    );
  } finally {
    await session.close();
  }
}

/**
 * Apply all pending migrations in order, recording each in :SchemaVersion.
 * Idempotent: already-applied migrations are skipped. Safe to run at every boot.
 *
 * @param migrations override for tests; defaults to the shipped MIGRATIONS list.
 */
export async function runMigrations(
  driver: Driver,
  migrations: Migration[] = MIGRATIONS,
): Promise<MigrationResult> {
  const alreadyApplied = new Set(await readAppliedMigrations(driver));
  const applied = [...alreadyApplied];
  const skipped: string[] = [];
  const newlyApplied: string[] = [];

  for (const migration of migrations) {
    if (alreadyApplied.has(migration.id)) {
      skipped.push(migration.id);
      continue;
    }
    await migration.up(driver);
    applied.push(migration.id);
    newlyApplied.push(migration.id);
    // Record after each migration so a crash mid-run doesn't replay completed ones.
    await recordApplied(driver, applied);
  }

  return { applied: newlyApplied, skipped, version: applied.length };
}

export interface VectorIndexDimension {
  name: string;
  actual: number;
  expected: number;
}

/**
 * Best-effort drift check: compares each VECTOR index's configured dimension
 * against EMBEDDING_DIM. A mismatch means similarity queries will fail or return
 * garbage until the index is dropped and recreated. Returns the mismatches (empty
 * when all good, or when the server doesn't support the introspection query).
 */
export async function checkVectorIndexDimensions(driver: Driver): Promise<VectorIndexDimension[]> {
  const session = driver.session();
  try {
    const res = await session.run(
      "SHOW INDEXES YIELD name, type, options WHERE type = 'VECTOR' RETURN name, options",
    );
    const mismatches: VectorIndexDimension[] = [];
    for (const record of res.records) {
      const name = String(record.get('name'));
      const options = record.get('options') as Record<string, unknown> | null;
      const indexConfig = (options?.['indexConfig'] ?? {}) as Record<string, unknown>;
      const rawDim = indexConfig['vector.dimensions'];
      if (rawDim == null) continue;
      const actual = Number(rawDim);
      if (Number.isFinite(actual) && actual !== EMBEDDING_DIM) {
        mismatches.push({ name, actual, expected: EMBEDDING_DIM });
      }
    }
    return mismatches;
  } catch {
    // Older servers / restricted permissions: skip drift detection rather than fail boot.
    return [];
  } finally {
    await session.close();
  }
}
