#!/usr/bin/env node
// packages/core/src/cli.ts
// AMP CLI — export, import, snapshot commands.
// Usage: npx amp <command> [options]

import { execFileSync } from 'child_process';
import { createNeo4jDriver } from '@amp/neo4j';
import { createRedisClient } from '@amp/redis';
import { exportAll, exportFiltered } from './export.js';
import { importFromPath, type ImportStrategy } from './import.js';
import { runHookCommand } from './cli/hook.js';
import { runContextCommand } from './cli/context.js';
import { runHooksCommand } from './cli/install.js';
import { runRunCommand } from './cli/run.js';
import { createCoreServices, buildDreamEngine } from './services-factory.js';

// ─── Arg parsing ──────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): {
  command: string;
  positionals: string[];
  flags: Record<string, string | boolean>;
} {
  // argv = ['node', 'cli.ts', 'command', ...rest]
  const [, , command = '', ...rest] = argv;
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i++; // consume value
      } else {
        flags[key] = true;
      }
    } else {
      positionals.push(arg);
    }
  }

  return { command, positionals, flags };
}

// ─── Environment ──────────────────────────────────────────────────────────────

function loadEnv(): {
  neo4jUri: string;
  neo4jUser: string;
  neo4jPassword: string;
  redisUrl: string;
} {
  const neo4jUri = process.env['NEO4J_URI'] ?? 'bolt://localhost:7687';
  const neo4jUser = process.env['NEO4J_USER'] ?? 'neo4j';
  const neo4jPassword = process.env['NEO4J_PASSWORD'] ?? '';
  const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
  return { neo4jUri, neo4jUser, neo4jPassword, redisUrl };
}

// ─── Commands ─────────────────────────────────────────────────────────────────

async function runExport(flags: Record<string, string | boolean>): Promise<void> {
  const exportPath = String(flags['path'] ?? './.amp');
  const entities = flags['entity'] ? [String(flags['entity'])] : [];
  const tags = flags['tag'] ? [String(flags['tag'])] : [];

  const { neo4jUri, neo4jUser, neo4jPassword } = loadEnv();
  const driver = createNeo4jDriver(neo4jUri, neo4jUser, neo4jPassword);

  try {
    console.log(`Exporting to ${exportPath}...`);
    const hasFilter = entities.length > 0 || tags.length > 0;
    const result = hasFilter
      ? await exportFiltered(driver, exportPath, { entities, tags })
      : await exportAll(driver, exportPath);

    console.log(`Export complete: ${result.exported} exported, ${result.skipped} skipped`);
    if (result.errors.length > 0) {
      console.error('Errors:');
      for (const e of result.errors) console.error(`  ${e}`);
    }
  } finally {
    await driver.close();
  }
}

async function runImport(flags: Record<string, string | boolean>): Promise<void> {
  const importPath = String(flags['path'] ?? './.amp');
  const strategy = (flags['strategy'] as ImportStrategy | undefined) ?? 'confidence-weighted';
  const dryRun = flags['dry-run'] === true;

  const { neo4jUri, neo4jUser, neo4jPassword, redisUrl } = loadEnv();
  const driver = createNeo4jDriver(neo4jUri, neo4jUser, neo4jPassword);
  const redis = createRedisClient(redisUrl);

  try {
    console.log(`Importing from ${importPath}${dryRun ? ' (dry-run)' : ''}...`);
    const result = await importFromPath(driver, redis, importPath, { strategy, dryRun });

    console.log('Import complete:');
    console.log(`  added:     ${result.added}`);
    console.log(`  modified:  ${result.modified}`);
    console.log(`  deleted:   ${result.deleted}`);
    console.log(`  unchanged: ${result.unchanged}`);
  } finally {
    await driver.close();
    redis.disconnect();
  }
}

async function runSnapshot(flags: Record<string, string | boolean>): Promise<void> {
  const snapshotPath = String(flags['path'] ?? './.amp');
  const shouldCommit = flags['commit'] === true;
  const message =
    typeof flags['message'] === 'string'
      ? flags['message']
      : `AMP snapshot ${new Date().toISOString().slice(0, 10)}`;

  // 1. Run full export
  await runExport({ path: snapshotPath });

  if (!shouldCommit) return;

  // 2. Stage snapshot changes. The default .amp path is intentionally ignored
  // in source worktrees, so snapshot commits must force-add this explicit path.
  try {
    execFileSync('git', ['add', '-f', snapshotPath], { stdio: 'inherit' });
  } catch (err) {
    console.error('git add failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // 3. Check if there are staged snapshot changes only.
  try {
    execFileSync('git', ['diff', '--cached', '--quiet', '--', snapshotPath], { stdio: 'inherit' });
    // Exit code 0 means no changes
    console.log('No changes to commit — snapshot is already up to date.');
    return;
  } catch (err: unknown) {
    // Non-zero exit = there are staged snapshot changes — proceed with commit.
  }

  // 4. Commit only the snapshot path, preserving any unrelated staged work.
  try {
    execFileSync('git', ['commit', '-m', message, '--', snapshotPath], { stdio: 'inherit' });
    console.log(`Snapshot committed: ${message}`);
  } catch (err) {
    console.error('git commit failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function runDream(flags: Record<string, string | boolean>): Promise<void> {
  const scope = String(flags['scope'] ?? 'project:global');
  const maxEntities = flags['max-entities'] ? Number(flags['max-entities']) : undefined;
  const noCards = flags['no-cards'] === true;

  const core = createCoreServices();
  try {
    if (!core.llm.available) {
      console.error('[dream] no OPENAI_API_KEY configured — nothing to do.');
      return; // nothing to do without an LLM; avoid building the engine + a duplicate log
    }
    const engine = buildDreamEngine(core);
    const result = await engine.run(scope, {
      ...(maxEntities && Number.isFinite(maxEntities) ? { maxEntities } : {}),
      ...(noCards ? { cards: false } : {}),
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await core.close();
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // `run` passes its tail (including `--`) through untouched, so handle it before
  // the shared flag parser swallows the wrapped command's own flags.
  if (process.argv[2] === 'run') {
    await runRunCommand(process.argv.slice(3));
    return;
  }

  const { command, positionals, flags } = parseArgs(process.argv);

  switch (command) {
    case 'export':
      await runExport(flags);
      break;

    case 'import':
      await runImport(flags);
      break;

    case 'snapshot':
      await runSnapshot(flags);
      break;

    case 'dream':
      // `amp dream --scope project:x` — background gap-filling + abductive hypotheses.
      await runDream(flags);
      break;

    case 'hook':
      // `amp hook <agent> <event>` — harness-driven, JSON over stdin/stdout.
      await runHookCommand(positionals);
      break;

    case 'context':
      // `amp context materialize ...`
      await runContextCommand(positionals[0] ?? '', flags);
      break;

    case 'hooks':
      // `amp hooks <install|uninstall|status> ...`
      await runHooksCommand(positionals[0] ?? '', flags);
      break;

    default:
      console.error(`Unknown command: "${command}"`);
      console.error('Usage: amp <command> [options]');
      console.error('');
      console.error('Memory snapshot commands:');
      console.error('  export    [--path ./.amp] [--entity Name] [--tag tag]');
      console.error('  import    [--path ./.amp] [--strategy confidence-weighted|overwrite] [--dry-run]');
      console.error('  snapshot  [--path ./.amp] [--commit] [--message "..."]');
      console.error('');
      console.error('Background memory commands:');
      console.error('  dream     [--scope project:x] [--max-entities N] [--no-cards]');
      console.error('');
      console.error('Agent hook commands:');
      console.error('  hooks install --agent claude|codex|hermes [--scope project|global] [--refresh wrapper|timer] [--with-mcp]');
      console.error('  hooks uninstall --agent claude|codex|hermes [--scope project|global]');
      console.error('  hooks status');
      console.error('  context materialize --agent codex|hermes [--file PATH] [--scope project:x] [--task "..."] [--max-tokens N]');
      console.error('  run --agent codex|hermes -- <command> [args...]');
      console.error('  hook <agent> <event>   (invoked by the harness, not by hand)');
      process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
