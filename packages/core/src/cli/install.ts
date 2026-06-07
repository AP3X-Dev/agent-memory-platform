// packages/core/src/cli/install.ts
//
// `amp hooks install|uninstall|status` — the opt-in switch that wires MemBerry into
// an agent's lifecycle. Claude Code gets settings.json hook entries (live
// adapter); Codex/Hermes get a materialized managed block + a refresh trigger
// (wrapper alias by default, systemd timer optionally).

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createCoreServices } from '../services-factory.js';
import { materializeContext, resolveTargetFile, type MaterializeAgent } from './adapters/materialized.js';
import { stripManagedBlock, hasManagedBlock } from './managed-block.js';
import {
  addAmpHooks,
  removeAmpHooks,
  ampHookStatus,
  type ClaudeSettings,
} from './config/claude-settings.js';

type Flags = Record<string, string | boolean>;
type Agent = 'claude' | MaterializeAgent;

/**
 * The CLI invocation to put in hook commands. Override with --command.
 *
 * This monorepo's workspace packages resolve their `exports` to TS source, so
 * the CLI runs under `tsx`, not bare `node` (the same way the MCP server runs).
 * We therefore default to `npx tsx <abs cli.ts>`, pointing at the source entry
 * even when this installer itself is running from dist.
 */
function resolveCliCommand(flags: Flags): string {
  if (typeof flags['command'] === 'string') return flags['command'];
  const entry = process.argv[1] ?? '';
  const srcEntry = entry.includes(`${path.sep}dist${path.sep}`)
    ? entry.replace(`${path.sep}dist${path.sep}`, `${path.sep}src${path.sep}`).replace(/\.js$/, '.ts')
    : entry;
  return `npx tsx ${srcEntry}`;
}

function claudeSettingsPath(scope: string, cwd: string): string {
  return scope === 'global'
    ? path.join(os.homedir(), '.claude', 'settings.json')
    : path.join(cwd, '.claude', 'settings.json');
}

function readJson(file: string): ClaudeSettings {
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as ClaudeSettings;
  } catch {
    throw new Error(`Existing ${file} is not valid JSON — refusing to overwrite.`);
  }
}

function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

// ─── Claude ──────────────────────────────────────────────────────────────────

function installClaude(scope: string, cwd: string, flags: Flags): void {
  const file = claudeSettingsPath(scope, cwd);
  const settings = readJson(file);
  const command = resolveCliCommand(flags);
  writeJson(file, addAmpHooks(settings, command));
  console.log(`Wired MemBerry hooks into ${file}`);
  console.log(`  events: SessionStart, UserPromptSubmit, PreCompact, SessionEnd`);
  console.log(`  command: ${command} hook claude <event>`);
  console.log('Restart Claude Code (or run /hooks) to load the new hooks.');
}

function uninstallClaude(scope: string, cwd: string): void {
  const file = claudeSettingsPath(scope, cwd);
  if (!fs.existsSync(file)) { console.log(`No settings file at ${file} — nothing to remove.`); return; }
  writeJson(file, removeAmpHooks(readJson(file)));
  console.log(`Removed MemBerry hooks from ${file}`);
}

// ─── Codex / Hermes (materialized) ─────────────────────────────────────────

async function installMaterialized(agent: MaterializeAgent, cwd: string, flags: Flags): Promise<void> {
  const refresh = (typeof flags['refresh'] === 'string' ? flags['refresh'] : 'wrapper') as 'wrapper' | 'timer';
  const core = createCoreServices();
  try {
    const result = await materializeContext(core, { agent, cwd });
    console.log(`Materialized MemBerry context → ${result.file} (scope ${result.scope}, loaded=${result.loaded})`);
  } finally {
    await core.close();
  }

  if (refresh === 'timer') {
    printTimerInstructions(agent, cwd);
  } else {
    const cli = resolveCliCommand(flags);
    console.log('\nRefresh trigger: launcher wrapper (zero staleness). Launch the agent via:');
    console.log(`  ${cli} run --agent ${agent} -- ${agent} <args>`);
    console.log(`Or add a shell alias:  alias ${agent}='${cli} run --agent ${agent} -- ${agent}'`);
  }

  if (flags['with-mcp'] === true && agent === 'codex') {
    addCodexMcp(cwd);
  } else if (agent === 'codex') {
    console.log('\nTip: MemBerry also exposes an MCP server. Re-run with --with-mcp to add it to .codex/config.toml,');
    console.log('     or add it yourself. (MCP is the model-driven knowledge-OUT path; hooks are context-IN.)');
  }
}

function uninstallMaterialized(agent: MaterializeAgent, cwd: string): void {
  const file = resolveTargetFile(agent, cwd);
  if (!fs.existsSync(file)) { console.log(`No ${path.basename(file)} — nothing to remove.`); return; }
  const content = fs.readFileSync(file, 'utf-8');
  if (!hasManagedBlock(content)) { console.log(`No MemBerry managed block in ${file} — nothing to remove.`); return; }
  fs.writeFileSync(file, stripManagedBlock(content), 'utf-8');
  console.log(`Removed MemBerry managed block from ${file}`);
}

function printTimerInstructions(agent: MaterializeAgent, cwd: string): void {
  const cli = resolveCliCommand({});
  console.log('\nRefresh trigger: systemd user timer. Create these units:');
  console.log(`  ~/.config/systemd/user/amp-materialize-${agent}.service`);
  console.log(`    [Service]\n    Type=oneshot\n    WorkingDirectory=${cwd}\n    ExecStart=${cli} context materialize --agent ${agent}`);
  console.log(`  ~/.config/systemd/user/amp-materialize-${agent}.timer`);
  console.log('    [Timer]\n    OnUnitActiveSec=15min\n    OnBootSec=1min\n    [Install]\n    WantedBy=timers.target');
  console.log(`Then: systemctl --user enable --now amp-materialize-${agent}.timer`);
}

/** Derive the repo root from the CLI entry path (…/packages/core/src/cli.ts). */
function repoRootFromEntry(): string | null {
  const entry = process.argv[1] ?? '';
  const marker = `${path.sep}packages${path.sep}`;
  const idx = entry.indexOf(marker);
  return idx === -1 ? null : entry.slice(0, idx);
}

function addCodexMcp(cwd: string): void {
  const file = path.join(cwd, '.codex', 'config.toml');
  const root = repoRootFromEntry();
  if (!root) { console.log('\nCould not derive repo root for the MCP server path — add [mcp_servers.amp] manually.'); return; }
  const serverPath = path.join(root, 'packages', 'mcp', 'src', 'server.ts');
  // The MCP server runs under tsx and selects the stdio transport via --stdio.
  const entry = `\n[mcp_servers.amp]\ncommand = "npx"\nargs = ["tsx", "${serverPath}", "--stdio"]\n`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
  if (existing.includes('[mcp_servers.amp]')) { console.log('\n.codex/config.toml already has an amp MCP server entry.'); return; }
  fs.writeFileSync(file, existing + entry, 'utf-8');
  console.log(`\nAdded [mcp_servers.amp] to ${file}`);
}

// ─── status ────────────────────────────────────────────────────────────────

export interface HooksStatus {
  claude: Array<{ scope: string; file: string; events: string[] }>;
  materialized: Array<{ agent: MaterializeAgent; file: string; present: boolean }>;
}

/** Structured hook-install status — shared by the CLI printer and the wiki API. */
export function getHooksStatus(cwd: string): HooksStatus {
  const claude = ['project', 'global'].map((scope) => {
    const file = claudeSettingsPath(scope, cwd);
    const events = fs.existsSync(file) ? ampHookStatus(readJson(file)) : [];
    return { scope, file, events };
  });
  const materialized = (['codex', 'hermes'] as MaterializeAgent[]).map((agent) => {
    const file = resolveTargetFile(agent, cwd);
    const present = fs.existsSync(file) && hasManagedBlock(fs.readFileSync(file, 'utf-8'));
    return { agent, file, present };
  });
  return { claude, materialized };
}

function status(cwd: string): void {
  const s = getHooksStatus(cwd);
  console.log('MemBerry hooks status:');
  for (const c of s.claude) {
    console.log(`  claude (${c.scope}): ${c.events.length ? c.events.join(', ') : '—'}  [${c.file}]`);
  }
  for (const m of s.materialized) {
    console.log(`  ${m.agent}: ${m.present ? 'managed block present' : '—'}  [${m.file}]`);
  }
}

// ─── entry ───────────────────────────────────────────────────────────────────

export async function runHooksCommand(sub: string, flags: Flags): Promise<void> {
  const cwd = process.cwd();
  const agent = flags['agent'] as Agent | undefined;
  const scope = (typeof flags['scope'] === 'string' ? flags['scope'] : 'project');

  if (sub === 'status') { status(cwd); return; }

  if (sub === 'install') {
    if (!agent) throw new Error('hooks install requires --agent claude|codex|hermes');
    if (agent === 'claude') { installClaude(scope, cwd, flags); return; }
    await installMaterialized(agent, cwd, flags);
    return;
  }

  if (sub === 'uninstall') {
    if (!agent) throw new Error('hooks uninstall requires --agent claude|codex|hermes');
    if (agent === 'claude') { uninstallClaude(scope, cwd); return; }
    uninstallMaterialized(agent, cwd);
    return;
  }

  console.error('Usage: amp hooks <install|uninstall|status> --agent claude|codex|hermes [--scope project|global] [--refresh wrapper|timer] [--with-mcp] [--command "..."]');
  process.exit(1);
}
