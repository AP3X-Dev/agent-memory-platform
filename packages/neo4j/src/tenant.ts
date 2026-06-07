// packages/neo4j/src/tenant.ts
//
// Tenant isolation primitive for logical (shared-graph) multi-tenancy.
//
// Every tenant-scoped read ANDs `tenantWhere(alias, tenantId)` into its WHERE
// clause; every write stamps `tenant_id`. The tenant id is bound as the Cypher
// parameter `$tenantId` (never string-interpolated), so it is injection-safe
// even though it originates from a trusted token→tenant mapping.
//
// Back-compat: the DEFAULT tenant also matches legacy nodes that have no
// `tenant_id` property, so enabling multi-tenancy needs no data migration. A
// NON-default tenant matches strictly — it can never see legacy/default data.

import { DEFAULT_TENANT } from '@memberry/core';

export const TENANT_PARAM = 'tenantId';

/**
 * Cypher WHERE-fragment scoping node `alias` to `tenantId` (bound as $tenantId).
 *
 *   default tenant     → (a.tenant_id IS NULL OR a.tenant_id = $tenantId)
 *   non-default tenant →  a.tenant_id = $tenantId
 */
export function tenantWhere(alias: string, tenantId: string): string {
  if (tenantId === DEFAULT_TENANT) {
    return `(${alias}.tenant_id IS NULL OR ${alias}.tenant_id = $${TENANT_PARAM})`;
  }
  return `${alias}.tenant_id = $${TENANT_PARAM}`;
}

/** Normalize an optional tenant id to a concrete one (defaults to DEFAULT_TENANT). */
export function resolveTenant(tenantId?: string | null): string {
  const t = (tenantId ?? '').trim();
  return t.length > 0 ? t : DEFAULT_TENANT;
}

/** True when the given tenant is the default (single-tenant / legacy) tenant. */
export function isDefaultTenant(tenantId?: string | null): boolean {
  return resolveTenant(tenantId) === DEFAULT_TENANT;
}
