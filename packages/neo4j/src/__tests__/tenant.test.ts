// packages/neo4j/src/__tests__/tenant.test.ts
import { describe, it, expect } from 'vitest';
import { tenantWhere, resolveTenant, isDefaultTenant, TENANT_PARAM } from '../tenant.js';
import { DEFAULT_TENANT } from '@memberry/core';

describe('tenantWhere', () => {
  it('default tenant also matches legacy nodes with no tenant_id', () => {
    const clause = tenantWhere('s', DEFAULT_TENANT);
    expect(clause).toBe(`(s.tenant_id IS NULL OR s.tenant_id = $${TENANT_PARAM})`);
  });

  it('a non-default tenant matches STRICTLY (never legacy/default data)', () => {
    const clause = tenantWhere('s', 'acme');
    expect(clause).toBe(`s.tenant_id = $${TENANT_PARAM}`);
    // The strict clause must NOT include the IS NULL escape hatch.
    expect(clause).not.toContain('IS NULL');
  });

  it('binds via a parameter, never interpolates the tenant id (injection-safe)', () => {
    const clause = tenantWhere('s', "acme' OR '1'='1");
    // The raw value never appears in the clause — only the parameter reference.
    expect(clause).toBe(`s.tenant_id = $${TENANT_PARAM}`);
    expect(clause).not.toContain("OR '1'='1");
  });

  it('uses the given alias', () => {
    expect(tenantWhere('node', 'acme')).toBe(`node.tenant_id = $${TENANT_PARAM}`);
  });
});

describe('resolveTenant', () => {
  it('defaults empty/undefined/whitespace to DEFAULT_TENANT', () => {
    expect(resolveTenant(undefined)).toBe(DEFAULT_TENANT);
    expect(resolveTenant(null)).toBe(DEFAULT_TENANT);
    expect(resolveTenant('')).toBe(DEFAULT_TENANT);
    expect(resolveTenant('   ')).toBe(DEFAULT_TENANT);
  });
  it('trims and preserves a real tenant id', () => {
    expect(resolveTenant('  acme ')).toBe('acme');
  });
});

describe('isDefaultTenant', () => {
  it('treats empty/undefined as default, a named tenant as non-default', () => {
    expect(isDefaultTenant(undefined)).toBe(true);
    expect(isDefaultTenant(DEFAULT_TENANT)).toBe(true);
    expect(isDefaultTenant('acme')).toBe(false);
  });
});
