---
id: evMPVBihM0czBBZcbn4yz
session_id: session-20260607-ag3ntic-morph
agent_id: mcp
task: M12 — security hardening (test batteries + production env-gate) for the AG3NTIC morph
outcome: approved
created_at: "2026-06-07T21:33:13.097Z"
---

M12 DONE on branch morph/m1-data-model (commit 2876f77). Delivered 6 new test files (+38 tests, total 166 pass) + config/auth changes:
- tests/test_compose_hardening.py (7): parses infra/docker-compose.yml (PyYAML, added to requirements-dev.txt) and asserts the §8.3 socket-proxy matrix (allow POST,CONTAINERS,IMAGES,NETWORKS,VOLUMES,EXEC,INFO; deny SWARM,SECRETS,SYSTEM,PLUGINS,CONFIGS,NODES), EXEC+VOLUMES regression guard, socket mounted :ro, no-new-privileges, and NO other service mounts docker.sock (§8.3.4).
- tests/test_audit_chain.py (6): the M12 HARD gate. Per-workspace hash chain linked+sequenced; independent row_hash recompute matches events._row_hash canonicalization {seq,action,payload,prev_hash} sorted/compact sha256; payload tamper + row deletion detected by a re-verify; per-workspace seqs independent; **audit survives employee deletion (guardrail #9)** — AuditEvent has NO FK to employees (target_id is a plain String, workspace_id FK is ondelete=SET NULL), so session.delete(employee) leaves the audit row intact.
- tests/test_envelope_crypto_edges.py (5): wrapped-DEK + nonce tamper-at-rest -> InvalidTag; wrap-layer AAD workspace binding; empty/unicode round-trips; master key min-length.
- tests/test_secret_rotation.py (4): master-key rotation breaks existing wrapped DEKs (monkeypatch crypto.settings.ag3ntic_master_key K1->K2, decrypt -> InvalidTag => re-wrap required, never silent-migrate, risk#3); dek_version recorded; pure KEK rotation; rotate_secret seam CONTRACT test (get_adapter('hermes').rotate_secret returns {status:'stubbed',...} — full Docker-secret hermes_api_key_v<n> rotation is a STUB, hermes_adapter.py:660, lands with live-runtime milestone). API-key rotation NOT implemented (only schema field rotated_from_id) — not tested.
- tests/test_production_gate.py (12): validate_production now REQUIRES AG3NTIC_MASTER_KEY; VIEWER_TOKEN_SECRET + VAULT_ENCRYPTION_KEY not required; viewer-token primitive round-trips without the dropped secret. NOTE: ag3ntic_master_key field has validation_alias="AG3NTIC_MASTER_KEY" — in tests construct Settings(**{"AG3NTIC_MASTER_KEY": val}) (init>env), the field-name kwarg is IGNORED.
- tests/test_gateway_tenancy.py (4): cross-tenant approval read/decision = 404 via both the authorize_workspace PEP (non-member) AND the service workspace_id filter. ApprovalDecisionIn.verdict is Literal["approve","deny","request_changes"] (NOT "approved").
CODE CHANGES: config.py validate_production swapped VAULT_ENCRYPTION_KEY -> AG3NTIC_MASTER_KEY in the required-secret loop; removed the now-dead vault_encryption_key Settings field (only it referenced it). auth/security.py: REPAIRED the viewer-token primitive — it referenced settings.viewer_token_secret + settings.viewer_token_ttl_seconds which DO NOT EXIST in Settings (would AttributeError if called; it's uncalled — Computer Capability docstring + m1-kickoff reference parse_viewer_token as a primitive). Now signs with HMAC over (_VIEWER_TOKEN_LABEL + secret_key) and VIEWER_TOKEN_TTL_DEFAULT=3600. .env.example dropped VAULT_ENCRYPTION_KEY line.
EVIDENCE: pytest 166 passed; cleanliness gate PASS at M12 (ps1 + sh).