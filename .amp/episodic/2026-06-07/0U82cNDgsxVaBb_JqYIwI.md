---
id: 0U82cNDgsxVaBb_JqYIwI
session_id: session-20260607-ag3ntic-morph
agent_id: mcp
task: Record M2 progress: prerequisites + connect-a-model + tenancy reconciliation; Operator in flight.
outcome: approved
created_at: "2026-06-07T15:58:31.561Z"
---

M2 (Operator) progress on branch morph/m1-data-model. Commits: 3aa7c69 (EmployeeSpec schema+validator + envelope crypto + test rebaseline), 258cb5f (connect-a-model + tenancy reconciliation). 53 tests green, app boots end-to-end, ruff clean.

DONE this phase: (1) EmployeeSpec: packages/manifests/employee-spec.schema.json + platform_core/employees/spec.py (validate_spec, §11 cross-field rules; full manifest-aware escalation check deferred to the §12 registry/service validator at M5). (2) Envelope crypto: platform_core/vault/crypto.py — per-workspace AES-256-GCM DEK, HKDF-KEK(salt=workspace_id) under AG3NTIC_MASTER_KEY, secret:// resolver. (3) credentials domain: model_providers/model_credentials CRUD + connect-a-model (encrypt api key) + test-connection + has_active_model_credential (Operator gate) + model_client (OpenAI-compatible + Anthropic translate, streaming, error map). (4) TENANCY SPINE FIX (load-bearing): the demolition left auth/deps + workspaces/router+status + limits + bootstrap + conftest referencing OLD columns the v2 schema dropped — Workspace has NO owner_user_id/status (use workspace_members + deleted_at), User has NO role (role on workspace_members). Fixed all; authorize_workspace now membership-based + cross-tenant→404 (§7.3). App now boots (lifespan init_db+bootstrap on new schema works). (5) quarantined the whole legacy desktop test suite (test_api/test_unit/smokes); new suite built fresh per-domain.

KNOWN FOLLOW-UPS: dev_keys.py + provision_operator.py (isolated CLIs, not imported by app) still reference old columns (User.role/Workspace.owner_user_id/status) — fix when reworking provision_operator→provision_admin. nonce stored as nonce‖ciphertext in model_credentials.encrypted_payload (no separate nonce col).

IN FLIGHT: platform_core/operator/ (Operator service: propose/revise→OperatorProposal, gated, operator.* events, synchronous MVP + replay events; UI is M8). NEXT after operator: M3 runtime orchestrator (Docker, verify on Cerebro).