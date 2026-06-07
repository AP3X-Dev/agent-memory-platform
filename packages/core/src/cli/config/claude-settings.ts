// packages/core/src/cli/config/claude-settings.ts
//
// Pure merge/strip logic for MemBerry's entries in a Claude Code settings.json
// `hooks` map. MemBerry-owned hook groups are tagged with `_amp: true` so uninstall
// is precise and existing user hooks are never touched. No I/O here.

export interface HookCommand {
  type: 'command';
  command: string;
  timeout?: number;
}

export interface HookGroup {
  matcher?: string;
  hooks: HookCommand[];
  /** MemBerry ownership marker (ignored by Claude Code). */
  _amp?: boolean;
}

export interface ClaudeSettings {
  hooks?: Record<string, HookGroup[]>;
  [key: string]: unknown;
}

/** Hook event name → `amp hook claude <event>` subcommand. */
export const AMP_HOOK_EVENTS: Record<string, string> = {
  SessionStart: 'session-start',
  UserPromptSubmit: 'user-prompt',
  PreCompact: 'pre-compact',
  SessionEnd: 'session-end',
};

const isAmpGroup = (g: HookGroup): boolean => g._amp === true || g.hooks?.some((h) => h.command?.includes('amp hook claude'));

/**
 * Insert (or refresh) MemBerry's hook groups, returning a new settings object.
 * `command` is the base CLI invocation, e.g. `node /abs/cli.js`. Idempotent.
 */
export function addAmpHooks(settings: ClaudeSettings, command: string): ClaudeSettings {
  const hooks: Record<string, HookGroup[]> = { ...(settings.hooks ?? {}) };
  for (const [event, sub] of Object.entries(AMP_HOOK_EVENTS)) {
    const existing = (hooks[event] ?? []).filter((g) => !isAmpGroup(g));
    const group: HookGroup = {
      _amp: true,
      hooks: [{ type: 'command', command: `${command} hook claude ${sub}` }],
    };
    hooks[event] = [...existing, group];
  }
  return { ...settings, hooks };
}

/** Remove all MemBerry-owned hook groups, dropping now-empty event keys. */
export function removeAmpHooks(settings: ClaudeSettings): ClaudeSettings {
  if (!settings.hooks) return settings;
  const hooks: Record<string, HookGroup[]> = {};
  for (const [event, groups] of Object.entries(settings.hooks)) {
    const kept = groups.filter((g) => !isAmpGroup(g));
    if (kept.length) hooks[event] = kept;
  }
  const next: ClaudeSettings = { ...settings, hooks };
  if (Object.keys(hooks).length === 0) delete next.hooks;
  return next;
}

/** List the Claude events MemBerry currently owns in a settings object. */
export function ampHookStatus(settings: ClaudeSettings): string[] {
  if (!settings.hooks) return [];
  return Object.entries(settings.hooks)
    .filter(([, groups]) => groups.some(isAmpGroup))
    .map(([event]) => event);
}
