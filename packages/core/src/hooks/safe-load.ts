// packages/core/src/hooks/safe-load.ts
//
// Fail-open wrapper around AMPService.load for use in agent hooks. A hook that
// injects memory context MUST NEVER block or fail the user's turn: if AMP is
// slow or down, we return null and the caller emits empty context (exit 0).
//
// The default timeout is intentionally short — a synchronous hook (e.g. Claude
// UserPromptSubmit) runs on the critical path of every turn, so it relies on the
// Redis-cached load path and gives up fast rather than stalling the agent.

import type { LoadScope, MemoryContext } from '../types.js';
import { loadSettings, resolveNumber } from '../config/settings.js';

/** Minimal shape of the service we need — keeps this dependency-light/testable. */
export interface LoadCapable {
  load(scope: LoadScope): Promise<MemoryContext>;
}

export const DEFAULT_HOOK_TIMEOUT_MS = 800;

/**
 * Resolve the per-turn hook timeout. Precedence: AMP_HOOK_TIMEOUT_MS env >
 * settings file (set via the wiki settings UI) > default. Clamped to a floor.
 */
export function hookTimeoutMs(): number {
  const { hooks } = loadSettings();
  return Math.max(50, resolveNumber('AMP_HOOK_TIMEOUT_MS', hooks.timeoutMs, DEFAULT_HOOK_TIMEOUT_MS).value);
}

/**
 * Load context, returning null instead of throwing on timeout or any error.
 * Logs failures to stderr (never stdout — stdout is the hook's protocol channel).
 */
export async function safeLoad(
  service: LoadCapable,
  scope: LoadScope,
  timeoutMs: number = hookTimeoutMs(),
): Promise<MemoryContext | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    const result = await Promise.race([service.load(scope), timeout]);
    return result ?? null;
  } catch (err) {
    process.stderr.write(
      `[amp-hook] load failed, continuing with empty context: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
