---
id: 6CpJ8-BymFlFYC6dr-guw
session_id: session-20260607-ag3ntic-morph
agent_id: mcp
task: HANDOFF — resume point for the next AG3NTIC session (read this first)
outcome: approved
created_at: "2026-06-08T01:35:50.953Z"
---

=== AG3NTIC SESSION HANDOFF (start here next time) ===
Branch morph/m1-data-model, HEAD 2c143a5, NOT pushed (origin=Desktop pristine — never push). pytest 177 pass; cleanliness gate PASS @M12; web build green. Untracked packages/mcp-server/ = KEEP artifact, leave it.

WHAT'S DONE THIS SESSION (all committed, branch-only):
1. M11 (7a36a0e): infra/docker-compose.yml AG3NTIC topology +qdrant +§8.3 socket-proxy; apache without vnc/terminal; scripts/deploy_cerebro_release.py + smoke_backup_restore.py (PG+MinIO+Qdrant); gate M11 check; rewritten deploy/recovery docs.
2. M12 (2876f77): 6 security test files (+38): compose-hardening, audit tamper+survives-employee-deletion, crypto edges, master-key rotation, gateway tenancy, production gate requiring AG3NTIC_MASTER_KEY; repaired viewer-token primitive; dropped dead VAULT_ENCRYPTION_KEY.
3. Phase C (13423ce): POST /operator/proposals/{id}/accept → Employee+rev-1 + console "Accept proposal" action.
4. Review fixes (520ef7b): composite uniques (uq_employee_slug/uq_employee_operator/uq_revision_number) in models __table_args__ + migration; IntegrityError→409; kind!=employee guard; backup-smoke MinIO -i + content + disposable bucket; Qdrant upload-restore; web/api .dockerignore; deploy --build-timeout.
5. Deploy fixes: configurable host ports (1a5c887), web cross-platform build (03190a9), spec.py container import crash (5bc843e), provision_operator M1 schema (9344054), capabilities domain-keyed list (115cca9), connect default base (6e57538), Secure cookies only over HTTPS (44fa36b).
6. Operator on ChatGPT/Codex subscription (0f1fe66, 5ef5056): new `codex` model-provider in credentials/model_client.py (resolve_and_chat branches kind=='codex' → codex_completion → `codex exec --output-last-message`; auth via CODEX_HOME, no API key). Copied local C:\Users\Guerr\.codex\auth.json → server /codex-home.
7. M4 Hermes runtime (4bbc868, 193780d, 2c143a5): built runtimes/hermes-employee image (Nous hermes-agent 0.14.0), keep-alive CMD; local registry; docker_client.exec_output + tasks/runs.py hermes_run_executor (registered in main.py); output-noise strip.

LIVE ON CEREBRO (192.168.0.25), Nimbus (cloud-computer-platform) UNTOUCHED. Project `ag3ntic` at ~/projects/ag3ntic-morph. Ports: web 8095, api 8096, minio 9110/9111. Console http://192.168.0.25:8095 (leave control-plane URL blank, paste key). Demo ws wsp_65af44e194692baac5f5efae, op key ck_c80bacd67b60fbe8dfb22161a7721700366367f860b6ce87. Registry ag3ntic-registry 127.0.0.1:5000; employee image localhost:5000/ag3ntic-hermes-employee@sha256:a06c613...; running employee emp_8940c6de... (container employee-demo-hermes-demo) authed to openai-codex.

GOLDEN PATH WORKS END-TO-END LIVE: connect → Operator(ChatGPT subscription) → propose → accept → Employee → launch (real hardened hermes container) → run a task (verified "Paris is the capital of France.").

PENDING USER DECISION (asked; (a) done): (a) DONE strip output noise. (b) build full ACP streaming + per-tool-approval transport — docker_exec_transport is a STUB; current executor uses one-shot `hermes chat` so per-tool Permission-Gateway approvals do NOT gate live hermes runs. (c) checkpoint. → Next session likely starts on (b) or another direction the user picks.

FOLLOW-UPS: runs are SYNCHRONOUS (block API up to 240s → move to worker); capabilities/MCP not attached (hermes mcp add = M5); deeper Phase-D live smokes; docs/security.md + deployment-quickstart.md stale; ../ag3ntic-progress-2026-06-07-m11-m12.md + ../ag3ntic-NEXT-SESSION-GOAL-postM12.md predate the deploy/codex/M4; provision_operator not renamed to provision_admin (risk#8).

GOTCHAS (cost real time): docker restart does NOT reload env_file → use `docker compose up -d <svc>` (with the AG3NTIC_*_PORT exports) to pick up .env. Test DB = create_all from MODELS (not alembic) → DB constraints must be in __table_args__ to be enforced/tested. SQLAlchemy identity-map → snapshot status strings right after transition/review, don't re-read at end. `hermes login` deprecated → `hermes auth add <provider> --type oauth`; provider openai-codex = ChatGPT subscription. codex device-auth rate-limits (429) on rapid retries → prefer copying existing auth.json. MemBerry memory domain resets on MCP reconnect → re-enable with berry_tools before berry_memory_*.

RULES: never push/merge to main/origin; branch-only; run cleanliness gate + pytest after each phase + show evidence; no AI/Claude refs in commits; checkpoint to MemBerry. session_id this session: session-20260607-ag3ntic-morph. The core `project_state` block is also current (mirrors this).