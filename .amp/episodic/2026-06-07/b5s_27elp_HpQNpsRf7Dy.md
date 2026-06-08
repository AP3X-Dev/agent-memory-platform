---
id: b5s_27elp_HpQNpsRf7Dy
session_id: session-20260607-ag3ntic-morph
agent_id: mcp
task: Critically review M12 security test batteries for false confidence
created_at: "2026-06-07T21:44:21.041Z"
---

Reviewed M12 security tests for false confidence. Key findings:

1. test_audit_chain.py: _canonical_row_hash (L46-54) is a HAND-COPIED duplicate of events._row_hash, not an import. The verifier never imports the production hash function. So test_row_hash_recompute_matches (L135) is near-tautological: it recomputes from the SAME stored fields the producer used, so a bug in production _row_hash (e.g. dropping prev_hash from the canonical dict) would still pass because the frozen test copy and producer always agree at write time. Stronger: import events._row_hash and assert the test's independent reimplementation == events._row_hash for known vectors, AND pin a golden hex digest for a fixed (seq,action,payload,prev_hash) so a serialization change is caught.

2. AuditEvent.payload is plain JSON column (models.py L932), NOT MutableDict. test_payload_tamper (L159) tampers via attribute REASSIGNMENT (rows[1].payload = {...}) which IS flagged dirty + persisted, so it works. But it would give false confidence if anyone tampered via in-place mutation (rows[1].payload['x']=1) — that would NOT persist for a plain JSON col. Test does not cover the in-place case and the chosen form happens to work.

3. test_gateway_tenancy.py: 404 assertions are SOUND. test_owner_reads_own_approval (L83) is a positive control proving the route resolves to 200 on the same URL shape, so the cross-tenant 404s (L98-101, L113, L130-135) genuinely reach the PEP (authorize_workspace -> not_found) and the service workspace filter (_load_approval -> approval_not_found). Not a route-miss 404.

4. test_compose_hardening.py: parses the REAL infra/docker-compose.yml and asserts the §8.3 matrix correctly. Sound. Minor: test_socket_proxy_denies_dangerous_sections treats absent==deny via .get(section,'0'), which is correct for tecnativa default-off but means a typo'd section name would also 'pass' as denied.

5. test_production_gate.py: correctly handles AG3NTIC_MASTER_KEY validation_alias by passing it as the alias kwarg (L44). Exercises the real gate. Sound. GOOD='x7'*24 = 48 chars, passes >=32 and not dev-prefixed.

6. crypto edge + rotation tests: real properties (InvalidTag on KEK rotation, AAD workspace binding, at-rest wrapped-DEK/nonce tamper). Sound, not tautologies. rotate_secret seam test only pins a stub contract (acknowledged in docstring).</content>
<parameter name="scope">project:ag3ntic