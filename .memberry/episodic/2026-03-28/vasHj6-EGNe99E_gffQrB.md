---
id: vasHj6-EGNe99E_gffQrB
session_id: cic2-parity-2026-03-28
agent_id: mcp
task: [project:cic2] Parity: Interactive trade/job type selector + checklist rebuild (19a, 19b)
outcome: approved
created_at: "2026-03-28T09:05:59.595Z"
---

[project:cic2] Converted TradeSelector from read-only badges to interactive dropdowns matching CIC1's trade-selector.js. Trade dropdown lists 4 trades (HVAC, Plumbing, Drains, Electrical). Job type dropdown lists 4 types (Demand Service, Must Book, Maintenance, Estimate) — disabled until trade is selected. On change, sends RebuildChecklist WebSocket command. Backend handler finds active session, calls ChecklistBuilder.build(sid, trade, job_type), then pushes updated assist_projection via StreamRouter. Auto-detected values from the LLM still populate the dropdowns via the assist store.