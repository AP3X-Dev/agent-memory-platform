// packages/core/src/cli/adapters/materialized.ts
//
// Materialized adapter for agents that only read a static context file at
// startup (Codex → AGENTS.md, Hermes → .hermes.md/AGENTS.md). There is
// no dynamic hook callback, so `memberry context materialize` writes MemBerry's load
// output into a fenced managed block that the agent picks up for free. This is
// session-start-equivalent injection only; the rendered header shows the refresh
// time so staleness is visible.

import fs from 'node:fs';
import path from 'node:path';
import type { CoreServices } from '../../services-factory.js';
import type { LoadScope } from '../../types.js';
import { safeLoad, hookTimeoutMs } from '../../hooks/safe-load.js';
import { resolveProjectScope } from '../project-scope.js';
import { replaceManagedBlock } from '../managed-block.js';

export type MaterializeAgent = 'codex' | 'hermes';

// Candidate context files per agent, in priority order. We deliberately exclude
// CLAUDE.md: it holds the MemBerry Memory config and is read by Claude too, so we must
// not inject our managed block there. For Hermes ("first match wins":
// .hermes.md → AGENTS.md → CLAUDE.md) we target .hermes.md/AGENTS.md so an
// existing AGENTS.md is appended-to (and still read) rather than shadowed.
const TARGETS: Record<MaterializeAgent, string[]> = {
  codex: ['AGENTS.md'],
  hermes: ['.hermes.md', 'AGENTS.md'],
};

/** The file we create when none of the candidates exist yet. */
const DEFAULT_TARGET: Record<MaterializeAgent, string> = {
  codex: 'AGENTS.md',
  hermes: '.hermes.md',
};

export interface MaterializeOptions {
  agent: MaterializeAgent;
  cwd?: string;
  /** Explicit target file (absolute or relative to cwd). Overrides resolution. */
  file?: string;
  /** Seed task for the load (defaults to a generic session-start task). */
  task?: string;
  maxTokens?: number;
  /** Reserved for Hermes per-directory materialization (not yet implemented). */
  perDir?: boolean;
  /** Override the project tag instead of resolving it from CLAUDE.md. */
  scopeTag?: string;
  /** Injected clock for deterministic tests. */
  now?: () => Date;
}

export interface MaterializeResult {
  file: string;
  scope: string;
  /** false when MemBerry was unavailable and an empty/placeholder block was written. */
  loaded: boolean;
  bytes: number;
}

/** Resolve which file to write the managed block into. */
export function resolveTargetFile(agent: MaterializeAgent, cwd: string, explicit?: string): string {
  if (explicit) return path.isAbsolute(explicit) ? explicit : path.join(cwd, explicit);
  for (const candidate of TARGETS[agent]) {
    const full = path.join(cwd, candidate);
    if (fs.existsSync(full)) return full;
  }
  return path.join(cwd, DEFAULT_TARGET[agent]);
}

function renderBody(markdown: string | null, scopeTag: string, now: Date): string {
  const header = `## Memory Context (MemBerry)\n_Refreshed: ${now.toISOString()}; scope: ${scopeTag}_`;
  if (!markdown || markdown.trim() === '') {
    return `${header}\n\n_No memory context available (MemBerry unreachable or empty)._`;
  }
  return `${header}\n\n${markdown.trim()}`;
}

export async function materializeContext(
  core: CoreServices,
  opts: MaterializeOptions,
): Promise<MaterializeResult> {
  if (opts.perDir) {
    throw new Error('--per-dir materialization is not yet implemented (reserved for Hermes progressive discovery).');
  }
  const cwd = opts.cwd ?? process.cwd();
  const now = (opts.now ?? (() => new Date()))();
  const resolved = resolveProjectScope(cwd);
  const scopeInfo = { ...resolved, tag: opts.scopeTag ?? resolved.tag };
  const file = resolveTargetFile(opts.agent, cwd, opts.file);

  const scope: LoadScope = {
    task: opts.task ?? 'Session start: load project context and conventions.',
    entities: scopeInfo.entities.length ? scopeInfo.entities : undefined,
    tags: [scopeInfo.tag],
    max_tokens: opts.maxTokens,
  };

  // Materialize is not on a turn's critical path, so give it more headroom than
  // a synchronous hook would get.
  const ctx = await safeLoad(core.ampService, scope, Math.max(hookTimeoutMs(), 5000));

  const body = renderBody(ctx?.markdown ?? null, scopeInfo.tag, now);
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
  const updated = replaceManagedBlock(existing, body);
  fs.writeFileSync(file, updated, 'utf-8');

  return { file, scope: scopeInfo.tag, loaded: !!ctx, bytes: Buffer.byteLength(updated) };
}
