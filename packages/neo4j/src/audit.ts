// packages/neo4j/src/audit.ts
//
// Append-only audit trail for graph mutations. Every write path (store, memory
// block mutations, consolidation, bootstrap) records who did what, when, to
// which target. Stored as :AuditLog nodes so the trail is queryable alongside
// the rest of the graph and survives restarts.
//
// Design notes:
//   - append() is best-effort and must NEVER throw into the caller's path —
//     losing an audit line must not fail a user's store(). It logs on failure.
//   - There is no update/delete API: the trail is append-only by construction.

import neo4j, { type Driver } from 'neo4j-driver';
import { nanoid } from 'nanoid';
import type { AuditEntry } from '@memberry/core';

export interface AuditRecord extends AuditEntry {
  id: string;
  at: string;
}

export class AuditLogStore {
  constructor(private driver: Driver) {}

  /** Append an audit entry. Best-effort: never throws. */
  async append(entry: AuditEntry): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(
        `CREATE (a:AuditLog {
           id: $id, actor: $actor, action: $action,
           scope: $scope, target_id: $target_id, detail: $detail, at: $at
         })`,
        {
          id: `audit-${nanoid()}`,
          actor: entry.actor ?? 'unknown',
          action: entry.action,
          scope: entry.scope ?? null,
          target_id: entry.target_id ?? null,
          detail: entry.detail ?? null,
          at: new Date().toISOString(),
        },
      );
    } catch (err) {
      // Audit must not break the operation it records.
      console.error('[memberry-audit] failed to append audit entry (non-fatal):', err instanceof Error ? err.message : err);
    } finally {
      await session.close();
    }
  }

  /** Query the audit trail, most-recent first, optionally filtered by actor/scope. */
  async query(opts: { actor?: string; scope?: string; action?: string; limit?: number } = {}): Promise<AuditRecord[]> {
    const limit = Math.min(Math.max(1, Math.floor(opts.limit ?? 50)), 500);
    const session = this.driver.session({ defaultAccessMode: neo4j.session.READ });
    try {
      const filters: string[] = [];
      if (opts.actor) filters.push('a.actor = $actor');
      if (opts.scope) filters.push('a.scope = $scope');
      if (opts.action) filters.push('a.action = $action');
      const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
      const res = await session.run(
        `MATCH (a:AuditLog) ${where}
         RETURN a ORDER BY a.at DESC LIMIT $limit`,
        { actor: opts.actor, scope: opts.scope, action: opts.action, limit: neo4j.int(limit) },
      );
      return res.records.map((r) => {
        const p = r.get('a').properties as Record<string, unknown>;
        return {
          id: String(p.id),
          actor: String(p.actor),
          action: String(p.action),
          scope: p.scope == null ? undefined : String(p.scope),
          target_id: p.target_id == null ? undefined : String(p.target_id),
          detail: p.detail == null ? undefined : String(p.detail),
          at: String(p.at),
        };
      });
    } finally {
      await session.close();
    }
  }
}
