// packages/core/src/config/settings.ts
//
// A small persisted settings store that the hook CLI processes read live and
// the wiki settings UI writes. Hooks run as fresh short-lived processes, so a
// file is the only way the UI can influence them without a restart.
//
// File: $MEMBERRY_SETTINGS_PATH (legacy $AMP_SETTINGS_PATH) or
//       ~/.config/memberry/settings.json (legacy ~/.config/amp/settings.json)
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

const warnedLegacyEnv = new Set<string>();

/**
 * Read an env var by its canonical MEMBERRY_ name, falling back to the legacy
 * AMP_ name for one deprecation cycle after the rebrand. The new name always
 * wins; the first use of a legacy name emits a one-time deprecation warning.
 * Empty strings are treated as unset so a blank override doesn't mask a real
 * legacy value.
 */
export function readEnv(canonical: string): string | undefined {
  const direct = process.env[canonical];
  if (direct !== undefined && direct !== '') return direct;
  if (canonical.startsWith('MEMBERRY_')) {
    const legacy = `AMP_${canonical.slice('MEMBERRY_'.length)}`;
    const old = process.env[legacy];
    if (old !== undefined && old !== '') {
      if (!warnedLegacyEnv.has(legacy)) {
        warnedLegacyEnv.add(legacy);
        console.error(`[memberry] env ${legacy} is deprecated; rename it to ${canonical}.`);
      }
      return old;
    }
  }
  return undefined;
}

export function getSettingsPath(): string {
  const override = readEnv('MEMBERRY_SETTINGS_PATH');
  if (override && override.trim() !== '') return override;
  const home = os.homedir();
  const canonical = path.join(home, '.config', 'memberry', 'settings.json');
  // Dual-read: prefer the canonical ~/.config/memberry path, fall back to the
  // legacy ~/.config/amp location so machines that haven't migrated keep
  // reading their existing settings. New writes always go to the canonical path.
  if (!fs.existsSync(canonical)) {
    const legacy = path.join(home, '.config', 'amp', 'settings.json');
    if (fs.existsSync(legacy)) return legacy;
  }
  return canonical;
}

/**
 * Default on-disk memory-export directory. Prefers the canonical `./.memberry`
 * when present, falling back to the legacy `./.amp` for checkouts that predate
 * the rename. Relative to the process CWD — services set WorkingDirectory to
 * the repo root, so this resolves against the project directory.
 */
export function defaultExportPath(): string {
  return fs.existsSync('./.memberry') ? './.memberry' : './.amp';
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
  const raw = Number(readEnv(envVar));
  if (Number.isFinite(raw) && raw > 0) return { value: raw, source: 'env' };
  if (Number.isFinite(fileValue) && fileValue > 0) return { value: fileValue, source: 'file' };
  return { value: def, source: 'default' };
}
