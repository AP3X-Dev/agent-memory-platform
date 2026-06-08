---
id: dRQw5qnA3dDALcFajIHqC
session_id: session-20260607-ag3ntic-morph
agent_id: mcp
task: Record Phase A + Phase B (M0.5 purge) completion on branch morph/m0-purge.
outcome: approved
created_at: "2026-06-07T13:58:34.342Z"
---

AG3NTIC morph — Phase A + B DONE on branch morph/m0-purge (7 commits, no push). M0.5 cleanliness gate PASSES on both PowerShell and bash (composio-code/dead-import-connectors/token-localstorage/openclaw all zero).

Phase A: platform/README.md rewritten (AG3NTIC, not Nimbus); scripts/cleanliness_gate.ps1 + .sh = milestone-aware forbidden-token gate (build plan §2.2, default M0.5, tightens per-milestone).

Phase B (M0.5 purge), commits in order: (1) archive 9 stale desktop docs -> docs/legacy/ (PRP.md, ROADMAP.md, architecture.md, etc.); (2) delete runtimes/openclaw-gateway/ + clear openclaw from templates seed/supply-chain, .env.example, deploy checklist, runtimes/README; archive background-agent-primitives + agentmail design/plan docs; (3) delete resident runner (agent_runner/main.py, ag3ntic-local-check, sdk-python local.py + open_computer_use.py) + trim SDK __init__/README; (4) kill localStorage token persistence in api.ts (in-memory) + delete dead Vite pages (Computers/Workflows/Templates/Files) + data.ts + web README; (5) remove Composio backend entirely (connectors/ pkg, main.py mount, config settings, worker reconciler, agent_tasks composio runner endpoint+helpers+schema, workflows seed) + 2 composio superpowers docs + strip BLOCKERS/deployment-quickstart.

KEY DECISIONS: (a) worker.py is at apps/api/worker.py NOT platform_core/worker.py (manifest path wrong). (b) Composio purge forced de-coupling agent_tasks/router.py (import dependency) beyond §4A's list. (c) Generic required_connectors/connector_action_calls spec concept KEPT (mined to EmployeeSpec); only Composio execution removed. (d) DEFERRED to later milestones, encoded as gate checks: frontend Composio (api.ts+ConnectorsPage 2240-line interleave) -> M8 (composio-web check; plan says rebuild on Next.js not port); composio tests -> M5; ConnectorAccount model -> M1; resident-runner tokens -> M4/M9; App.tsx-coupled components -> M8. (e) Test suite intentionally does NOT collect (imports deleted modules) until M5 split — ruff check apps/api is clean. All recorded in platform/docs/MORPH-BLOCKERS.md. Next: Phase C (validate Hermes live via Cerebro).