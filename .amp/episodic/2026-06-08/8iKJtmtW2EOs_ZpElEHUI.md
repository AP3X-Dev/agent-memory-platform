---
id: 8iKJtmtW2EOs_ZpElEHUI
session_id: session-20260607-ag3ntic-morph
agent_id: mcp
task: Task 9: standing_grants.py helpers (args_hash, create/find/consume)
outcome: approved
created_at: "2026-06-08T05:44:10.459Z"
---

Task 9 complete. Created apps/api/platform_core/permission_gateway/standing_grants.py with args_hash (SHA-256 of canonical JSON), create_standing_grant, find_active_grant (unconsumed + unexpired filter, explicit `now` param for testability), and consume_grant (UPDATE WHERE consumed_at IS NULL; returns rowcount==1). Test file tests/test_standing_grants.py covers all 5 scenarios: create+find, consume-once-only, find-after-consume, expired grant, hash determinism. TDD: red (5 failed ModuleNotFoundError) → green (5 passed). Full suite: 200 passed (195 → +5). Commit d14ea25 on morph/m1-data-model.