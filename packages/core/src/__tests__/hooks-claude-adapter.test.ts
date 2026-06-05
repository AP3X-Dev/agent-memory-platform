// packages/core/src/__tests__/hooks-claude-adapter.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  claudeSessionStart,
  claudeUserPrompt,
  claudeSessionEnd,
  claudePreCompact,
} from '../cli/adapters/claude.js';
import type { CoreServices } from '../services-factory.js';
import type { MemoryContext } from '../types.js';

// ─── Stubbed CoreServices ────────────────────────────────────────────────────
function makeCore(overrides: {
  ctx?: MemoryContext | (() => Promise<MemoryContext>);
} = {}) {
  const sets = new Map<string, Set<string>>();
  const loadCalls: unknown[] = [];
  const stores: unknown[] = [];
  const inserts: unknown[] = [];

  const ctx: MemoryContext = { markdown: '# Memory\n- fact', tokens: 5, sources: ['s1', 's2'], assembled_at: 'now' };

  const redis = {
    sadd: async (key: string, ...members: string[]) => {
      const s = sets.get(key) ?? new Set<string>();
      members.forEach((m) => s.add(m));
      sets.set(key, s);
      return members.length;
    },
    smembers: async (key: string) => Array.from(sets.get(key) ?? []),
    expire: async () => 1,
  };

  const core = {
    redis,
    ampService: {
      load: async (scope: unknown) => {
        loadCalls.push(scope);
        if (typeof overrides.ctx === 'function') return overrides.ctx();
        return overrides.ctx ?? ctx;
      },
      store: async (input: unknown) => { stores.push(input); return { id: 'ep-1', duplicate: false }; },
    },
    memoryBlocks: {
      insert: async (...args: unknown[]) => { inserts.push(args); return { id: 'b', name: 'working_state', tier: 'working', content: 'x', scope: 's' }; },
    },
  } as unknown as CoreServices;

  return { core, sets, loadCalls, stores, inserts };
}

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amp-claude-'));
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), 'Project Tag: project:test-app\n');
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('claude session-start', () => {
  it('injects loaded markdown and records sources for dedup', async () => {
    const { core, sets } = makeCore();
    const out = await claudeSessionStart(core, { session_id: 'sess', cwd: dir, source: 'startup' });
    expect((out as any).hookSpecificOutput.hookEventName).toBe('SessionStart');
    expect((out as any).hookSpecificOutput.additionalContext).toContain('# Memory');
    expect(Array.from(sets.get('amp:hookdedup:sess') ?? [])).toEqual(['s1', 's2']);
  });

  it('fails open to {} when load returns nothing', async () => {
    const { core } = makeCore({ ctx: () => Promise.reject(new Error('down')) });
    const out = await claudeSessionStart(core, { session_id: 'sess', cwd: dir });
    expect(out).toEqual({});
  });
});

describe('claude user-prompt (delta injection)', () => {
  it('returns {} for an empty prompt', async () => {
    const { core } = makeCore();
    expect(await claudeUserPrompt(core, { session_id: 's', cwd: dir, prompt: '  ' })).toEqual({});
  });

  it('injects when sources are fresh, then records them', async () => {
    const { core, sets } = makeCore();
    const out = await claudeUserPrompt(core, { session_id: 's', cwd: dir, prompt: 'do a thing' });
    expect((out as any).hookSpecificOutput.hookEventName).toBe('UserPromptSubmit');
    expect(Array.from(sets.get('amp:hookdedup:s') ?? [])).toEqual(['s1', 's2']);
  });

  it('skips injection when every source was already injected this session', async () => {
    const { core } = makeCore();
    await core.redis.sadd('amp:hookdedup:s', 's1', 's2');
    const out = await claudeUserPrompt(core, { session_id: 's', cwd: dir, prompt: 'again' });
    expect(out).toEqual({});
  });
});

describe('claude pre-compact', () => {
  it('snapshots working_state and returns {}', async () => {
    const { core, inserts } = makeCore();
    const out = await claudePreCompact(core, { session_id: 's', cwd: dir, trigger: 'auto' });
    expect(out).toEqual({});
    expect(inserts.length).toBe(1);
    expect((inserts[0] as unknown[])[1]).toBe('working_state');
  });
});

describe('claude session-end', () => {
  it('stores a session summary derived from transcript prompts', async () => {
    const { core, stores } = makeCore();
    const readTranscript = vi.fn(() => ['first task', 'second task']);
    const out = await claudeSessionEnd(core, { session_id: 's', cwd: dir, transcript_path: '/x', reason: 'clear' }, readTranscript);
    expect(out).toEqual({});
    expect(stores.length).toBe(1);
    expect((stores[0] as any).content).toContain('first task');
    expect((stores[0] as any).tags).toContain('session-summary');
  });

  it('stores nothing when there is no transcript', async () => {
    const { core, stores } = makeCore();
    await claudeSessionEnd(core, { session_id: 's', cwd: dir }, () => []);
    expect(stores.length).toBe(0);
  });
});
