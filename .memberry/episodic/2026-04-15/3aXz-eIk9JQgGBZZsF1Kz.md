---
id: 3aXz-eIk9JQgGBZZsF1Kz
session_id: session-20260415-uiparity-3
agent_id: mcp
task: [project:agent-assist-cr] UI parity session 3: A-3 serviceArea card + Block A closure
outcome: approved
created_at: "2026-04-15T19:04:24.290Z"
---

[project:agent-assist-cr] Session 3 of ui-parity loop. Completed A-3 (Service Area card) and **closed Block A** — all 14 v2 schema top-level sections now have a renderer card.

**A-3 design decisions:**
- Tolerant entry shape: bare-string ZIPs OR objects with field aliases (`zip|code|postalCode`, `notes|instructions|specialInstructions`).
- Two render modes auto-selected: chip-list (compact, no notes) vs two-column table (any notes present). Density-appropriate to data shape.
- Header reuses `.hdr-lavender` (Services Not Provided color) — both are verification/gating concerns; keeps palette compact.
- Card placement: between Escalation Contacts and Referrals. Open question whether it belongs nearer Company Information; deferred to user input.

**Block A closure metrics:**
- 14/14 v2 schema sections rendered (was 11/14 before this loop).
- 3 sessions, 3 new cards (Message-Only Triggers, Transfer Procedures, Service Area).
- Card-order parity vs original preserved — old's 10 cards remain in their original sequence; new cards interleaved without disruption.
- 11 cards render real data today; 2 await source data (Transfer Procedures, Service Area); 1 awaits data migration (Special Instructions, blocked on F-1).

**Convention now well-established for new SOP cards** (3 instances confirms the pattern):
- Wrap in `safeCard(label, () => { ... })` — never throws to outer render.
- Tolerant field access: `(x && x.field) || ''` for every field.
- Schema-says-empty doesn't mean omit-the-code: design field shape from schema intent + user spec, document in inline comment.
- Render-only-when-populated guard at the top of the card body — `if (!triggers.length) return ''`.
- Filter half-empty rows BEFORE table generation — half-blank bands are noise during a live call.
- Header color matches the section's role: green=process/policy, blue=contact/escalation, lavender=verification/gating, amber=action-required, pink=procedural, orange=alerts.

**Loop trajectory:**
- After 3 sessions: 4 backlog items completed (A-1, A-2, A-3, E-3), 2 discovered (F-1 data migration, G-1 flaky test).
- Next: B-1 (test fixture v1→v2 migration) — concrete Python work, clear test impact, doesn't need user-at-keyboard.
- After B-1: Block C parity smoke-tests, which need user eyeballs OR a future jsdom/playwright harness.