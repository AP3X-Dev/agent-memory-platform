---
id: 4pBEZ0iZpHvKvB133VTyj
session_id: session-20260607-ag3ntic-morph
agent_id: mcp
task: Complete the next 5 milestones (M6-M10) of the AG3NTIC morph build
outcome: approved
created_at: "2026-06-07T20:02:47.828Z"
---

M7 AMP/MemBerry memory plane DONE + committed (d90785d). Built platform_core/memory/: write-policy/review/query lifecycle over memory_records/collections/access_events. Policy: user-save→approved (golden path step 15), agent write→pending_review, blocked-sensitivity (default restricted)→blocked; only approved records indexed+queryable. MemoryPolicy read from employee_revisions.memory_policy jsonb (NO standalone table — gate). Qdrant strictly behind platform_core/memory/backend.py MemoryBackend seam: InMemoryBackend default (deterministic, offline, used by MVP+all tests), lazy QdrantBackend over Query API for live deploy. Deterministic local hashing embedder (embed_text, 256-dim) — model-provider embedder is a follow-up. Per-workspace memberry_<ws> collections. memory.* events→memory_access_events. Added qdrant-client to requirements. 10 tests; full suite 108 passing; gate PASS at M7. Pattern learned: ORM identity-map gotcha — review_memory mutates the same in-session object, snapshot status before re-loading in tests. Next: M9 tasks/runs lifecycle + scheduler + worker reconcilers + wire gateway resume handler.