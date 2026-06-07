// packages/arch/src/__tests__/tools.regression.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const TOOLS_SOURCE = fs.readFileSync(
  path.resolve(__dirname, '../tools.ts'),
  'utf-8',
);

describe('arch tools.ts regression', () => {
  it('berry_arch_context exposes project scoping for duplicate entity names', () => {
    expect(TOOLS_SOURCE).toContain('project_name');
    expect(TOOLS_SOURCE).toContain('renderMarkdown(args.entity_name, args.max_tokens, args.as_of, args.project_name)');
    expect(TOOLS_SOURCE).toContain('getChildren(args.entity_name, args.project_name)');
  });

  it('berry_impact exposes project scoping for duplicate entity names', () => {
    expect(TOOLS_SOURCE).toContain('blastRadius(args.entity_name, args.as_of, args.project_name)');
  });

  it('berry_arch_drift scopes single-entity check and mark_fresh actions', () => {
    expect(TOOLS_SOURCE).toContain('checkFreshness(args.entity_name, args.project_name)');
    expect(TOOLS_SOURCE).toContain('markFresh(args.entity_name, args.project_name)');
  });

  it('berry_arch_aspect scopes entity-specific operations', () => {
    expect(TOOLS_SOURCE).toContain('applyTo(args.name, args.entity_name, args.project_name)');
    expect(TOOLS_SOURCE).toContain('removeFrom(args.name, args.entity_name, args.project_name)');
    expect(TOOLS_SOURCE).toContain('getEffectiveAspects(args.entity_name, args.project_name)');
    expect(TOOLS_SOURCE).toContain('getEntitiesForAspect(args.name, args.project_name)');
  });

  it('berry_arch_relate scopes structural relation creation', () => {
    expect(TOOLS_SOURCE).toContain('args.properties,\n        args.project_name');
  });
});
