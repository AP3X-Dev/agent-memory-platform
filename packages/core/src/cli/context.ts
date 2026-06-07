// packages/core/src/cli/context.ts
//
// `amp context materialize` — write/refresh the managed MemBerry block in a static
// agent context file (AGENTS.md / .hermes.md). Used by Codex and Hermes, which
// have no dynamic hook callback.

import { createCoreServices } from '../services-factory.js';
import { materializeContext, type MaterializeAgent } from './adapters/materialized.js';

type Flags = Record<string, string | boolean>;

function asAgent(value: string | boolean | undefined): MaterializeAgent {
  if (value === 'codex' || value === 'hermes') return value;
  throw new Error("context materialize requires --agent codex|hermes");
}

export async function runContextCommand(sub: string, flags: Flags): Promise<void> {
  if (sub !== 'materialize') {
    console.error('Usage: amp context materialize --agent codex|hermes [--file PATH] [--scope project:x] [--task "..."] [--max-tokens N] [--per-dir]');
    process.exit(1);
  }

  const agent = asAgent(flags['agent'] as string | undefined);
  const file = typeof flags['file'] === 'string' ? flags['file'] : undefined;
  const scopeTag = typeof flags['scope'] === 'string' ? flags['scope'] : undefined;
  const task = typeof flags['task'] === 'string' ? flags['task'] : undefined;
  const maxTokens = typeof flags['max-tokens'] === 'string' ? Number(flags['max-tokens']) : undefined;
  const perDir = flags['per-dir'] === true;

  const core = createCoreServices();
  try {
    const result = await materializeContext(core, { agent, file, scopeTag, task, maxTokens, perDir });
    console.log(
      `Materialized MemBerry context → ${result.file}\n  scope: ${result.scope}  loaded: ${result.loaded}  bytes: ${result.bytes}`,
    );
    if (!result.loaded) {
      console.error('Warning: MemBerry was unreachable; wrote a placeholder block. Re-run once MemBerry is up.');
    }
  } finally {
    await core.close();
  }
}
