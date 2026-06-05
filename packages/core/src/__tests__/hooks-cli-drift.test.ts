// packages/core/src/__tests__/hooks-cli-drift.test.ts
//
// Drift guard: keep the CLI router, the documented hook verbs, and the adapter
// surface in sync. Mirrors the spirit of the agent-facing-docs drift guard —
// if someone adds a documented event without wiring it (or vice versa), this
// fails instead of shipping a dead hook.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { AMP_HOOK_EVENTS } from '../cli/config/claude-settings.js';
import * as claude from '../cli/adapters/claude.js';

const cliSource = fs.readFileSync(path.resolve(__dirname, '../cli.ts'), 'utf-8');

describe('hooks CLI drift guard', () => {
  it('routes every new top-level command', () => {
    for (const token of ["case 'hook'", "case 'context'", "case 'hooks'", "=== 'run'"]) {
      expect(cliSource, `cli.ts must handle ${token}`).toContain(token);
    }
  });

  it('Claude install wires exactly the four lifecycle events', () => {
    expect(Object.keys(AMP_HOOK_EVENTS).sort()).toEqual(
      ['PreCompact', 'SessionEnd', 'SessionStart', 'UserPromptSubmit'],
    );
  });

  it('every wired event has a corresponding adapter export', () => {
    const handlers: Record<string, unknown> = {
      'session-start': claude.claudeSessionStart,
      'user-prompt': claude.claudeUserPrompt,
      'pre-compact': claude.claudePreCompact,
      'session-end': claude.claudeSessionEnd,
    };
    for (const sub of Object.values(AMP_HOOK_EVENTS)) {
      expect(typeof handlers[sub], `missing adapter for ${sub}`).toBe('function');
    }
  });
});
