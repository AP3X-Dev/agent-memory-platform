---
id: 5VMjdJ6irzoLyYDBM4nxm
session_id: session-20260415-parity
agent_id: mcp
task: [project:agent-assist-cr] UI parity optimization loop generated
outcome: approved
created_at: "2026-04-15T18:43:19.635Z"
---

[project:agent-assist-cr] Created a second optimizer loop focused on renderer + v2 schema completeness. Artifacts: `docs/prompts/ui-parity-optimizer.md` and `docs/prompts/ui-parity-optimizer-log.md`. Cross-references the existing `agent-assist-optimizer.md` (backend hardening) — the two loops coordinate via their shared docs/prompts/ directory, with backend-scope items from the UI loop deferred to the backend loop.

Backlog seeded with 8 items in 4 blocks: A) v2 sections unrendered (messageOnlyTriggers, transferProcedures, serviceArea) — 3 items; B) test fixture hygiene (v1-shaped fixture in test_sop_start_enrichment.py) — 1 item; C) UI parity spot-checks (Chat/Call SOP/Full SOP side-by-side vs old) — 3 items; D) data quality flags (user-owned data bugs) — 1 item.

Key invariants documented for future sessions:
- v2 only, zero v1 fallbacks (if `|| v1_field` appears in new code, remove it)
- Full SOP per-card try/catch is load-bearing — must never cascade-fail
- Renderer divergence from old is now allowed where v2 correctness or user-visible parity demands it (this contradicts sem-dYjHraya30 from earlier in the project)
- Backend contract unchanged: routes ≤15 lines, raise_http only, service-owns-its-lock

Mode B discovery guidance emphasizes: old-vs-new diff on touched files, CSP violation logging as future "tighten back to 'self'" opportunities, grep `sop\.[a-zA-Z]` in renderer cross-checked against SOP_Schema_v2.json keys to find silently-missed fields, engine SOPAlertCategory changes cross-referenced against UC_PILL_CONFIG.

No git repo initialized — each session is an atomic filesystem diff. If git is added later, branch `opt/ui-parity-v2` is reserved for this loop.