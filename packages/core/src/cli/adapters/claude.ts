// packages/core/src/cli/adapters/claude.ts
//
// Live adapter for Claude Code hooks. Each function takes the parsed hook stdin
// payload + the core services and returns the JSON object Claude expects on
// stdout. Load hooks inject memory via `hookSpecificOutput.additionalContext`.
// Everything here is fail-open: a thrown error must never block the turn, so the
// CLI layer that calls these wraps them and falls back to `{}`.

import fs from 'node:fs';
import type { CoreServices } from '../../services-factory.js';
import type { LoadScope } from '../../types.js';
import { safeLoad, hookTimeoutMs } from '../../hooks/safe-load.js';
import { resolveProjectScope } from '../project-scope.js';
import { loadSettings, resolveNumber } from '../../config/settings.js';

// SessionStart runs once per session, off the per-turn critical path, so it gets
// generous headroom (cold process start + first DB connect). Never below the
// per-turn budget. Precedence: env > settings file (wiki UI) > default.
function sessionStartTimeoutMs(): number {
  const { hooks } = loadSettings();
  const resolved = resolveNumber('AMP_HOOK_SESSION_TIMEOUT_MS', hooks.sessionTimeoutMs, 8000).value;
  return Math.max(hookTimeoutMs(), resolved);
}

/** Fields Claude Code sends on stdin (union across events; all optional here). */
export interface ClaudeHookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  hook_event_name?: string;
  source?: string; // SessionStart: startup | resume | clear | compact
  prompt?: string; // UserPromptSubmit
  trigger?: string; // PreCompact: manual | auto
  reason?: string; // SessionEnd
}

export type ClaudeHookEvent =
  | 'session-start'
  | 'user-prompt'
  | 'pre-compact'
  | 'session-end';

const EVENT_NAME: Record<ClaudeHookEvent, string> = {
  'session-start': 'SessionStart',
  'user-prompt': 'UserPromptSubmit',
  'pre-compact': 'PreCompact',
  'session-end': 'SessionEnd',
};

const DEDUP_TTL_SECONDS = 86_400; // 24h, matches the working-memory tier.
const DEFAULT_TURN_TOKENS = 1500;

function dedupKey(sessionId: string): string {
  return `amp:hookdedup:${sessionId}`;
}

/** Build the hook output that injects context, or `{}` to inject nothing. */
function inject(event: ClaudeHookEvent, context: string | null): Record<string, unknown> {
  if (!context || context.trim() === '') return {};
  return {
    hookSpecificOutput: {
      hookEventName: EVENT_NAME[event],
      additionalContext: context,
    },
  };
}

function turnTokenBudget(): number {
  const { hooks } = loadSettings();
  return Math.max(200, resolveNumber('AMP_HOOK_TURN_TOKENS', hooks.turnTokens, DEFAULT_TURN_TOKENS).value);
}

// ─── SessionStart ────────────────────────────────────────────────────────────
// Deterministic floor: load project memory and inject it, regardless of whether
// the model would have called berry_load. Record the injected source ids so the
// per-turn hook can avoid re-injecting the same context.

export async function claudeSessionStart(
  core: CoreServices,
  input: ClaudeHookInput,
): Promise<Record<string, unknown>> {
  const scopeInfo = resolveProjectScope(input.cwd);
  const scope: LoadScope = {
    task: 'Session start: load project context and conventions.',
    entities: scopeInfo.entities.length ? scopeInfo.entities : undefined,
    tags: [scopeInfo.tag],
    session_id: input.session_id,
  };

  const ctx = await safeLoad(core.ampService, scope, sessionStartTimeoutMs());
  if (!ctx) return {};

  if (input.session_id && ctx.sources.length) {
    try {
      const key = dedupKey(input.session_id);
      await core.redis.sadd(key, ...ctx.sources);
      await core.redis.expire(key, DEDUP_TTL_SECONDS);
    } catch {
      // dedup is best-effort; injection still proceeds
    }
  }

  return inject('session-start', ctx.markdown);
}

// ─── UserPromptSubmit ──────────────────────────────────────────────────────
// Per-turn, task-aware injection. Runs synchronously on the turn's critical path
// so it relies on the cached load path + a tight timeout. Injects only when the
// task-scoped load surfaces sources not already injected this session (delta),
// so we don't re-inject the same context every turn.

export async function claudeUserPrompt(
  core: CoreServices,
  input: ClaudeHookInput,
): Promise<Record<string, unknown>> {
  const prompt = (input.prompt ?? '').trim();
  if (prompt === '') return {};

  const scopeInfo = resolveProjectScope(input.cwd);
  const scope: LoadScope = {
    task: prompt,
    entities: scopeInfo.entities.length ? scopeInfo.entities : undefined,
    tags: [scopeInfo.tag],
    max_tokens: turnTokenBudget(),
    session_id: input.session_id,
  };

  const ctx = await safeLoad(core.ampService, scope);
  if (!ctx || ctx.sources.length === 0) return {};

  // Delta check: skip injection if every source was already injected this session.
  if (input.session_id) {
    try {
      const key = dedupKey(input.session_id);
      const seen = new Set(await core.redis.smembers(key));
      const fresh = ctx.sources.filter((s) => !seen.has(s));
      if (fresh.length === 0) return {};
      await core.redis.sadd(key, ...ctx.sources);
      await core.redis.expire(key, DEDUP_TTL_SECONDS);
    } catch {
      // If the dedup store is unavailable, fall through and inject (fail-open).
    }
  }

  return inject('user-prompt', ctx.markdown);
}

// ─── PreCompact ──────────────────────────────────────────────────────────────
// Mechanical only: snapshot a marker into working_state before context is lost.
// No model judgment involved; failures are swallowed.

export async function claudePreCompact(
  core: CoreServices,
  input: ClaudeHookInput,
): Promise<Record<string, unknown>> {
  const scopeInfo = resolveProjectScope(input.cwd);
  try {
    await core.memoryBlocks.insert(
      scopeInfo.tag,
      'working_state',
      `[${new Date().toISOString()}] Context compaction (${input.trigger ?? 'auto'}) — session ${input.session_id ?? 'unknown'}.`,
      input.session_id,
    );
  } catch {
    // best-effort
  }
  return {};
}

// ─── SessionEnd ────────────────────────────────────────────────────────────
// Mechanical session-summary store — the only episodic store fired from a hook.
// Derives a terse summary from the transcript's user prompts; never throws.

export async function claudeSessionEnd(
  core: CoreServices,
  input: ClaudeHookInput,
  readTranscript: (p: string) => string[] = defaultReadTranscriptPrompts,
): Promise<Record<string, unknown>> {
  const scopeInfo = resolveProjectScope(input.cwd);
  try {
    const prompts = input.transcript_path ? readTranscript(input.transcript_path) : [];
    if (prompts.length === 0) return {};
    const first = prompts[0];
    const summary =
      `[${scopeInfo.tag}] Session ${input.session_id ?? 'unknown'} ended (${input.reason ?? 'end'}). ` +
      `${prompts.length} user prompt(s). Opening task: ${truncate(first, 280)}`;
    await core.ampService.store({
      session_id: input.session_id ?? `session-${Date.now()}`,
      agent_id: 'claude-code-hook',
      task: `[${scopeInfo.tag}] Session summary (auto, hook)`,
      content: summary,
      scope: scopeInfo.tag,
      tags: [scopeInfo.tag, 'session-summary', 'hook'],
    });
  } catch {
    // best-effort — a failed summary store must not surface to the user
  }
  return {};
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Extract user-message text from a Claude Code transcript JSONL file. */
export function defaultReadTranscriptPrompts(transcriptPath: string): string[] {
  if (!fs.existsSync(transcriptPath)) return [];
  const lines = fs.readFileSync(transcriptPath, 'utf-8').split('\n').filter(Boolean);
  const prompts: string[] = [];
  for (const line of lines) {
    try {
      const evt = JSON.parse(line) as {
        type?: string;
        message?: { role?: string; content?: unknown };
      };
      if (evt.type === 'user' && evt.message?.role === 'user') {
        const text = extractText(evt.message.content);
        if (text) prompts.push(text);
      }
    } catch {
      // skip malformed lines
    }
  }
  return prompts;
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (b && typeof b === 'object' && 'text' in b ? String((b as { text: unknown }).text) : ''))
      .join(' ')
      .trim();
  }
  return '';
}
