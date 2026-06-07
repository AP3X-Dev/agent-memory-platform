// packages/core/src/config/status.ts
//
// Read-only view of MemBerry's effective configuration, for the wiki settings panel.
// Hook tuning is live-resolved (env > file > default) and editable via the UI.
// The server block reflects values baked into the MCP bootstrap (applied on
// restart) plus two env-derived runtime facts — surfaced for visibility, not
// yet editable from the UI.

import { loadRawSettings, resolveNumber, readEnv, getSettingsPath, DEFAULT_SETTINGS, type HookSettings, type ResolvedNumber } from './settings.js';

export interface ConfigStatus {
  settingsPath: string;
  hookTuning: {
    timeoutMs: ResolvedNumber;
    turnTokens: ResolvedNumber;
    sessionTimeoutMs: ResolvedNumber;
  };
  server: {
    editable: false;
    cacheTTLSeconds: { default: number; context: number; embedding: number };
    consolidation: { autoApply: boolean; signalThreshold: number };
    decayHalfLivesDays: { volatile: number; stable: number; permanent: number };
    requireProjectTag: boolean;
    embeddings: 'openai' | 'zero-vector';
  };
}

export function getConfigStatus(): ConfigStatus {
  // Use the RAW file (not merged defaults) so source attribution can tell a
  // file-provided value apart from a built-in default.
  const raw: Partial<HookSettings> = loadRawSettings()?.hooks ?? {};
  const fileVal = (v: number | undefined): number => (typeof v === 'number' ? v : NaN);
  return {
    settingsPath: getSettingsPath(),
    hookTuning: {
      timeoutMs: resolveNumber('MEMBERRY_HOOK_TIMEOUT_MS', fileVal(raw.timeoutMs), DEFAULT_SETTINGS.hooks.timeoutMs),
      turnTokens: resolveNumber('MEMBERRY_HOOK_TURN_TOKENS', fileVal(raw.turnTokens), DEFAULT_SETTINGS.hooks.turnTokens),
      sessionTimeoutMs: resolveNumber('MEMBERRY_HOOK_SESSION_TIMEOUT_MS', fileVal(raw.sessionTimeoutMs), DEFAULT_SETTINGS.hooks.sessionTimeoutMs),
    },
    server: {
      editable: false,
      // Bootstrap defaults (packages/mcp/src/bootstrap.ts) — applied on server restart.
      cacheTTLSeconds: { default: 300, context: 300, embedding: 86400 },
      consolidation: { autoApply: false, signalThreshold: 3 },
      decayHalfLivesDays: { volatile: 14, stable: 90, permanent: 365 },
      // Live, env-derived (the wiki service shares the MCP server's env file).
      requireProjectTag: readEnv('MEMBERRY_REQUIRE_PROJECT_TAG') !== 'false',
      embeddings: (process.env['OPENAI_API_KEY'] ?? '').trim() ? 'openai' : 'zero-vector',
    },
  };
}
