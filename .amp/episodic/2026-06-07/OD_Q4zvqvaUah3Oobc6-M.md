---
id: OD_Q4zvqvaUah3Oobc6-M
session_id: session-20260607-ag3ntic-morph
agent_id: mcp
task: Record M1 data-model progress and the demolition decisions.
outcome: approved
created_at: "2026-06-07T15:05:20.780Z"
---

M1 (branch morph/m1-data-model off m0-purge) — data foundation LANDED + gate-verified. Commits: 0fe2d27 (schema+demolition+rebase), c134398 (squashed baseline). M1 cleanliness gate PASSES (removed-tables=0, old-chat-api=0, plus all M0.5 checks).

DONE: (1) models.py = v2 §10 schema, 39 tables, adversarially verified faithful vs the DDL (cross-dialect: bytea→LargeBinary, bigint→Integer, jsonb→JSON, metadata→metadata_ attr; circular FKs as plain String per §10.18 deferred; composite uniques/CHECKs deferred to migration). (2) ids.py new prefixes + errors.py 14-cat taxonomy, both backward-compatible. (3) Squashed Alembic baseline 20260607_0001 (down_revision=None) replacing 0001-0008; verified alembic upgrade head creates all 39 tables on fresh DB; added the missing alembic/script.py.mako. (4) /api/v1 rebase: main.py mounts only auth+workspaces+tool_capsules; app import-green (ruff -select F clean, import main OK, 21 routes). (5) record_event→record_audit (append-only, hash-chained audit_events); worker reduced to no-op skeleton; limits→employee counting; AG3NTIC_MASTER_KEY added to config.

BIG DECISION (recorded): the v2 §10 schema drops the gateway/usage/mcp/old-vault tables, so the demolition deleted 59 files — the desktop product modules (computers/actions/chat/agent_tasks/templates/workflows/ws/viewer/runtimes) AND the deferred modules whose tables vanished (gateway §4C-fence→rebuild M6, mcp→M5, usage metering→later, old vault crypto→credentials M1). Earlier than the build plan's per-milestone removal, but forced by clean-repo + the squashed baseline; code is in git history.

DEFERRED within M1 (sequencing choice): full OAuth/PKCE session flow + SSE spine + the credentials router/envelope-crypto will be built with M2 (Operator chat first exercises them) rather than gold-plating M1. M1 core = the data foundation (schema+baseline+bootable /api/v1+errors+audit writer). NEXT: verify boot, then M2 Operator.