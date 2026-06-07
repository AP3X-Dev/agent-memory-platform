// packages/core/src/cli/hook.ts
//
// `memberry hook <agent> <event>` — the harness-driven entry point. Reads the hook
// payload as JSON on stdin, dispatches to the agent adapter, and writes the
// adapter's output JSON on stdout. ALWAYS exits 0 with at least `{}` so a hook
// can never block or fail the user's turn.

import { createCoreServices } from '../services-factory.js';
import {
  claudeSessionStart,
  claudeUserPrompt,
  claudePreCompact,
  claudeSessionEnd,
  type ClaudeHookEvent,
  type ClaudeHookInput,
} from './adapters/claude.js';

const CLAUDE_EVENTS: ClaudeHookEvent[] = ['session-start', 'user-prompt', 'pre-compact', 'session-end'];

/** Read all of stdin as a string. Returns '' immediately if stdin is a TTY. */
function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    let data = '';
    let settled = false;
    const done = (): void => {
      if (settled) return;
      settled = true;
      resolve(data);
    };
    // Guard against a stdin that never closes.
    const guard = setTimeout(done, 1000);
    guard.unref?.();
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => { clearTimeout(guard); done(); });
    process.stdin.on('error', () => { clearTimeout(guard); done(); });
  });
}

async function dispatchClaude(
  event: ClaudeHookEvent,
  input: ClaudeHookInput,
): Promise<Record<string, unknown>> {
  const core = createCoreServices();
  try {
    switch (event) {
      case 'session-start': return await claudeSessionStart(core, input);
      case 'user-prompt': return await claudeUserPrompt(core, input);
      case 'pre-compact': return await claudePreCompact(core, input);
      case 'session-end': return await claudeSessionEnd(core, input);
    }
  } finally {
    await core.close();
  }
}

/** Entry: argv is everything after `memberry hook`, i.e. [agent, event]. */
export async function runHookCommand(argv: string[]): Promise<void> {
  const [agent, event] = argv;
  let output: Record<string, unknown> = {};

  try {
    const raw = await readStdin();
    const input = raw.trim() ? (JSON.parse(raw) as ClaudeHookInput) : {};

    if (agent === 'claude') {
      if (CLAUDE_EVENTS.includes(event as ClaudeHookEvent)) {
        output = await dispatchClaude(event as ClaudeHookEvent, input);
      } else {
        process.stderr.write(`[amp-hook] unknown claude event: ${event}\n`);
      }
    } else {
      process.stderr.write(`[amp-hook] unknown agent: ${agent} (expected: claude)\n`);
    }
  } catch (err) {
    // Fail-open: log to stderr, emit empty context, exit 0.
    process.stderr.write(`[amp-hook] error: ${err instanceof Error ? err.message : String(err)}\n`);
    output = {};
  }

  process.stdout.write(JSON.stringify(output));
}
