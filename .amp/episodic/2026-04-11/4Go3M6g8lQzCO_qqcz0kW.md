---
id: 4Go3M6g8lQzCO_qqcz0kW
session_id: session-20260410-na-rules
agent_id: mcp
task: [project:agent-assist-cr] Implement instant N/A rules for HVAC probing questions
outcome: approved
created_at: "2026-04-11T04:41:21.698Z"
---

[project:agent-assist-cr] Created src/engine/probing_na_rules.py — Tier 1 deterministic rule engine. Key decisions: (1) word-boundary regex in _match_any to prevent "furnace" matching "ac"; (2) fail-open empty set when trade/equipment_type is None; (3) question ID constants grouped by job type variant (_HVAC_FUEL_IDS covers mb/est/maint variants). 13 tests pass, 662 total. Committed as feat(probing): add instant N/A rules for HVAC trade.