---
id: HLvpESTjl2Vw1RcUK-XhV
session_id: session-20260602-120000
agent_id: mcp
task: [project:amp] Add a Settings page to the wiki site to enable/configure hooks and surface other config.
outcome: approved
created_at: "2026-06-02T21:44:00.340Z"
---

[project:amp] Added a Settings page to the wiki viewer (port 3200, /settings) to enable/configure agent hooks + view other config. Decisions: writes are OPEN ON LAN (user accepted; every mutation is logged to stderr via [wiki-settings]); scope = hooks live-editable + rest read-only.

Architecture: new persisted settings store packages/core/src/config/settings.ts at ~/.config/amp/settings.json (override AMP_SETTINGS_PATH). Hook processes read it LIVE each invocation (verified: a fresh process picks up a new value with no restart) — this is how the UI influences short-lived hook CLIs. Precedence for tunables: env var > settings file > built-in default (resolveNumber). loadRawSettings() returns the on-disk partial (null if absent) so source attribution distinguishes file vs default — important, since loadSettings() merges defaults and would otherwise always report 'file'. Wired settings into safe-load.ts hookTimeoutMs(), claude.ts turnTokenBudget()/sessionStartTimeoutMs().

Status providers: getConfigStatus() (packages/core/src/config/status.ts) returns hook tuning with per-field source + read-only server block (cache TTLs 300/300/86400, consolidation autoApply=false/threshold=3, decay half-lives 14/90/365, requireProjectTag + embeddings derived live from env). getHooksStatus(cwd) extracted from cli/install.ts (structured per-agent install state), reused by the CLI printer and the API. All exported from @amp/core index.

Wiki: packages/wiki/src/settings.ts renders the page (own scoped CSS/JS) + handles mutations. applyHooksTuning() persists tuning; runHooksInstall() SHELLS OUT to `npx tsx <core>/cli.ts hooks <action>` (cwd=repo root) so there's one installer code path — CLI_PATH resolved via fileURLToPath(new URL('../../core/src/cli.ts', import.meta.url)). viewer.ts: added SETTINGS nav item, readJsonBody() helper (256KB cap), routes GET /settings, GET /api/settings, POST /api/settings/hooks-tuning, POST /api/settings/hooks-install.

Tests: 16 new (config-settings.test.ts 11 + wiki settings.test.ts 5) — all green; full hooks+wiki suite 287 pass. Deployed: restarted amp-wiki.service (runs tsx on source); live /settings + /api/settings verified on 3200. README hooks section notes the UI. Gotcha learned: lingering test viewers on a port silently fail to rebind and serve stale code — kill old viewers / use a fresh port when testing the viewer.