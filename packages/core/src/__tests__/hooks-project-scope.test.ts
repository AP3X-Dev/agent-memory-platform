// packages/core/src/__tests__/hooks-project-scope.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveProjectScope } from '../cli/project-scope.js';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amp-scope-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('resolveProjectScope', () => {
  it('parses the project tag and entities from CLAUDE.md AMP Memory block', () => {
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), [
      '# Project',
      '## AMP Memory',
      'Project Tag: project:my-app',
      '',
      'Entities:',
      '- alpha',
      '- beta-service',
      '',
      'Tags:',
      '- something',
    ].join('\n'));
    const scope = resolveProjectScope(dir);
    expect(scope.tag).toBe('project:my-app');
    expect(scope.entities).toEqual(['alpha', 'beta-service']);
    expect(scope.source).toBe(path.join(dir, 'CLAUDE.md'));
  });

  it('falls back to a kebab-cased directory name when no config exists', () => {
    const sub = path.join(dir, 'Some Cool Repo');
    fs.mkdirSync(sub);
    const scope = resolveProjectScope(sub);
    expect(scope.tag).toBe('project:some-cool-repo');
    expect(scope.entities).toEqual([]);
    expect(scope.source).toBeNull();
  });

  it('walks up to find a parent CLAUDE.md', () => {
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), 'Project Tag: project:root-app\n');
    const nested = path.join(dir, 'a', 'b');
    fs.mkdirSync(nested, { recursive: true });
    expect(resolveProjectScope(nested).tag).toBe('project:root-app');
  });
});
