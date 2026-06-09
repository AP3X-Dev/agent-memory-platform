---
id: WFPi2NpXxC6WcYZu9v7iz
session_id: session-20260527-120000
agent_id: mcp
task: [project:agent-assist-cr] Task 2: Add gas-line equipment regex and trade map entry to normalize.py
outcome: approved
created_at: "2026-05-28T03:20:02.271Z"
---

[project:agent-assist-cr] Completed Task 2 of trade-classification-fix plan. Added gas-line regex to top of _EQUIPMENT_PATTERNS in normalize.py — narrow pattern matching only service contexts (gas leak/line/smell/odor, smell of gas, natural gas) to avoid over-matching "gas station", "gas mileage", "gas grill". Re-added gas_line→Plumbing to _EQUIPMENT_TO_TRADE after water_softener. "gas furnace" correctly returns "furnace" (not gas_line) because the gas pattern only fires on service-context suffixes, not bare "gas" before a known appliance. Added 12 new parametrized tests. 66/66 pass. ruff+mypy clean. Commit a114615 on trade-classification-fix branch.