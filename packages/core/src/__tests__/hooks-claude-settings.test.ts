// packages/core/src/__tests__/hooks-claude-settings.test.ts
import { describe, it, expect } from 'vitest';
import {
  addAmpHooks,
  removeAmpHooks,
  ampHookStatus,
  AMP_HOOK_EVENTS,
  type ClaudeSettings,
} from '../cli/config/claude-settings.js';

const CMD = 'npx tsx /abs/cli.ts';

describe('claude settings merge', () => {
  it('adds an AMP group for each lifecycle event', () => {
    const out = addAmpHooks({}, CMD);
    for (const [event, sub] of Object.entries(AMP_HOOK_EVENTS)) {
      const groups = out.hooks?.[event] ?? [];
      expect(groups.length).toBe(1);
      expect(groups[0].hooks[0].command).toBe(`${CMD} hook claude ${sub}`);
    }
  });

  it('preserves pre-existing non-AMP hooks', () => {
    const existing: ClaudeSettings = {
      hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'echo hi' }] }] },
      otherSetting: 42,
    };
    const out = addAmpHooks(existing, CMD);
    expect(out.otherSetting).toBe(42);
    const ss = out.hooks!.SessionStart;
    expect(ss.some((g) => g.hooks[0].command === 'echo hi')).toBe(true);
    expect(ss.some((g) => g._amp)).toBe(true);
  });

  it('is idempotent: adding twice yields one AMP group per event', () => {
    const once = addAmpHooks({}, CMD);
    const twice = addAmpHooks(once, CMD);
    for (const event of Object.keys(AMP_HOOK_EVENTS)) {
      expect(twice.hooks![event].filter((g) => g._amp).length).toBe(1);
    }
  });

  it('round-trips: install then uninstall restores the original', () => {
    const original: ClaudeSettings = {
      hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'echo hi' }] }] },
    };
    const installed = addAmpHooks(original, CMD);
    const removed = removeAmpHooks(installed);
    expect(removed).toEqual(original);
  });

  it('uninstall on an AMP-only file drops the hooks key entirely', () => {
    const removed = removeAmpHooks(addAmpHooks({}, CMD));
    expect(removed.hooks).toBeUndefined();
  });

  it('status reports the AMP-owned events', () => {
    expect(ampHookStatus(addAmpHooks({}, CMD)).sort()).toEqual(Object.keys(AMP_HOOK_EVENTS).sort());
    expect(ampHookStatus({})).toEqual([]);
  });
});
