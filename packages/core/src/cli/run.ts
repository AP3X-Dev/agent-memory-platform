// packages/core/src/cli/run.ts
//
// `amp run --agent codex|hermes -- <cmd...>` — the zero-staleness launcher. It
// re-materializes the managed context block, then execs the wrapped command so
// the agent reads fresh memory at startup. The default refresh trigger for
// materialized agents.

import { spawn } from 'node:child_process';
import { createCoreServices } from '../services-factory.js';
import { materializeContext, type MaterializeAgent } from './adapters/materialized.js';

type Flags = Record<string, string | boolean>;

/**
 * Entry. `rest` is the full argv after `amp run`; everything after `--` is the
 * wrapped command. We re-parse here (rather than the shared flag parser) so the
 * wrapped command's own flags are not swallowed.
 */
export async function runRunCommand(rest: string[]): Promise<void> {
  const sepIdx = rest.indexOf('--');
  const before = sepIdx === -1 ? rest : rest.slice(0, sepIdx);
  const command = sepIdx === -1 ? [] : rest.slice(sepIdx + 1);

  const flags: Flags = {};
  for (let i = 0; i < before.length; i++) {
    if (before[i].startsWith('--')) {
      const key = before[i].slice(2);
      const next = before[i + 1];
      if (next !== undefined && !next.startsWith('--')) { flags[key] = next; i++; }
      else flags[key] = true;
    }
  }

  const agent = flags['agent'];
  if (agent !== 'codex' && agent !== 'hermes') {
    console.error('Usage: amp run --agent codex|hermes -- <command> [args...]');
    process.exit(1);
  }
  if (command.length === 0) {
    console.error('amp run: no command after `--` to launch.');
    process.exit(1);
  }

  // Refresh the block (best-effort — never block the launch on MemBerry).
  try {
    const core = createCoreServices();
    try {
      await materializeContext(core, { agent: agent as MaterializeAgent });
    } finally {
      await core.close();
    }
  } catch (err) {
    process.stderr.write(`[amp-run] context refresh skipped: ${err instanceof Error ? err.message : String(err)}\n`);
  }

  // Exec the wrapped command, inheriting stdio; propagate its exit code.
  const child = spawn(command[0], command.slice(1), { stdio: 'inherit' });
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });
  child.on('error', (err) => {
    process.stderr.write(`[amp-run] failed to launch ${command[0]}: ${err.message}\n`);
    process.exit(127);
  });
}
