// packages/core/src/config/settings.ts
//
// A small persisted settings store that the hook CLI processes read live and
// the wiki settings UI writes. Hooks run as fresh short-lived processes, so a
// file is the only way the UI can influence them without a restart.
//
// File: $AMP_SETTINGS_PATH or ~/.config/amp/settings.json
//
// Resolution precedence for any tunable: explicit env var > settings file >
// built-in default. Env still wins so ops can override per-process; the file is
// the UI's channel for everything else.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface HookSettings {
  /** Per-turn UserPromptSubmit load budget (ms). Critical path — keep tight. */
  timeoutMs: number;
  /** Token budget for per-turn injected context. */
  turnTokens: number;
  /** SessionStart load budget (ms). Off the critical path — generous. */
  sessionTimeoutMs: number;
}

export interface AmpSettings {
  hooks: HookSettings;
}

export const DEFAULT_SETTINGS: AmpSettings = {
  hooks: {
    timeoutMs: 800,
    turnTokens: 1500,
    sessionTimeoutMs: 8000,
  },
};

export function getSettingsPath(): string {
  const override = process.env['AMP_SETTINGS_PATH'];
  if (override && override.trim() !== '') return override;
  return path.join(os.homedir(), '.config', 'amp', 'settings.json');
}

/** Deep-merge a partial onto the defaults (one level deep — our schema is shallow). */
function mergeDefaults(partial: Partial<AmpSettings> | null): AmpSettings {
  return {
    hooks: { ...DEFAULT_SETTINGS.hooks, ...(partial?.hooks ?? {}) },
  };
}

/**
 * Read the raw on-disk settings (the partial actually written), or null if no
 * file exists / it is unreadable. Use this when you need to distinguish a value
 * that came from the file from one that is just the built-in default.
 */
export function loadRawSettings(): Partial<AmpSettings> | null {
  try {
    const file = getSettingsPath();
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<AmpSettings>;
  } catch {
    return null;
  }
}

/** Load settings, returning defaults on any missing/corrupt file. Never throws. */
export function loadSettings(): AmpSettings {
  return mergeDefaults(loadRawSettings());
}

/** Merge a patch into the current settings and persist. Returns the new settings. */
export function saveSettings(patch: Partial<AmpSettings>): AmpSettings {
  const current = loadSettings();
  const next: AmpSettings = {
    hooks: { ...current.hooks, ...(patch.hooks ?? {}) },
  };
  const file = getSettingsPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
  return next;
}

/** Where a resolved value came from — surfaced in the UI status panel. */
export type SettingSource = 'env' | 'file' | 'default';

export interface ResolvedNumber {
  value: number;
  source: SettingSource;
}

/** Resolve a numeric tunable: env var > settings file value > default. */
export function resolveNumber(envVar: string, fileValue: number, def: number): ResolvedNumber {
  const raw = Number(process.env[envVar]);
  if (Number.isFinite(raw) && raw > 0) return { value: raw, source: 'env' };
  if (Number.isFinite(fileValue) && fileValue > 0) return { value: fileValue, source: 'file' };
  return { value: def, source: 'default' };
}
