---
id: e5esBa1rbYfCG-0jnbrdx
session_id: session-20260527-000000
agent_id: mcp
task: [project:agent-assist-cr] Task 1 of trade-classification-fix: equipment→trade lookup table in normalize.py
outcome: approved
created_at: "2026-05-28T03:08:16.546Z"
---

[project:agent-assist-cr] Added _EQUIPMENT_TO_TRADE dict, _INTENTIONALLY_UNMAPPED frozenset, and equipment_to_trade() function to normalize.py. Key decision: water_heater and tankless_water_heater map to Plumbing (not HVAC) by default — this is the root fix for the beta water-heater misclassification bug. Per-client overrides are deferred to sop_matcher level. drift guard test (test_equipment_pattern_trade_coverage_no_drift) ensures every new _EQUIPMENT_PATTERNS token must be mapped or explicitly skipped. Ruff E402 caught mid-file import; fixed by merging into existing top-level import block.