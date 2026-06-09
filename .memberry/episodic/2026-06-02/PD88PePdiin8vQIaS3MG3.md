---
id: PD88PePdiin8vQIaS3MG3
session_id: session-20260602-120000
agent_id: mcp
task: [project:amp] Implement the agent-hooks integration per docs/superpowers/plans/2026-06-02-agent-hooks-integration.md (load-only).
outcome: approved
created_at: "2026-06-02T21:27:18.336Z"
---

[project:amp] Completed the full agent-hooks implementation (all 5 workstreams), load-only, for Claude Code (live) + Codex/Hermes (materialized). Key build facts for future sessions:

- ONE construction path: new createCoreServices() in packages/core/src/services-factory.ts builds the load/store kit (AMPService + MemoryBlockService + redis/neo4j/cache/embedding). The MCP bootstrap (packages/mcp/src/bootstrap.ts) was refactored to consume it (destructures driver/redis/cache/signals/queue/scopedQuery/factStore/embedding/config/ampService/memoryBlocks, builds semantic/lock/proposals/provenance on top). Validated: full bootstrap() boots "fully operational" + clean shutdown against live Neo4j/Redis. core package.json now lists @amp/redis + @amp/neo4j as dependencies (were devDeps).
- safeLoad wrapper (packages/core/src/hooks/safe-load.ts): fail-open, 800ms default timeout (AMP_HOOK_TIMEOUT_MS), returns null on timeout/throw so a hook never blocks a turn.
- CLI extended (packages/core/src/cli.ts router): `hook <agent> <event>`, `context materialize`, `hooks install|uninstall|status`, `run`. Adapters under packages/core/src/cli/. The whole repo runs under tsx (workspace exports point to TS source) — so installed Claude hook commands and the Codex MCP entry use `npx tsx <abs path>`, NOT bare node.
- Claude adapter: SessionStart injects via hookSpecificOutput.additionalContext (8s timeout, off critical path); UserPromptSubmit does per-turn delta injection using a Redis dedup set amp:hookdedup:<session_id> (24h TTL) — skips if all sources already injected; PreCompact snapshots working_state; SessionEnd stores a mechanical session summary (only episodic store from a hook).
- Materialized adapter: writes a fenced <!-- AMP:BEGIN/END --> managed block. Targets: codex->AGENTS.md; hermes->[.hermes.md, AGENTS.md] (CLAUDE.md DELIBERATELY EXCLUDED — it holds AMP config and Hermes "first match wins" would shadow an existing AGENTS.md). `amp run --agent codex -- <cmd>` re-materializes then execs (default zero-staleness refresh; systemd timer optional). Verified idempotent + exit-code propagation.
- Tests: 40 new tests across 7 files (hooks-safe-load, hooks-managed-block, hooks-claude-settings, hooks-project-scope, hooks-claude-adapter, hooks-materialized, hooks-cli-drift) — all green. Build clean.
- Pre-existing unrelated failures: service.test.ts + service.regression.test.ts fail ~20 tests on CLEAN HEAD too (AMPService.store project-tag enforcement) — NOT caused by this work. Also packages/mcp/src/server.ts + server.test.ts show external working-tree modifications (113 insertions) made by another agent, not by this work.
Docs: README gained a "Hooks" section; CLAUDE.md Session Start gained a note that hooks are the deterministic context-IN floor under (not replacing) model-driven load, and store stays model-driven.