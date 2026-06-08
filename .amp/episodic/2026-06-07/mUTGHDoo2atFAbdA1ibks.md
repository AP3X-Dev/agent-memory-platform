---
id: mUTGHDoo2atFAbdA1ibks
session_id: session-20260607-ag3ntic-morph
agent_id: mcp
task: MILESTONE: the first five milestones (M1-M5) are built, verified, committed.
outcome: approved
created_at: "2026-06-07T17:04:14.938Z"
---

AG3NTIC — FIRST 5 MILESTONES (M1-M5) DONE + committed on morph/m1-data-model (13 commits, off morph/m0-purge, NEVER pushed). 85 tests green, ruff clean, app boots end-to-end, cleanliness gate PASSES at M5 on both shells. Branch vs m0-purge: 185 files, +14,189/−50,928 (desktop paradigm retired, net-new product layer built). Backends + unit tests; UI is M8; live infra (Docker/ACP/MCP) mocked in tests, live smokes deferred to Cerebro deploy.

M1 (data model): models.py = v2 §10 schema 39 tables (verified vs DDL), squashed Alembic baseline 20260607_0001, desktop control plane demolished, /api/v1 rebase, 14-cat errors, hash-chained record_audit, tenancy reconciled (membership-based, cross-tenant→404). M2 (operator): EmployeeSpec validator (packages/manifests + employees/spec.py), envelope crypto (vault/crypto.py, per-ws AES-256-GCM DEK/HKDF-KEK under AG3NTIC_MASTER_KEY), connect-a-model (credentials/ + model_client), Operator service (operator/ — gated propose/revise→validated OperatorProposal + operator.* events). M3 (orchestrator): runtime_orchestrator/ — ONLY Docker toucher via docker-socket-proxy, §5.1 14-state machine→runtime_events, hardened provisioning (cap_drop ALL/no-new-privileges/digest-pin/per-ws network/no published port). M4 (Hermes): runtime_adapter/ — EmployeeRuntimeAdapter Protocol + ACP JSON-RPC stdio client + HermesRuntimeAdapter (NO /v1/runs; request_permission→ApprovalRequest; runs.status §5.4) + lean headless runtimes/hermes-employee image. M5 (capabilities): capabilities/ — CapabilityManifest discriminated union (mcp_stdio/mcp_streamable_http/computer/builtin, streamable_http-only, MCP-Protocol-Version 2025-11-25, per-action risk/default), live MCP client, socket-proxy launcher + credential-grant injection, Catalog+binding API, Computer Capability (computer.* risk/default).

Code in platform_core/<domain>/ (services/* re-layout later). Deferred: UI (M8), live smokes (Cerebro deploy), streamed SSE spine, manifest-aware spec-escalation (catalog now exists), provision_admin/dev_keys CLI reconcile, OAuth/PKCE sessions — tracked in MORPH-BLOCKERS + tasks #11/#12. Artifacts: ag3ntic-progress-2026-06-07-milestones.md, %TEMP%\ag3ntic-handoff-after-m5.md. NEXT: M6 Permission Gateway (substrate = M4 request_permission mapping + M5 risk/default) → M7 memory → M8 UI → M9-M12.