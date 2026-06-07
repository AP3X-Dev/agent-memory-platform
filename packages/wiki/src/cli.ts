#!/usr/bin/env node
// packages/wiki/src/cli.ts
// Wiki CLI -- compile, serve, lint commands.
// Usage: npx tsx packages/wiki/src/cli.ts <command> [options]

import { readFile } from 'node:fs/promises';
import { createNeo4jDriver } from '@memberry/neo4j';
import { WikiCompiler } from './compile.js';
import { initWikiSchema } from './ingest.js';
import { WikiLinter } from './lint.js';
import { startWikiViewer } from './viewer.js';
import { WikiEditReconciler, parseFrontmatter } from './reconcile.js';

// ─── Arg parsing ──────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): {
  command: string;
  flags: Record<string, string | boolean>;
} {
  const [, , command = '', ...rest] = argv;
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    }
  }

  return { command, flags };
}

// ─── Environment ──────────────────────────────────────────────────────────────

const neo4jUri = process.env['NEO4J_URI'] ?? 'bolt://localhost:7687';
const neo4jUser = process.env['NEO4J_USER'] ?? 'neo4j';
const neo4jPassword = process.env['NEO4J_PASSWORD'] ?? '';

// ─── Commands ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv);

  if (!command || command === 'help') {
    console.log(`Usage: wiki-cli <command> [options]

Commands:
  compile   Compile the knowledge graph into wiki markdown
  serve     Start the wiki viewer HTTP server (editable round-trip enabled)
  lint      Run health checks on the knowledge graph
  build     Compile + start viewer (combined)
  sync      Reconcile a human-edited wiki file back into the graph

Options:
  --output    Output directory (default: /home/cerebro/projects/amp/wiki)
  --port      Viewer port (default: 3200)
  --project   Project tag for compile/lint/sync (default compile: all)
  --file      Edited markdown file to reconcile (sync)
`);
    process.exit(0);
  }

  const driver = createNeo4jDriver(neo4jUri, neo4jUser, neo4jPassword);

  try {
    await driver.getServerInfo();
    console.error('[wiki-cli] Neo4j connected');

    await initWikiSchema(driver);

    const outputDir = (flags['output'] as string) ?? '/home/cerebro/projects/amp/wiki';
    const port = parseInt((flags['port'] as string) ?? '3200', 10);
    const projectTag = (flags['project'] as string) ?? 'all';

    switch (command) {
      case 'compile': {
        const compiler = new WikiCompiler(driver);
        console.error('[wiki-cli] Compiling wiki...');

        const result = await compiler.compile(outputDir, projectTag);

        console.error(`[wiki-cli] Done.`);
        console.error(`  Projects:       ${result.projects_compiled}`);
        console.error(`  Articles:       ${result.articles_compiled}`);
        console.error(`  Episodics:      ${result.episodics_rendered}`);
        console.error(`  Library pages:  ${result.library_pages}`);
        console.error(`  Topic pages:    ${result.topic_pages}`);
        console.error(`  Cross-project:  ${result.cross_project_pages}`);
        console.error(`  Output:         ${result.output_dir}`);
        break;
      }

      case 'serve': {
        await startWikiViewer({
          port,
          wiki_dir: outputDir,
          project_tag: 'all',
          driver,
        });
        console.error(`[wiki-cli] Viewer running at http://0.0.0.0:${port}`);
        // Keep process alive
        await new Promise(() => {});
        break;
      }

      case 'sync': {
        // Reconcile a human-edited wiki file back into the graph.
        const file = (flags['file'] as string) ?? (flags['_'] as string);
        if (!file) {
          console.error('[wiki-cli] --file <path> required for sync');
          process.exit(1);
        }
        const editedMd = await readFile(file, 'utf-8');
        const fm = parseFrontmatter(editedMd);
        const tag = (flags['project'] as string)
          ?? fm.tags.find((t) => t.startsWith('project:'))
          ?? 'project:unscoped';
        const reconciler = new WikiEditReconciler(driver);
        const result = await reconciler.reconcile({ project_tag: tag, edited_md: editedMd, driver });
        console.error(`[wiki-cli] Synced ${file}: ${result.corrected} corrected, ${result.added} added (no removals without original).`);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case 'lint': {
        const lintProjectTag = flags['project'] as string;
        if (!lintProjectTag) {
          console.error('[wiki-cli] --project required for lint');
          process.exit(1);
        }

        const linter = new WikiLinter(driver);
        const checks = flags['checks']
          ? (flags['checks'] as string).split(',') as any[]
          : undefined;

        const result = await linter.lint({
          project_tag: lintProjectTag,
          checks,
        });
        console.log(result.summary);
        console.log(`Total issues: ${result.total_issues}`);
        break;
      }

      case 'build': {
        // Compile then serve
        const compiler = new WikiCompiler(driver);
        console.error('[wiki-cli] Compiling wiki...');

        const result = await compiler.compile(outputDir, projectTag);

        console.error(`[wiki-cli] Compiled: ${result.projects_compiled} projects, ${result.articles_compiled} articles`);

        await startWikiViewer({
          port,
          wiki_dir: outputDir,
          project_tag: 'all',
          driver,
        });
        console.error(`[wiki-cli] Viewer running at http://0.0.0.0:${port}`);
        await new Promise(() => {});
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } finally {
    await driver.close();
  }
}

main().catch((err) => {
  console.error('[wiki-cli] Fatal:', err);
  process.exit(1);
});
