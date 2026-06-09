---
id: I-2_d2SaSTHkYekWQ7AMs
session_id: session-20260607-ag3ntic-morph
agent_id: mcp
task: Record the M0.5 Composio-removal scoping decision and the discovered manifest path discrepancies.
created_at: "2026-06-07T13:21:42.459Z"
---

M0.5 Composio purge — scoping decision (2026-06-07). Discovery: `composio` spans 20 files / 669 occurrences in platform/. Manifest path discrepancy: worker.py is at apps/api/worker.py (NOT apps/api/platform_core/worker.py as the manifest stated) — readiness-illusion confirmed; verify every manifest path against reality.

DEPENDENCY FORCE: deleting platform_core/connectors/ breaks imports in (1) apps/api/main.py:20 (router mount) and (2) platform_core/agent_tasks/router.py:60 (imports connectors.composio_client). agent_tasks/router.py has ~18 composio refs incl AgentTaskComposioToolExecute schema, _ensure_connector_tool_allowed, ConnectorAccount queries, and the resident-runner endpoint runner_execute_composio_tool (/agent-runner/tasks/.../connectors/composio/...). §4A did not enumerate agent_tasks edits, but the import dependency forces de-coupling it tonight or ruff fails the M0.5 gate. Justified: this path is doubly-dead (Composio R4 + resident-runner R3).

STAGED RESIDUALS (per manifest, intentionally NOT removed at M0.5): ConnectorAccount model in models.py (→ M1 squash; I will neutralize its dead default="composio" string but KEEP the class), and the ~21 composio test assertions in tests/test_api.py + test_unit.py (→ M5 per-domain split). Therefore the M0.5 composio gate cannot be literal repo-wide zero; the cleanliness gate is MILESTONE-AWARE: composio-code check is HARD at M0.5 (excludes tests/ + docs/legacy), composio-tests check is INFO until M5.

DECISION: execute §4A self-contained removals first (archive docs, delete openclaw-gateway, delete resident-runner files, frontend purge), then the Composio removal incl forced agent_tasks de-coupling, as separate small commits, gate-verified.