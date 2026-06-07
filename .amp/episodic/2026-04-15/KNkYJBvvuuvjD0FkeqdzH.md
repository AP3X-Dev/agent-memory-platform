---
id: KNkYJBvvuuvjD0FkeqdzH
session_id: session-20260415-uiparity-1
agent_id: mcp
task: [project:agent-assist-cr] UI parity session 1: A-1 messageOnlyTriggers card + data survey
outcome: approved
created_at: "2026-04-15T18:54:49.409Z"
---

[project:agent-assist-cr] Completed A-1: added `safeCard('Message-Only Triggers')` to `_renderFullSop` in sop-panel.js, between Services Not Provided and Must Book & Job Types. Two-column table (Condition | Action) with optional notes line. Header uses new `.hdr-amber` CSS class (#f5b942) for warning/action-required tone. Renders only when triggers populated.

Mode B data survey across all 7 shipping v2 SOPs revealed:
- messageOnlyTriggers populated in 3/7 (IAQ Medic=2, Michael Bonsby=2, Degree=1) — A-1 is immediately verifiable.
- transferProcedures populated in 0/7 — A-2 will ship correct code but is visually un-demonstrable.
- serviceArea.zipCodes populated in 0/7 — A-3 same caveat.
- referrals.policy empty in 0/7 — existing Referrals card never renders for current data.
- **NEW DISCOVERY (F-1)**: hotTopics.items empty in 7/7 SOPs. The old v1 `hotTopics.specialInstructions[]` content didn't migrate to v2 `items[]`. Renderer code is correct (already uses `_hotTopicLines`); the gap is in the source data migration. Likely a CIC xls→json conversion issue. Filed as Block F.

Architectural patterns confirmed for future sessions:
- New SOP cards follow the safeCard pattern: `safeCard('Display Name', () => { ... return html; })` — never throws to the outer render.
- New header colors get a `.hdr-<color>` class in `sop-panel.css` near line 543 alongside the existing palette.
- Card insertion order in _renderFullSop: Company Profile → Special Instructions → Company Information → Services Not Provided → **Message-Only Triggers (NEW)** → Must Book & Job Types → Client Procedures → Scheduling Rules → Fees → Escalation Contacts → Referrals.

Tests: 943/943 pytest pass. JS syntax clean. No Python files touched so mypy/ruff not re-run.

Recommendation for next sessions: consider re-ordering backlog so F-1 (data migration prompt to user) and B-1 (test fixture migration) precede A-2/A-3 since the latter two won't produce visible UI changes until source data populates.