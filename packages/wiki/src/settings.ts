// packages/wiki/src/settings.ts
//
// Settings page for the wiki viewer: enable/configure agent hooks and view the
// rest of MemBerry's effective configuration. Hook tuning is persisted to the shared
// settings file (read live by hook processes); enable/disable shells out to the
// `amp hooks` installer so there is exactly one code path that edits
// settings.json / AGENTS.md.

import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  loadSettings,
  saveSettings,
  getHooksStatus,
  getConfigStatus,
  type HooksStatus,
  type ConfigStatus,
} from '@memberry/core';

const execFileAsync = promisify(execFile);

/** Absolute path to the MemBerry CLI source entry (the repo runs under tsx). */
const CLI_PATH = fileURLToPath(new URL('../../core/src/cli.ts', import.meta.url));

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface SettingsData {
  hooks: HooksStatus;
  config: ConfigStatus;
}

export function getSettingsData(repoRoot: string): SettingsData {
  return { hooks: getHooksStatus(repoRoot), config: getConfigStatus() };
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export interface TuningPatch {
  timeoutMs?: number;
  turnTokens?: number;
  sessionTimeoutMs?: number;
}

/** Persist hook tuning to the settings file. Returns the fresh config status. */
export function applyHooksTuning(patch: TuningPatch): ConfigStatus {
  const current = loadSettings();
  const num = (v: unknown, fallback: number): number => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  saveSettings({
    hooks: {
      timeoutMs: num(patch.timeoutMs, current.hooks.timeoutMs),
      turnTokens: num(patch.turnTokens, current.hooks.turnTokens),
      sessionTimeoutMs: num(patch.sessionTimeoutMs, current.hooks.sessionTimeoutMs),
    },
  });
  return getConfigStatus();
}

export interface InstallRequest {
  agent: 'claude' | 'codex' | 'hermes';
  action: 'install' | 'uninstall';
  scope?: 'project' | 'global';
  refresh?: 'wrapper' | 'timer';
  withMcp?: boolean;
}

export interface InstallResult {
  ok: boolean;
  output: string;
  status: HooksStatus;
}

/** Run the `amp hooks <action>` installer, then return refreshed status. */
export async function runHooksInstall(repoRoot: string, req: InstallRequest): Promise<InstallResult> {
  const agents = ['claude', 'codex', 'hermes'];
  const actions = ['install', 'uninstall'];
  if (!agents.includes(req.agent) || !actions.includes(req.action)) {
    throw new Error('invalid agent or action');
  }

  const args = ['tsx', CLI_PATH, 'hooks', req.action, '--agent', req.agent];
  if (req.agent === 'claude' && req.scope) args.push('--scope', req.scope);
  if (req.action === 'install' && (req.agent === 'codex' || req.agent === 'hermes')) {
    if (req.refresh) args.push('--refresh', req.refresh);
    if (req.withMcp && req.agent === 'codex') args.push('--with-mcp');
  }

  let output = '';
  let ok = true;
  try {
    const { stdout, stderr } = await execFileAsync('npx', args, {
      cwd: repoRoot,
      timeout: 30_000,
      env: process.env,
    });
    output = `${stdout}${stderr}`.trim();
  } catch (err) {
    ok = false;
    const e = err as { stdout?: string; stderr?: string; message?: string };
    output = `${e.stdout ?? ''}${e.stderr ?? ''}${e.message ?? ''}`.trim();
  }

  // Audit: writes are open on the LAN per configuration, so log every mutation.
  console.error(`[wiki-settings] hooks ${req.action} --agent ${req.agent} (ok=${ok})`);

  return { ok, output, status: getHooksStatus(repoRoot) };
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function badge(on: boolean, onText = 'ENABLED', offText = 'OFF'): string {
  return on
    ? `<span class="s-badge s-on">${onText}</span>`
    : `<span class="s-badge s-off">${offText}</span>`;
}

function claudeRow(s: HooksStatus): string {
  const rows = s.claude
    .map((c) => {
      const on = c.events.length > 0;
      return `<div class="s-scope">
        <div class="s-scope-head">${badge(on, c.events.length ? `${c.events.length} EVENTS` : 'OFF')} <code>${esc(c.scope)}</code></div>
        <div class="s-muted">${on ? esc(c.events.join(', ')) : 'not installed'}</div>
        <div class="s-muted s-path">${esc(c.file)}</div>
        <div class="s-actions">
          <button class="s-btn" onclick="hookAction('claude','install','${c.scope}')">Enable</button>
          <button class="s-btn s-ghost" onclick="hookAction('claude','uninstall','${c.scope}')">Disable</button>
        </div>
      </div>`;
    })
    .join('');
  return `<div class="s-card">
    <h3>Claude Code <span class="s-tag">live hooks</span></h3>
    <p class="s-muted">SessionStart + per-turn UserPromptSubmit injection, PreCompact + SessionEnd. Restart Claude Code (or run <code>/hooks</code>) after enabling.</p>
    ${rows}
  </div>`;
}

function materializedRow(s: HooksStatus, agent: 'codex' | 'hermes'): string {
  const m = s.materialized.find((x) => x.agent === agent)!;
  const mcpToggle =
    agent === 'codex'
      ? `<label class="s-check"><input type="checkbox" id="codex-mcp"> also add MCP server</label>`
      : '';
  return `<div class="s-card">
    <h3>${agent === 'codex' ? 'OpenAI Codex' : 'Nous Hermes'} <span class="s-tag s-tag-alt">materialized</span></h3>
    <p class="s-muted">Writes a managed block into <code>${esc(m.file.split('/').pop() ?? '')}</code> (session-start context only). Refresh at launch via <code>amp run --agent ${agent} -- ${agent}</code>.</p>
    <div class="s-scope">
      <div class="s-scope-head">${badge(m.present, 'BLOCK PRESENT')}</div>
      <div class="s-muted s-path">${esc(m.file)}</div>
      <div class="s-actions">
        <label class="s-inline">refresh
          <select id="${agent}-refresh"><option value="wrapper">wrapper</option><option value="timer">timer</option></select>
        </label>
        ${mcpToggle}
        <button class="s-btn" onclick="materializedAction('${agent}','install')">Enable / Refresh</button>
        <button class="s-btn s-ghost" onclick="materializedAction('${agent}','uninstall')">Disable</button>
      </div>
    </div>
  </div>`;
}

function tuningCard(c: ConfigStatus): string {
  const f = (label: string, id: string, r: { value: number; source: string }, hint: string): string =>
    `<label class="s-field">
      <span>${label} <em class="s-src s-src-${r.source}">${r.source}</em></span>
      <input type="number" id="${id}" value="${r.value}" min="1">
      <small class="s-muted">${hint}</small>
    </label>`;
  return `<div class="s-card">
    <h3>Hook tuning <span class="s-tag">live</span></h3>
    <p class="s-muted">Read by hook processes on every invocation — no restart needed. Saved to <code>${esc(c.settingsPath)}</code>. An <em class="s-src s-src-env">env</em> override takes precedence over the file.</p>
    <div class="s-grid">
      ${f('Per-turn timeout (ms)', 'tune-timeout', c.hookTuning.timeoutMs, 'UserPromptSubmit budget — keep tight; fail-open on timeout.')}
      ${f('Per-turn tokens', 'tune-tokens', c.hookTuning.turnTokens, 'Max injected context per turn.')}
      ${f('SessionStart timeout (ms)', 'tune-session', c.hookTuning.sessionTimeoutMs, 'One-off load budget at session start.')}
    </div>
    <div class="s-actions"><button class="s-btn" onclick="saveTuning()">Save tuning</button></div>
  </div>`;
}

function serverCard(c: ConfigStatus): string {
  const s = c.server;
  const kv = (k: string, v: string): string => `<div class="s-kv"><span>${esc(k)}</span><code>${esc(v)}</code></div>`;
  return `<div class="s-card s-readonly">
    <h3>Server config <span class="s-tag s-tag-ro">read-only</span></h3>
    <p class="s-muted">Baked into the MCP bootstrap (applied on server restart) plus two live runtime facts. Surfaced for visibility; not yet editable here.</p>
    <div class="s-kvs">
      ${kv('Project-tag enforcement', s.requireProjectTag ? 'required' : 'disabled')}
      ${kv('Embeddings', s.embeddings)}
      ${kv('Cache TTL (default/context/embedding)', `${s.cacheTTLSeconds.default}s / ${s.cacheTTLSeconds.context}s / ${s.cacheTTLSeconds.embedding}s`)}
      ${kv('Consolidation', `autoApply=${s.consolidation.autoApply}, signalThreshold=${s.consolidation.signalThreshold}`)}
      ${kv('Decay half-lives (volatile/stable/permanent)', `${s.decayHalfLivesDays.volatile}d / ${s.decayHalfLivesDays.stable}d / ${s.decayHalfLivesDays.permanent}d`)}
    </div>
  </div>`;
}

/** Render the full settings page body (wrapped by the viewer's htmlPage shell). */
export function renderSettingsBody(repoRoot: string): string {
  const { hooks, config } = getSettingsData(repoRoot);
  return `${SETTINGS_CSS}
  <div class="s-wrap">
    <header class="s-hero">
      <h1>Settings</h1>
      <p class="s-muted">Enable and configure agent hooks, and review MemBerry's effective configuration. Changes here affect this host.</p>
    </header>
    <div id="s-toast" class="s-toast"></div>

    <section>
      <h2 class="s-section">Agent hooks</h2>
      <div id="s-hooks">
        ${claudeRow(hooks)}
        ${materializedRow(hooks, 'codex')}
        ${materializedRow(hooks, 'hermes')}
      </div>
    </section>

    <section>
      <h2 class="s-section">Configuration</h2>
      ${tuningCard(config)}
      ${serverCard(config)}
    </section>
  </div>
  ${SETTINGS_JS}`;
}

const SETTINGS_CSS = `<style>
.s-wrap { max-width: 920px; margin: 0 auto; padding: 8px 4px 64px; }
.s-hero h1 { margin: 0 0 4px; }
.s-section { font-size: 13px; letter-spacing: .08em; text-transform: uppercase; opacity: .6; margin: 28px 0 12px; }
.s-card { border: 1px solid var(--border, #2a2f3a); border-radius: 10px; padding: 16px 18px; margin: 0 0 14px; background: rgba(255,255,255,.015); }
.s-card h3 { margin: 0 0 6px; font-size: 16px; }
.s-readonly { opacity: .92; }
.s-muted { opacity: .62; font-size: 13px; line-height: 1.5; }
.s-path { font-family: ui-monospace, monospace; font-size: 11px; word-break: break-all; opacity: .5; margin-top: 2px; }
.s-tag { font-size: 10px; padding: 2px 7px; border-radius: 99px; background: #1f6feb33; color: #79b8ff; letter-spacing: .05em; vertical-align: middle; }
.s-tag-alt { background: #a371f733; color: #c8a3ff; }
.s-tag-ro { background: #6e768133; color: #b0b6c0; }
.s-badge { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 99px; letter-spacing: .05em; }
.s-on { background: #2ea04333; color: #56d364; }
.s-off { background: #6e768122; color: #8b949e; }
.s-scope { border-top: 1px solid var(--border, #2a2f3a); padding: 12px 0 4px; }
.s-scope:first-of-type { border-top: 0; }
.s-scope-head { display: flex; align-items: center; gap: 8px; margin-bottom: 2px; }
.s-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 10px; }
.s-btn { background: #1f6feb; color: #fff; border: 0; border-radius: 6px; padding: 6px 14px; font-size: 13px; cursor: pointer; }
.s-btn:hover { background: #388bfd; }
.s-ghost { background: transparent; border: 1px solid var(--border, #2a2f3a); color: inherit; }
.s-ghost:hover { background: rgba(255,255,255,.05); }
.s-inline, .s-check { font-size: 12px; opacity: .8; display: inline-flex; align-items: center; gap: 6px; }
.s-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin: 10px 0; }
.s-field { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.s-field input, select { background: #0d1117; border: 1px solid var(--border, #2a2f3a); color: inherit; border-radius: 6px; padding: 6px 8px; font: inherit; }
.s-src { font-style: normal; font-size: 9px; padding: 1px 5px; border-radius: 99px; letter-spacing: .04em; }
.s-src-env { background: #bb800933; color: #e3b341; }
.s-src-file { background: #1f6feb33; color: #79b8ff; }
.s-src-default { background: #6e768122; color: #8b949e; }
.s-kvs { display: flex; flex-direction: column; gap: 8px; margin-top: 6px; }
.s-kv { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; border-bottom: 1px dashed var(--border, #23272f); padding-bottom: 6px; }
.s-kv code { opacity: .85; }
.s-toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #161b22; border: 1px solid var(--border, #2a2f3a); padding: 10px 16px; border-radius: 8px; font-size: 13px; opacity: 0; transition: opacity .2s; pointer-events: none; z-index: 50; max-width: 80vw; }
.s-toast.show { opacity: 1; }
</style>`;

const SETTINGS_JS = `<script>
function toast(msg, ok) {
  var t = document.getElementById('s-toast');
  t.textContent = msg; t.style.borderColor = ok ? '#2ea043' : '#f85149';
  t.classList.add('show'); setTimeout(function(){ t.classList.remove('show'); }, 3200);
}
async function post(url, body) {
  var r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
}
async function saveTuning() {
  var body = {
    timeoutMs: +document.getElementById('tune-timeout').value,
    turnTokens: +document.getElementById('tune-tokens').value,
    sessionTimeoutMs: +document.getElementById('tune-session').value,
  };
  var res = await post('/api/settings/hooks-tuning', body);
  toast(res.ok ? 'Hook tuning saved — applies to new hook invocations immediately.' : 'Save failed', res.ok);
}
async function hookAction(agent, action, scope) {
  var res = await post('/api/settings/hooks-install', { agent: agent, action: action, scope: scope });
  toast(res.ok ? (action === 'install' ? 'Enabled.' : 'Disabled.') + ' Restart the agent to apply.' : 'Failed: ' + (res.output||'').slice(0,120), res.ok);
  setTimeout(function(){ location.reload(); }, 900);
}
async function materializedAction(agent, action) {
  var refresh = (document.getElementById(agent+'-refresh')||{}).value;
  var mcp = (document.getElementById('codex-mcp')||{}).checked;
  var res = await post('/api/settings/hooks-install', { agent: agent, action: action, refresh: refresh, withMcp: mcp });
  toast(res.ok ? 'Done. ' + (res.output||'').split('\\n')[0] : 'Failed: ' + (res.output||'').slice(0,120), res.ok);
  setTimeout(function(){ location.reload(); }, 900);
}
</script>`;
