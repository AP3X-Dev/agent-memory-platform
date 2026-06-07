---
id: Orevj4LkoWXgJWwqqpoba
session_id: session-20260415-parity
agent_id: mcp
task: [project:agent-assist-cr] UI parity loop scope extended to form side
outcome: approved
created_at: "2026-04-15T18:48:47.211Z"
---

[project:agent-assist-cr] Extended ui-parity-optimizer.md scope from "SOP panel only" to "the entire Electron UI: form side AND SOP panel". Added Block E with 3 items: (E-1) verify probing-question N/A filtering end-to-end — backend wiring at session_manager.py:540 IS in place, gap is upstream (cadence tick orphaned + LLM stubs return empty equipment_type, both tracked in backend optimizer); (E-2) auto-fill of trade/job-type with confidence pill; (E-3) old-vs-new diff sweep on remaining form-side renderer files (index.html, renderer.js, polling.js, preload.js, styles.css).

Key finding for future sessions: form-side renderer JS components (customer-info.js, trade-selector.js, form-questions.js) are byte-identical between old and new. Form-side parity gaps are predominantly **backend-driven** — they manifest because the new backend isn't emitting the right ChecklistItemStatus per item (often because upstream extraction is stubbed or unwired).

User constraint added to log: "probing questions must hide irrelevant items based on detected trade + equipment type — old version did this, new version currently does not." Concrete example: central-air call should hide boiler/furnace fuel-type questions. The renderer already filters items where status === 'conditional_hidden' (form-questions.js:62). The deterministic Tier-1 N/A rules live in src/engine/agents/probing_na_rules.py (port from agent-assist-main).

Discovery guidance for the loop now also covers: ChecklistItemStatus enum coverage audit, probing N/A rule coverage delta vs old, auto-detected confidence threshold reconciliation, field-validation behavior parity, form-side dropdown source endpoints (/skills/trades, /skills/trades/<trade>/job-types) shape consistency.