// packages/core/src/__tests__/hooks-materialized.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { materializeContext, resolveTargetFile } from '../cli/adapters/materialized.js';
import { hasManagedBlock } from '../cli/managed-block.js';
import type { CoreServices } from '../services-factory.js';
import type { MemoryContext } from '../types.js';

function makeCore(ctx: MemoryContext | null): CoreServices {
  return {
    ampService: {
      load: async () => {
        if (!ctx) throw new Error('AMP down');
        return ctx;
      },
    },
  } as unknown as CoreServices;
}

const ctx: MemoryContext = { markdown: '# Memory\n- a fact', tokens: 3, sources: ['s1'], assembled_at: 'now' };
const FIXED = (): Date => new Date('2026-06-02T00:00:00.000Z');

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amp-mat-'));
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), 'Project Tag: project:test-app\n');
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('resolveTargetFile', () => {
  it('codex → AGENTS.md', () => {
    expect(resolveTargetFile('codex', dir)).toBe(path.join(dir, 'AGENTS.md'));
  });
  it('hermes → first existing of priority list, else .hermes.md', () => {
    expect(resolveTargetFile('hermes', dir)).toBe(path.join(dir, '.hermes.md'));
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), 'x');
    expect(resolveTargetFile('hermes', dir)).toBe(path.join(dir, 'AGENTS.md'));
  });
  it('honours an explicit relative --file', () => {
    expect(resolveTargetFile('codex', dir, 'sub/CTX.md')).toBe(path.join(dir, 'sub/CTX.md'));
  });
});

describe('materializeContext', () => {
  it('writes a managed block containing the loaded markdown', async () => {
    const res = await materializeContext(makeCore(ctx), { agent: 'codex', cwd: dir, now: FIXED });
    expect(res.loaded).toBe(true);
    const content = fs.readFileSync(res.file, 'utf-8');
    expect(hasManagedBlock(content)).toBe(true);
    expect(content).toContain('a fact');
    expect(content).toContain('scope: project:test-app');
  });

  it('is idempotent: two runs with a fixed clock are byte-identical', async () => {
    await materializeContext(makeCore(ctx), { agent: 'codex', cwd: dir, now: FIXED });
    const first = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf-8');
    await materializeContext(makeCore(ctx), { agent: 'codex', cwd: dir, now: FIXED });
    const second = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf-8');
    expect(second).toBe(first);
  });

  it('writes a placeholder block (loaded=false) when AMP is unreachable', async () => {
    const res = await materializeContext(makeCore(null), { agent: 'codex', cwd: dir, now: FIXED });
    expect(res.loaded).toBe(false);
    expect(fs.readFileSync(res.file, 'utf-8')).toContain('AMP unreachable');
  });

  it('preserves human-authored content around the block', async () => {
    const target = path.join(dir, 'AGENTS.md');
    fs.writeFileSync(target, '# Hand written\n\nkeep this line\n');
    await materializeContext(makeCore(ctx), { agent: 'codex', cwd: dir, now: FIXED });
    expect(fs.readFileSync(target, 'utf-8')).toContain('keep this line');
  });

  it('rejects --per-dir (reserved, not implemented)', async () => {
    await expect(
      materializeContext(makeCore(ctx), { agent: 'hermes', cwd: dir, perDir: true, now: FIXED }),
    ).rejects.toThrow(/per-dir/i);
  });
});
