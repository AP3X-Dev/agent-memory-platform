---
id: T3hbFT2VBHeN1LP4D17oP
session_id: cic2-parity-2026-03-28
agent_id: mcp
task: [project:cic2] Parity: Canonical trade/job-type normalization (5d)
outcome: approved
created_at: "2026-03-28T09:40:56.162Z"
---

[project:cic2] Ported CIC1's _normalize_trade/_normalize_job_type from orchestrator.py to the hysteresis module. Added normalize_trade() and normalize_job_type() with lookup tables mapping lowercase to canonical forms (HVAC, Plumbing, Drains, Electrical, Generator; Must Book, Demand Service, Maintenance, Estimate, After Hours). Added _clean_null() to convert LLM "null"/"None"/"" strings to actual None. Integrated into TradeClassifier.classify() before hysteresis is applied, ensuring all trade values stored in the DB use canonical capitalization. 7 new tests.